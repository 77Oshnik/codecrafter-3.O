"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Plus, BookOpen, Trash2, Loader2, Brain, Trophy, Clock } from "lucide-react"
import { NewPathModal } from "@/components/learning/NewPathModal"
import { AssessmentView } from "@/components/learning/AssessmentView"
import { AssessmentResult } from "@/components/learning/AssessmentResult"
import {
  listLearningPaths,
  getLearningDashboard,
  startLearningAssessment,
  submitLearningAssessment,
  deleteLearningPath,
  type LearningPathSummary,
  type AssessmentQuestion
} from "@/lib/api"

type Stage =
  | { type: "list" }
  | { type: "new-path" }
  | { type: "assessment"; assessmentId: string; topic: string; questions: AssessmentQuestion[] }
  | { type: "result"; learningPathId: string; topic: string; score: number; level: "beginner" | "intermediate" | "advanced"; explanation: string; strengths: string[]; weaknesses: string[]; recommendation: string; totalTopics: number }

const LEVEL_COLORS = {
  beginner: "text-green-500",
  intermediate: "text-yellow-500",
  advanced: "text-blue-500"
}

const STATUS_COLORS = {
  assessing: "text-muted-foreground",
  active: "text-primary",
  completed: "text-green-500"
}

const STATUS_BADGE = {
  assessing: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  completed: "bg-green-500/10 text-green-600"
}

export default function LearnPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const token = (session?.user as { backendToken?: string })?.backendToken ?? ""

  const [stage, setStage] = useState<Stage>({ type: "list" })
  const [paths, setPaths] = useState<LearningPathSummary[]>([])
  const [webcam, setWebcam] = useState({ sessions: 0, focusedMinutes: 0, awayMinutes: 0, avgFocusScore: 0 })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const totalPaths = paths.length
  const activePaths = paths.filter(p => p.status === "active").length
  const completedPaths = paths.filter(p => p.status === "completed").length
  const avgProgress = paths.length
    ? Math.round(paths.reduce((sum, p) => sum + (p.overallProgress || 0), 0) / paths.length)
    : 0

  useEffect(() => {
    if (!token) return
    listLearningPaths(token)
      .then(setPaths)
      .catch(console.error)
      .finally(() => setLoading(false))

    getLearningDashboard(token)
      .then(data => {
        if (data.webcam) {
          setWebcam({
            sessions: data.webcam.sessions || 0,
            focusedMinutes: data.webcam.focusedMinutes || 0,
            awayMinutes: data.webcam.awayMinutes || 0,
            avgFocusScore: data.webcam.avgFocusScore || 0,
          })
        }
      })
      .catch(() => undefined)
  }, [token])

  const handleStartPath = async (topic: string) => {
    const { assessmentId, questions } = await startLearningAssessment(token, topic)
    setStage({ type: "assessment", assessmentId, topic, questions })
  }

  const handleSubmitAssessment = async (answers: number[]) => {
    if (stage.type !== "assessment") return
    const result = await submitLearningAssessment(token, stage.assessmentId, answers)
    setStage({
      type: "result",
      learningPathId: result.learningPathId,
      topic: stage.topic,
      score: result.score,
      level: result.level,
      explanation: result.explanation,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      recommendation: result.recommendation,
      totalTopics: result.totalTopics
    })
    // Refresh paths list in background
    listLearningPaths(token).then(setPaths).catch(console.error)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this learning path and all progress?")) return
    setDeleting(id)
    try {
      await deleteLearningPath(token, id)
      setPaths(p => p.filter(x => x._id !== id))
    } finally {
      setDeleting(null)
    }
  }

  if (stage.type === "assessment") {
    return (
      <AssessmentView
        topic={stage.topic}
        questions={stage.questions}
        onSubmit={handleSubmitAssessment}
        onCancel={() => setStage({ type: "list" })}
      />
    )
  }

  if (stage.type === "result") {
    return (
      <AssessmentResult
        score={stage.score}
        level={stage.level}
        explanation={stage.explanation}
        strengths={stage.strengths}
        weaknesses={stage.weaknesses}
        recommendation={stage.recommendation}
        learningPathId={stage.learningPathId}
        topic={stage.topic}
        totalTopics={stage.totalTopics}
      />
    )
  }

  return (
    <>
      {stage.type === "new-path" && (
        <NewPathModal
          onClose={() => setStage({ type: "list" })}
          onStart={handleStartPath}
        />
      )}

      <div className="flex flex-col w-full h-full overflow-hidden bg-muted/10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Learning Paths</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Build, track, and complete personalized roadmaps.
            </p>
          </div>
          <button
            onClick={() => setStage({ type: "new-path" })}
            className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Path
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : paths.length === 0 ? (
            <div className="max-w-xl mx-auto flex flex-col items-center justify-center py-24 text-center border border-dashed border-border rounded-2xl bg-background/70">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Start Your Learning Journey</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6 px-4">
                Enter any topic — we&apos;ll assess your level and create a personalized roadmap with AI-powered content, quizzes, and spaced repetition.
              </p>
              <button
                onClick={() => setStage({ type: "new-path" })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                Create Learning Path
              </button>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-border rounded-xl p-4 bg-background">
                  <p className="text-xs text-muted-foreground">Total Paths</p>
                  <p className="text-2xl font-semibold mt-1">{totalPaths}</p>
                </div>
                <div className="border border-border rounded-xl p-4 bg-background">
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="text-2xl font-semibold mt-1 text-primary">{activePaths}</p>
                </div>
                <div className="border border-border rounded-xl p-4 bg-background">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-2xl font-semibold mt-1 text-green-600">{completedPaths}</p>
                </div>
                <div className="border border-border rounded-xl p-4 bg-background">
                  <p className="text-xs text-muted-foreground">Avg Progress</p>
                  <p className="text-2xl font-semibold mt-1">{avgProgress}%</p>
                </div>
              </div>

              <div className="border border-border rounded-xl p-4 bg-background">
                <p className="text-sm font-semibold">Webcam Tracer</p>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <span>Sessions: <span className="font-semibold text-foreground">{webcam.sessions}</span></span>
                  <span>Focused: <span className="font-semibold text-foreground">{webcam.focusedMinutes}m</span></span>
                  <span>Away: <span className="font-semibold text-foreground">{webcam.awayMinutes}m</span></span>
                  <span>Focus score: <span className="font-semibold text-foreground">{webcam.avgFocusScore}%</span></span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {paths.map(path => (
                  <div
                    key={path._id}
                    className="group border border-border rounded-2xl p-4 bg-background hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => router.push(`/dashboard/learn/${path._id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold truncate">{path.topic}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${STATUS_BADGE[path.status]}`}>
                            {path.status}
                          </span>
                          <span className={`text-[11px] capitalize font-medium ${LEVEL_COLORS[path.userLevel] || "text-muted-foreground"}`}>
                            {path.userLevel}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(path._id) }}
                        disabled={deleting === path._id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        {deleting === path._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="mt-4 flex items-center gap-4">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Trophy className="w-3.5 h-3.5" />
                        {path.completedTopics}/{path.totalTopics} topics
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {path.lastActiveAt ? new Date(path.lastActiveAt).toLocaleDateString() : "Not started"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${path.overallProgress}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-primary">{path.overallProgress}%</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-xs capitalize ${STATUS_COLORS[path.status]}`}>
                        {path.status === "completed" ? "Completed" : "In progress"}
                      </span>
                      <span className="text-xs text-primary font-medium">Open Path →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
