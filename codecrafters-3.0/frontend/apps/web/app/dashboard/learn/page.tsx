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

export default function LearnPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const token = (session?.user as { backendToken?: string })?.backendToken ?? ""

  const [stage, setStage] = useState<Stage>({ type: "list" })
  const [paths, setPaths] = useState<LearningPathSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    listLearningPaths(token)
      .then(setPaths)
      .catch(console.error)
      .finally(() => setLoading(false))
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

      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-background flex-shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Learning Paths</span>
          </div>
          <button
            onClick={() => setStage({ type: "new-path" })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            New Path
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : paths.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-2">Start Your Learning Journey</h2>
              <p className="text-sm text-muted-foreground max-w-sm mb-5">
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
            <div className="max-w-2xl mx-auto space-y-3">
              {paths.map(path => (
                <div
                  key={path._id}
                  className="group border border-border rounded-xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/learn/${path._id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold truncate">{path.topic}</h3>
                        <span className={`text-xs capitalize font-medium ${LEVEL_COLORS[path.userLevel] || "text-muted-foreground"}`}>
                          {path.userLevel}
                        </span>
                        <span className={`text-xs capitalize ${STATUS_COLORS[path.status]}`}>
                          • {path.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mb-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Trophy className="w-3 h-3" />
                          {path.completedTopics}/{path.totalTopics} topics
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {path.lastActiveAt ? new Date(path.lastActiveAt).toLocaleDateString() : "Not started"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${path.overallProgress}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-primary">{path.overallProgress}%</span>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
