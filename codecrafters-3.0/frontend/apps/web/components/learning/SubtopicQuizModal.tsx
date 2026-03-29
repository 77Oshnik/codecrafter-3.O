"use client"

import { useState } from "react"
import { X, Loader2, CheckCircle, XCircle, Trophy, RotateCcw, ArrowRight, BrainCircuit, GitBranch, AlertTriangle } from "lucide-react"
import type { LearningQuizQuestion, LearningQuizSubmitResult } from "@/lib/api"

interface Props {
  quizId: string
  questions: LearningQuizQuestion[]
  onSubmit: (quizId: string, answers: number[]) => Promise<LearningQuizSubmitResult>
  onClose: () => void
  onNext?: (nextInfo: LearningQuizSubmitResult["nextInfo"]) => void
}

export function SubtopicQuizModal({ quizId, questions, onSubmit, onClose, onNext }: Props) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null))
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<LearningQuizSubmitResult | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const question = questions[current]
  const allAnswered = answers.every(a => a !== null)

  const select = (idx: number) => {
    if (result) return
    const next = [...answers]
    next[current] = idx
    setAnswers(next)
    if (current < questions.length - 1) {
      setTimeout(() => setCurrent(c => c + 1), 300)
    }
  }

  const handleSubmit = async () => {
    if (!allAnswered) return
    setSubmitError("")
    console.log("[SubtopicQuizModal] submit clicked", {
      quizId,
      currentQuestion: current,
      totalQuestions: questions.length,
      answers,
    })
    setSubmitting(true)
    try {
      const res = await onSubmit(quizId, answers as number[])
      console.log("[SubtopicQuizModal] submit succeeded", {
        quizId,
        percentage: res.percentage,
        passed: res.passed,
      })
      setResult(res)
    } catch (error) {
      console.error("[SubtopicQuizModal] submit failed", {
        quizId,
        answers,
        error,
      })
      setSubmitError(error instanceof Error ? error.message : "Failed to submit quiz")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = () => {
    setAnswers(Array(questions.length).fill(null))
    setCurrent(0)
    setResult(null)
    setShowReview(false)
  }

  const getSeverityClass = (severity: "low" | "medium" | "high") => {
    if (severity === "high") return "text-red-500 bg-red-500/10 border-red-500/20"
    if (severity === "low") return "text-green-500 bg-green-500/10 border-green-500/20"
    return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20"
  }

  const rootCause = result?.rootCauseAnalysis
  const misconceptionData = rootCause?.visualData?.misconceptionBreakdown?.length
    ? rootCause.visualData.misconceptionBreakdown
    : rootCause?.misconceptions || []
  const graphNodes = rootCause?.visualData?.prerequisiteGraph?.nodes || []
  const graphEdges = rootCause?.visualData?.prerequisiteGraph?.edges || []
  const highestMisconceptionCount = misconceptionData.reduce((max, item) => Math.max(max, item.count), 1)
  const activeQuestion: LearningQuizQuestion = question ?? {
    index: current,
    question: "Quiz question unavailable.",
    options: []
  }

  const shortenLabel = (label: string, max = 26) => {
    if (!label) return "Unknown"
    return label.length > max ? `${label.slice(0, max - 1)}…` : label
  }

  const typeRank = (type: string) => {
    if (type === "prerequisite" || type === "topic") return 0
    if (type === "target") return 1
    if (type === "misconception") return 2
    return 1
  }

  const graphModel = (() => {
    const nodeById = new Map<string, { id: string; label: string; type: string }>()

    graphNodes.forEach((n) => {
      if (!n?.id) return
      nodeById.set(n.id, {
        id: n.id,
        label: n.label || n.id,
        type: n.type || "target"
      })
    })

    graphEdges.forEach((e) => {
      if (e?.from && !nodeById.has(e.from)) {
        nodeById.set(e.from, { id: e.from, label: e.from, type: "target" })
      }
      if (e?.to && !nodeById.has(e.to)) {
        nodeById.set(e.to, { id: e.to, label: e.to, type: "target" })
      }
    })

    const nodes = Array.from(nodeById.values())
    const adjacency = new Map<string, string[]>()
    const indegree = new Map<string, number>()

    nodes.forEach((n) => {
      adjacency.set(n.id, [])
      indegree.set(n.id, 0)
    })

    const edges = graphEdges
      .filter((e) => e?.from && e?.to && nodeById.has(e.from) && nodeById.has(e.to))
      .map((e) => ({ ...e, inferred: false as const }))
    edges.forEach((e) => {
      adjacency.get(e.from)?.push(e.to)
      indegree.set(e.to, (indegree.get(e.to) || 0) + 1)
    })

    const levels = new Map<string, number>()
    const queue = nodes
      .filter((n) => (indegree.get(n.id) || 0) === 0)
      .sort((a, b) => {
        const rankDiff = typeRank(a.type) - typeRank(b.type)
        if (rankDiff !== 0) return rankDiff
        return a.label.localeCompare(b.label)
      })

    queue.forEach((n) => levels.set(n.id, typeRank(n.type)))

    const q = [...queue]
    while (q.length) {
      const current = q.shift()
      if (!current) break

      const currentLevel = levels.get(current.id) ?? typeRank(current.type)
      const next = adjacency.get(current.id) || []
      next.forEach((id) => {
        const nextNode = nodeById.get(id)
        if (!nextNode) return

        const suggested = Math.max(currentLevel + 1, typeRank(nextNode.type))
        levels.set(id, Math.max(levels.get(id) ?? 0, suggested))

        const left = (indegree.get(id) || 0) - 1
        indegree.set(id, left)
        if (left === 0) q.push(nextNode)
      })
    }

    nodes.forEach((n) => {
      if (!levels.has(n.id)) levels.set(n.id, typeRank(n.type))
    })

    const columns = new Map<number, { id: string; label: string; type: string }[]>()
    nodes.forEach((n) => {
      const level = levels.get(n.id) || 0
      const list = columns.get(level) || []
      list.push(n)
      columns.set(level, list)
    })

    const sortedColumnKeys = Array.from(columns.keys()).sort((a, b) => a - b)
    sortedColumnKeys.forEach((k) => {
      columns.get(k)?.sort((a, b) => {
        const rankDiff = typeRank(a.type) - typeRank(b.type)
        if (rankDiff !== 0) return rankDiff
        return a.label.localeCompare(b.label)
      })
    })

    const NODE_W = 210
    const NODE_H = 44
    const COL_GAP = 220
    const ROW_GAP = 26
    const PADDING_X = 40

    const maxRows = Math.max(...Array.from(columns.values()).map((col) => col.length), 1)
    const height = Math.max(320, maxRows * (NODE_H + ROW_GAP) + 70)
    const width = Math.max(1000, (sortedColumnKeys.length || 1) * NODE_W + Math.max(0, sortedColumnKeys.length - 1) * COL_GAP + PADDING_X * 2)

    const nodePositions = new Map<string, { cx: number; cy: number; label: string; type: string }>()
    sortedColumnKeys.forEach((level, colIdx) => {
      const col = columns.get(level) || []
      const colHeight = col.length * NODE_H + Math.max(0, col.length - 1) * ROW_GAP
      const top = Math.max(24, (height - colHeight) / 2)
      const cx = PADDING_X + NODE_W / 2 + colIdx * (NODE_W + COL_GAP)

      col.forEach((node, idx) => {
        const cy = top + NODE_H / 2 + idx * (NODE_H + ROW_GAP)
        nodePositions.set(node.id, { cx, cy, label: node.label, type: node.type })
      })
    })

    // Connectivity fix: keep all nodes connected by adding minimal inferred links.
    const outgoing = new Map<string, number>()
    const incoming = new Map<string, number>()
    nodes.forEach((n) => {
      outgoing.set(n.id, 0)
      incoming.set(n.id, 0)
    })

    edges.forEach((e) => {
      outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1)
      incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
    })

    const inferredEdges: Array<{ from: string; to: string; reason: string; weight: number; inferred: true }> = []

    const addInferredEdge = (from: string, to: string, reason: string) => {
      if (!from || !to || from === to) return
      const exists = edges.some((e) => e.from === from && e.to === to)
        || inferredEdges.some((e) => e.from === from && e.to === to)
      if (exists) return

      inferredEdges.push({ from, to, reason, weight: 1, inferred: true })
      outgoing.set(from, (outgoing.get(from) || 0) + 1)
      incoming.set(to, (incoming.get(to) || 0) + 1)
    }

    const maxLevel = Math.max(...sortedColumnKeys, 0)

    // 1) Nodes without incoming edges (except level 0) get linked from nearest previous level node.
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0
      if (level === 0 || (incoming.get(node.id) || 0) > 0) return

      for (let l = level - 1; l >= 0; l -= 1) {
        const candidates = columns.get(l) || []
        if (!candidates.length) continue
        const from = candidates[0]?.id
        if (from) {
          addInferredEdge(from, node.id, "Inferred prerequisite link")
          break
        }
      }
    })

    // 2) Nodes without outgoing edges (except last level) get linked to nearest next level node.
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0
      if (level >= maxLevel || (outgoing.get(node.id) || 0) > 0) return

      for (let l = level + 1; l <= maxLevel; l += 1) {
        const candidates = columns.get(l) || []
        if (!candidates.length) continue
        const to = candidates[0]?.id
        if (to) {
          addInferredEdge(node.id, to, "Inferred progression link")
          break
        }
      }
    })

    return {
      nodes,
      edges: [...edges, ...inferredEdges],
      nodePositions,
      width,
      height,
      nodeWidth: NODE_W,
      nodeHeight: NODE_H
    }
  })()

  const graphLabel = (id: string) => graphModel.nodePositions.get(id)?.label || id

  const getNodeStyle = (type: string) => {
    if (type === "target") return { fill: "#dbeafe", stroke: "#60a5fa" }
    if (type === "misconception") return { fill: "#fee2e2", stroke: "#f87171" }
    return { fill: "#fef3c7", stroke: "#f59e0b" }
  }

  if (!question && !result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
          <p className="text-sm text-muted-foreground">Quiz question is unavailable.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
            Close
          </button>
        </div>
      </div>
    )
  }

  if (result && !showReview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-6">
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            result.passed ? "bg-green-500/10" : "bg-red-500/10"
          }`}>
            {result.passed ? (
              <Trophy className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
          </div>

          <h2 className="text-lg font-semibold mb-1">
            {result.passed ? "Great Work!" : "Keep Practicing"}
          </h2>
          <p className="text-4xl font-bold my-3 text-center">{result.percentage}%</p>
          <p className="text-sm text-muted-foreground mb-1">
            {result.score}/{result.total} correct
          </p>
          <p className="text-xs text-muted-foreground mb-4 text-center">{result.message}</p>

          <div className="bg-muted/30 rounded-lg p-3 mb-5 text-left">
            <p className="text-xs text-muted-foreground">Confidence Score</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${result.confidenceScore >= 80 ? "bg-green-500" : result.confidenceScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${result.confidenceScore}%` }}
                />
              </div>
              <span className="text-xs font-medium">{result.confidenceScore}%</span>
            </div>
            {result.nextReviewAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Next review: {new Date(result.nextReviewAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {rootCause ? (
            <div className="space-y-4 mb-5">
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <BrainCircuit className="w-4 h-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-primary">Root Cause Summary</p>
                    <p className="text-xs text-muted-foreground mt-1">{rootCause.summary}</p>
                    <p className="text-xs mt-2">Likely root cause: <span className="font-medium">{rootCause.likelyRootCause}</span></p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold mb-2">Misconception Heatmap</p>
                  <div className="space-y-2">
                    {misconceptionData.length > 0 ? misconceptionData.map((item, i) => (
                      <div key={`${item.label}-${i}`}>
                        <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                          <span className="truncate">{item.label}</span>
                          <span className={`px-1.5 py-0.5 rounded-full border ${getSeverityClass(item.severity)}`}>
                            {item.severity}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.severity === "high" ? "bg-red-500" : item.severity === "low" ? "bg-green-500" : "bg-yellow-500"}`}
                            style={{ width: `${Math.max(15, Math.round((item.count / highestMisconceptionCount) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">No strong misconception clusters detected.</p>}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold mb-2">Prerequisite Gaps</p>
                  <div className="space-y-2">
                    {rootCause.prerequisiteGaps.length > 0 ? rootCause.prerequisiteGaps.map((gap, i) => (
                      <div key={`${gap.topic}-${i}`} className="rounded-md border border-border/70 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium truncate">{gap.topic}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getSeverityClass(gap.severity)}`}>
                            {gap.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{gap.reason}</p>
                        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.max(10, Math.min(100, gap.confidence || 0))}%` }} />
                        </div>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">No major prerequisite blockers were detected.</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">Where You Went Wrong (Causal Map)</p>
                </div>
                {graphModel.nodes.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Prerequisite</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Target</span>
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">Misconception</span>
                    </div>
                    <div className="w-full overflow-x-auto rounded-lg border border-border/60 bg-muted/20">
                      <svg viewBox={`0 0 ${graphModel.width} ${graphModel.height}`} className="min-w-225 w-full h-90">
                        <defs>
                          <marker id="rca-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L8,4 L0,8 z" fill="#64748b" />
                          </marker>
                        </defs>

                        {graphModel.edges.map((edge, i) => {
                          const from = graphModel.nodePositions.get(edge.from)
                          const to = graphModel.nodePositions.get(edge.to)
                          if (!from || !to) return null

                          const fromX = from.cx + graphModel.nodeWidth / 2
                          const fromY = from.cy
                          const toX = to.cx - graphModel.nodeWidth / 2
                          const toY = to.cy

                          const forward = toX > fromX
                          const curveBase = Math.max(50, Math.abs(toX - fromX) * 0.35)
                          const ctrl1X = forward ? fromX + curveBase : fromX + 80
                          const ctrl2X = forward ? toX - curveBase : toX - 80
                          const d = `M ${fromX} ${fromY} C ${ctrl1X} ${fromY}, ${ctrl2X} ${toY}, ${toX} ${toY}`

                          return (
                            <g key={`${edge.from}-${edge.to}-${i}`}>
                              <path
                                d={d}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="1.8"
                                strokeDasharray={edge.inferred ? "4 4" : undefined}
                                markerEnd="url(#rca-arrowhead)"
                              />
                            </g>
                          )
                        })}

                        {graphModel.nodes.map((node, i) => {
                          const pos = graphModel.nodePositions.get(node.id)
                          if (!pos) return null
                          const style = getNodeStyle(pos.type)

                          return (
                            <g key={`${node.id}-${i}`}>
                              <rect
                                x={pos.cx - graphModel.nodeWidth / 2}
                                y={pos.cy - graphModel.nodeHeight / 2}
                                width={graphModel.nodeWidth}
                                height={graphModel.nodeHeight}
                                rx="10"
                                fill={style.fill}
                                stroke={style.stroke}
                                strokeWidth="1.2"
                              />
                              <text
                                x={pos.cx}
                                y={pos.cy + 4}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#0f172a"
                                style={{ userSelect: "none" }}
                              >
                                {shortenLabel(node.label)}
                              </text>
                            </g>
                          )
                        })}
                      </svg>
                    </div>

                    <div className="space-y-1.5">
                      {graphModel.edges.slice(0, 8).map((edge, i) => (
                        <p key={`${edge.from}-${edge.to}-reason-${i}`} className="text-[11px] text-muted-foreground">
                          <span className="text-foreground">{graphLabel(edge.from)}</span> → <span className="text-foreground">{graphLabel(edge.to)}</span> · {edge.reason}
                          {edge.inferred ? " (auto-linked)" : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Graph data will appear after more quiz attempts.</p>
                )}
              </div>

              {rootCause.remediationPlan.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold mb-2">Targeted Intervention Plan</p>
                  <div className="space-y-2">
                    {rootCause.remediationPlan.map((step) => (
                      <div key={step.step} className="rounded-md border border-border/70 p-2">
                        <p className="text-xs font-medium">{step.step}. {step.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{step.description}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Practice: <span className="text-foreground">{step.recommendedProblems}</span> questions · Success metric: <span className="text-foreground">{step.successMetric}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              onClick={() => setShowReview(true)}
              className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Review Answers
            </button>
            {result.passed ? (
              result.nextInfo ? (
                <button
                  onClick={() => onNext?.(result.nextInfo)}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                >
                  {result.nextInfo.subtopicType === "revision" ? "Go To Revision" : "Next"} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
                  Done
                </button>
              )
            ) : result.nextInfo ? (
              <button
                onClick={() => onNext?.(result.nextInfo)}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                {result.nextInfo.subtopicType === "revision" ? "Start Revision" : "Continue"} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleRetry}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (result && showReview) {
    const analysisByQuestionIndex = new Map(
      (result.rootCauseAnalysis?.wrongAnswerAnalyses || []).map(item => [item.questionIndex, item])
    )

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold">Answer Review</h2>
            <button onClick={() => setShowReview(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {result.feedback.map((fb, i) => (
              <div key={i} className={`border rounded-lg p-3 ${fb.isCorrect ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-start gap-2 mb-2">
                  {fb.isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <p className="text-xs font-medium">{fb.question}</p>
                </div>
                <p className="text-xs text-muted-foreground ml-6">{fb.explanation}</p>
                {!fb.isCorrect && analysisByQuestionIndex.get(i) ? (
                  <div className="ml-6 mt-2 space-y-1">
                    <p className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-500">
                      <AlertTriangle className="w-3 h-3" /> {analysisByQuestionIndex.get(i)?.misconception}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Why this happened:</span> {analysisByQuestionIndex.get(i)?.whyWrong}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Context-based fix:</span> {analysisByQuestionIndex.get(i)?.ragExplanation}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border">
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Subtopic Quiz</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{current + 1}/{questions.length}</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
        </div>

        <div className="p-5">
          <p className="text-sm font-medium mb-4 leading-relaxed">{activeQuestion.question}</p>
          <div className="space-y-2">
            {activeQuestion.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => select(i)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                  answers[current] === i
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-4 gap-2">
          {submitError ? (
            <p className="text-xs text-destructive flex-1">{submitError}</p>
          ) : (
            <div className="flex-1" />
          )}

          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
          >
            ← Back
          </button>

          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? "Submitting..." : "Submit Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
