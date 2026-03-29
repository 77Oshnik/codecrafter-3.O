"use client"

import { useState } from "react"
import {
  Timer, X, Coffee, SkipForward, Camera, CameraOff, Play, CheckCircle2,
} from "lucide-react"
import { useStudySession } from "@/contexts/StudySessionContext"

const BREAK_DURATION_MS = 15 * 60 * 1000
const BREAK_EVERY_MS    = 60 * 60 * 1000

function fmtMs(ms: number): string {
  const s   = Math.max(0, Math.ceil(ms / 1000))
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

export function StudySessionFloatingTimer() {
  const {
    phase, totalTargetMs, elapsedMs, currentBlockMs, breakElapsedMs, faceDetected,
    cancelSetup, startSession, stopSession, takeBreak, skipBreak, resumeFromBreak,
  } = useStudySession()

  const [hours,   setHours]   = useState(1)
  const [minutes, setMinutes] = useState(0)

  if (phase === "idle") return null

  // ── Setup modal ────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const totalMin = hours * 60 + minutes
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
          <button
            onClick={cancelSetup}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Timer className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold">Start Study Session</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-6 pl-[42px]">
            Set your target duration. Camera face-tracking keeps you accountable. Break reminders every hour.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Hours</label>
              <input
                type="number"
                min={0}
                max={8}
                value={hours}
                onChange={e => setHours(Math.max(0, Math.min(8, Number(e.target.value) || 0)))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-xl bg-background text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Minutes</label>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={e => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-xl bg-background text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground mb-5 py-2.5 bg-muted/30 rounded-xl">
            Total:&nbsp;
            <span className="font-semibold text-foreground">
              {hours}h {String(minutes).padStart(2, "0")}m
            </span>
            &nbsp;•&nbsp;Break every 1 hour&nbsp;•&nbsp;15 min break duration
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { if (totalMin > 0) startSession(hours, minutes) }}
              disabled={totalMin === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              Start {totalMin > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m Session` : "Session"}
            </button>
            <button
              onClick={cancelSetup}
              className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Break prompt overlay ───────────────────────────────────────────────────
  if (phase === "break_prompt") {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center pb-6 bg-black/50 backdrop-blur-sm">
        <div className="bg-background border border-amber-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
          <div className="text-center mb-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
              <Coffee className="w-7 h-7 text-amber-500" />
            </div>
            <h2 className="text-base font-semibold">1 Hour Complete! 🎉</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Outstanding work! Take a well-deserved 15-minute break?
            </p>
          </div>

          <div className="flex justify-center gap-5 text-xs mb-5">
            <div className="text-center">
              <p className="text-muted-foreground">Studied</p>
              <p className="font-mono font-bold text-foreground text-base">{fmtMs(elapsedMs)}</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-muted-foreground">Remaining</p>
              <p className="font-mono font-bold text-foreground text-base">{fmtMs(Math.max(0, totalTargetMs - elapsedMs))}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={skipBreak}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip Break
            </button>
            <button
              onClick={takeBreak}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Coffee className="w-3.5 h-3.5" />
              Take 15 min Break
            </button>
          </div>
          <button
            onClick={stopSession}
            className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            End Session
          </button>
        </div>
      </div>
    )
  }

  // ── Completion overlay ─────────────────────────────────────────────────────
  if (phase === "completed") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-background border border-emerald-500/30 rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center mx-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold mb-1">Session Complete! 🎉</h2>
          <p className="text-sm text-muted-foreground mb-1">
            You studied for&nbsp;
            <span className="font-semibold text-foreground font-mono">{fmtMs(elapsedMs)}</span>
          </p>
          <p className="text-xs text-muted-foreground mb-6">
            Outstanding dedication. You should be very proud of yourself!
          </p>
          <button
            onClick={stopSession}
            className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Floating timer (running / break) ───────────────────────────────────────
  const isBreak            = phase === "break"
  const remainingMs        = isBreak
    ? Math.max(0, BREAK_DURATION_MS - breakElapsedMs)
    : Math.max(0, totalTargetMs - elapsedMs)
  const sessionProgressPct = totalTargetMs > 0
    ? Math.min(100, (elapsedMs / totalTargetMs) * 100)
    : 0
  const blockProgressPct   = Math.min(100, (currentBlockMs / BREAK_EVERY_MS) * 100)

  return (
    <div className="fixed bottom-5 right-5 z-50 select-none">
      <div
        className={`
          rounded-2xl border shadow-xl backdrop-blur-md bg-background/96 p-3.5 w-[220px]
          transition-[border-color,box-shadow] duration-500
          ${isBreak
            ? "border-amber-500/40"
            : faceDetected
              ? "border-emerald-500/35"
              : "border-destructive/40"
          }
        `}
      >
        {/* header row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`
                w-2 h-2 rounded-full flex-shrink-0
                ${isBreak
                  ? "bg-amber-500"
                  : faceDetected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-destructive animate-pulse"
                }
              `}
            />
            <span className="text-[11px] font-semibold tracking-wide uppercase">
              {isBreak ? "Break" : "Studying"}
            </span>
          </div>
          <button
            onClick={stopSession}
            className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="End session"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* big countdown */}
        <div
          className={`
            text-[2.1rem] font-mono font-black tabular-nums text-center leading-none mb-0.5
            ${isBreak ? "text-amber-500" : "text-foreground"}
          `}
        >
          {fmtMs(remainingMs)}
        </div>
        <p className="text-[10px] text-center text-muted-foreground mb-3">
          {isBreak ? "break remaining" : "remaining in session"}
        </p>

        {/* overall session progress */}
        <div className="mb-2.5">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>session progress</span>
            <span>{Math.round(sessionProgressPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000"
              style={{ width: `${sessionProgressPct}%` }}
            />
          </div>
        </div>

        {/* running-specific */}
        {!isBreak && (
          <>
            {/* face indicator */}
            <div
              className={`
                flex items-center justify-center gap-1.5 text-[10px] mb-2.5 py-1 rounded-lg
                ${faceDetected
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
                }
              `}
            >
              {faceDetected
                ? <Camera className="w-3 h-3" />
                : <CameraOff className="w-3 h-3" />
              }
              {faceDetected ? "Focused" : "Face not detected"}
            </div>

            {/* block progress bar (until next break) */}
            <div>
              <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                <span>until break</span>
                <span>{fmtMs(Math.max(0, BREAK_EVERY_MS - currentBlockMs))}</span>
              </div>
              <div className="h-1 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500/70 transition-all duration-1000"
                  style={{ width: `${blockProgressPct}%` }}
                />
              </div>
            </div>
          </>
        )}

        {/* break-specific */}
        {isBreak && (
          <button
            onClick={resumeFromBreak}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Play className="w-3 h-3" />
            Resume Early
          </button>
        )}

        {/* studied so far footer */}
        <div className="mt-2.5 pt-2 border-t border-border/50 text-[9px] text-center text-muted-foreground">
          Studied:&nbsp;
          <span className="font-semibold text-foreground font-mono">{fmtMs(elapsedMs)}</span>
        </div>
      </div>
    </div>
  )
}
