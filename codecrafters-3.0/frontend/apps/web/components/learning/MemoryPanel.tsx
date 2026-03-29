"use client"

import { useEffect, useState } from "react"
import { Brain, Calendar, Zap, AlertTriangle, Loader2 } from "lucide-react"
import { getMemoryData } from "@/lib/api"
import type { MemoryItem } from "@/lib/api"

interface Props {
  pathId: string
  token: string
}

export function MemoryPanel({ pathId, token }: Props) {
  const [data, setData] = useState<{ dueToday: MemoryItem[]; upcoming: MemoryItem[]; mastered: MemoryItem[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMemoryData(token, pathId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [pathId, token])

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Memory & Spaced Repetition</h3>
      </div>

      {/* Due today */}
      {data.dueToday.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            <p className="text-xs font-medium text-yellow-600">Due for Review ({data.dueToday.length})</p>
          </div>
          <div className="space-y-1.5">
            {data.dueToday.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                <div>
                  <p className="text-xs font-medium">{item.subtopicTitle}</p>
                  <p className="text-xs text-muted-foreground">{item.topicTitle}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${item.confidenceScore >= 80 ? "text-green-500" : item.confidenceScore >= 60 ? "text-yellow-500" : "text-red-500"}`}>
                    {item.confidenceScore}%
                  </p>
                  <p className="text-xs text-muted-foreground">confidence</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {data.upcoming.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-xs font-medium">Upcoming Reviews ({data.upcoming.length})</p>
          </div>
          <div className="space-y-1.5">
            {data.upcoming.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border">
                <div>
                  <p className="text-xs font-medium">{item.subtopicTitle}</p>
                  <p className="text-xs text-muted-foreground">{item.topicTitle}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.nextReviewAt ? new Date(item.nextReviewAt).toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mastered */}
      {data.mastered.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-green-500" />
            <p className="text-xs font-medium text-green-600">Mastered ({data.mastered.length})</p>
          </div>
          <div className="space-y-1.5">
            {data.mastered.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/5">
                <div>
                  <p className="text-xs font-medium">{item.subtopicTitle}</p>
                  <p className="text-xs text-muted-foreground">{item.topicTitle}</p>
                </div>
                <p className="text-xs font-semibold text-green-500">{item.confidenceScore}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.dueToday.length === 0 && data.upcoming.length === 0 && data.mastered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Complete subtopic quizzes to build your memory data.
        </p>
      )}
    </div>
  )
}
