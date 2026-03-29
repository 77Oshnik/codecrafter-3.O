"use client"

import { useRouter } from "next/navigation"
import { CheckCircle, TrendingUp, TrendingDown, ArrowRight, Loader2 } from "lucide-react"
import { useState } from "react"

interface Props {
  score: number
  level: "beginner" | "intermediate" | "advanced"
  explanation: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  learningPathId: string
  topic: string
  totalTopics: number
}

const LEVEL_CONFIG = {
  beginner: { color: "text-green-500", bg: "bg-green-500/10 border-green-500/20", label: "Beginner" },
  intermediate: { color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Intermediate" },
  advanced: { color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", label: "Advanced" }
}

export function AssessmentResult({ score, level, explanation, strengths, weaknesses, recommendation, learningPathId, topic, totalTopics }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const cfg = LEVEL_CONFIG[level]

  const handleStart = () => {
    setLoading(true)
    router.push(`/dashboard/learn/${learningPathId}`)
  }

  return (
    <div className="w-full h-full overflow-y-auto flex items-start justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-1">Assessment Complete!</h1>
          <p className="text-sm text-muted-foreground">
            You scored <span className="font-semibold text-foreground">{score}%</span> on {topic}
          </p>
        </div>

        {/* Level badge */}
        <div className={`border rounded-xl p-4 mb-4 text-center ${cfg.bg}`}>
          <p className="text-xs text-muted-foreground mb-1">Your Level</p>
          <p className={`text-2xl font-bold capitalize ${cfg.color}`}>{cfg.label}</p>
          <p className="text-sm text-muted-foreground mt-2">{explanation}</p>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {strengths.length > 0 && (
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium">Strengths</span>
              </div>
              <ul className="space-y-1">
                {strengths.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium">Areas to Improve</span>
              </div>
              <ul className="space-y-1">
                {weaknesses.slice(0, 3).map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recommendation */}
        {recommendation && (
          <div className="border border-border rounded-lg p-3 mb-5 bg-muted/20">
            <p className="text-xs text-muted-foreground leading-relaxed">{recommendation}</p>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground mb-4">
          Your personalized roadmap has <span className="font-medium text-foreground">{totalTopics} topics</span> tailored for your level.
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {loading ? "Opening roadmap..." : "View My Roadmap"}
        </button>
      </div>
    </div>
  )
}
