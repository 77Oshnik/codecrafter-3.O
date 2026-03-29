"use client"

import { useState } from "react"
import { X, BookOpen, Loader2 } from "lucide-react"

interface Props {
  onClose: () => void
  onStart: (topic: string) => Promise<void>
}

const SUGGESTIONS = [
  "Machine Learning", "Data Structures & Algorithms", "Blockchain",
  "React.js", "System Design", "Python", "Web3", "Computer Networks",
  "Operating Systems", "Database Management"
]

export function NewPathModal({ onClose, onStart }: Props) {
  const [topic, setTopic] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleStart = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setError("")
    try {
      await onStart(topic.trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Start Learning</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Enter any topic and we&apos;ll assess your level and build a personalized roadmap.
        </p>

        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleStart()}
          placeholder="e.g. Machine Learning, DSA, Blockchain..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
          autoFocus
        />

        <div className="flex flex-wrap gap-1.5 mb-5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setTopic(s)}
              className="px-2.5 py-1 text-xs rounded-full border border-border hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        <button
          onClick={handleStart}
          disabled={!topic.trim() || loading}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating assessment...
            </>
          ) : (
            "Start Assessment"
          )}
        </button>
      </div>
    </div>
  )
}
