"use client"

import { Timer } from "lucide-react"
import { useStudySession } from "@/contexts/StudySessionContext"

export function StartStudySessionButton() {
  const { phase, openSetup } = useStudySession()

  if (phase !== "idle") {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        Session Active
      </div>
    )
  }

  return (
    <button
      onClick={openSetup}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
    >
      <Timer className="w-4 h-4" />
      Start Study Session
    </button>
  )
}
