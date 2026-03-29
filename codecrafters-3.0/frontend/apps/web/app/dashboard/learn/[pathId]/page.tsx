"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Loader2, Brain, Calendar } from "lucide-react"
import { RoadmapView } from "@/components/learning/RoadmapView"
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
  const [tab, setTab] = useState<"roadmap" | "memory">("roadmap")
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
            onClick={() => setTab("memory")}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-colors ${tab === "memory" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Calendar className="w-3 h-3" /> Memory
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "roadmap" ? (
          <RoadmapView path={path} />
        ) : (
          <div className="max-w-2xl mx-auto">
            <MemoryPanel pathId={pathId} token={token} />
          </div>
        )}
      </div>
    </div>
  )
}
