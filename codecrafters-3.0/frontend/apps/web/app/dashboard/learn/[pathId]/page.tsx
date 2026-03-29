"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Loader2, Brain, Calendar, Trophy, Activity } from "lucide-react"
import { RoadmapView } from "@/components/learning/RoadmapView"
import { RoadmapDiagram } from "@/components/learning/RoadmapDiagram"
import { MemoryPanel } from "@/components/learning/MemoryPanel"
import { getLearningPath, type LearningPath } from "@/lib/api"

export default function RoadmapPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const pathId = params.pathId as string
  const token = (session?.user as { backendToken?: string })?.backendToken ?? ""

  const [path, setPath] = useState<LearningPath | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"roadmap" | "diagram" | "memory">("roadmap")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token || !pathId) return
    getLearningPath(token, pathId)
      .then(setPath)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token, pathId])

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !path) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <p className="text-sm text-destructive mb-3">{error || "Learning path not found"}</p>
        <button onClick={() => router.push("/dashboard/learn")} className="text-sm text-primary hover:underline">
          Back to Learning Paths
        </button>
      </div>
    )
  }

  const allSubtopics = path.roadmap.flatMap(topic => topic.subtopics)
  const coreSubtopics = allSubtopics.filter(sub => (sub.type || "core") === "core")
  const completedCoreSubtopics = coreSubtopics.filter(sub => sub.status === "completed")
  const adaptiveSubtopics = allSubtopics.filter(sub => sub.adaptive)
  const scoredSubtopics = allSubtopics.filter(sub => typeof sub.quizScore === "number")
  const avgQuizScore = scoredSubtopics.length
    ? Math.round(scoredSubtopics.reduce((sum, sub) => sum + Number(sub.quizScore || 0), 0) / scoredSubtopics.length)
    : 0
  const completedTopics = typeof path.completedTopics === "number"
    ? path.completedTopics
    : path.roadmap.filter(topic => topic.status === "completed").length
  const totalTopics = path.totalTopics || path.roadmap.length

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/learn")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Paths
          </button>
          <span className="text-muted-foreground text-xs">/</span>
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-semibold truncate max-w-[200px]">{path.topic}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setTab("roadmap")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === "roadmap" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Roadmap
          </button>
          <button
            onClick={() => setTab("diagram")}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === "diagram" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Mindmap
          </button>
          <button
            onClick={() => setTab("memory")}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-colors ${tab === "memory" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Calendar className="w-3 h-3" /> Memory
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-6xl mx-auto space-y-4 mb-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-border rounded-xl bg-background p-4">
              <p className="text-xs text-muted-foreground">Overall Progress</p>
              <p className="text-2xl font-semibold text-primary mt-1">{path.overallProgress || 0}%</p>
            </div>
            <div className="border border-border rounded-xl bg-background p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Topic Completion
              </div>
              <p className="text-2xl font-semibold mt-1">{completedTopics}/{totalTopics}</p>
            </div>
            <div className="border border-border rounded-xl bg-background p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                Avg Quiz Score
              </div>
              <p className="text-2xl font-semibold mt-1">{avgQuizScore}%</p>
            </div>
            <div className="border border-border rounded-xl bg-background p-4">
              <p className="text-xs text-muted-foreground">Adaptive Steps</p>
              <p className="text-2xl font-semibold mt-1">{adaptiveSubtopics.length}</p>
            </div>
          </div>

          <div className="border border-border rounded-xl bg-background p-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Core subtopics: <span className="font-semibold text-foreground">{coreSubtopics.length}</span></span>
            <span>Completed core: <span className="font-semibold text-foreground">{completedCoreSubtopics.length}</span></span>
            <span>Last active: <span className="font-semibold text-foreground">{path.lastActiveAt ? new Date(path.lastActiveAt).toLocaleDateString() : "N/A"}</span></span>
          </div>
        </div>

        {tab === "roadmap" ? (
          <RoadmapView path={path} />
        ) : tab === "diagram" ? (
          <div className="max-w-6xl mx-auto">
            <RoadmapDiagram path={path} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <MemoryPanel pathId={pathId} token={token} />
          </div>
        )}
      </div>
    </div>
  )
}
