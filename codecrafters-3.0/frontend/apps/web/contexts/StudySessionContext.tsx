"use client"

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react"
import { FaceDetector as MPFaceDetector, FilesetResolver } from "@mediapipe/tasks-vision"

const BREAK_EVERY_MS    = 60 * 60 * 1000   // 1 hour
const BREAK_DURATION_MS = 15 * 60 * 1000   // 15 minutes
const DETECT_INTERVAL   = 1500             // ms between face checks

export type SessionPhase = "idle" | "setup" | "running" | "break_prompt" | "break" | "completed"

export interface StudySessionCtx {
  phase: SessionPhase
  totalTargetMs: number
  elapsedMs: number
  currentBlockMs: number
  breakElapsedMs: number
  faceDetected: boolean
  openSetup: () => void
  cancelSetup: () => void
  startSession: (hours: number, minutes: number) => void
  stopSession: () => void
  takeBreak: () => void
  skipBreak: () => void
  resumeFromBreak: () => void
}

const Ctx = createContext<StudySessionCtx | null>(null)

export function useStudySession(): StudySessionCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStudySession must be inside StudySessionProvider")
  return ctx
}

// ── speech ──────────────────────────────────────────────────────────────────
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate   = 0.92
    utt.pitch  = 1.05
    utt.volume = 1
    window.speechSynthesis.speak(utt)
  } catch { /* ignore */ }
}

// ── face detector ────────────────────────────────────────────────────────────
type Detector = {
  detect(v: HTMLVideoElement, nowMs?: number): Promise<boolean>
  close?(): void
}


// ── state ────────────────────────────────────────────────────────────────────
interface SessionState {
  phase: SessionPhase
  totalTargetMs: number
  elapsedMs: number
  currentBlockMs: number
  breakElapsedMs: number
  faceDetected: boolean
}

const INIT: SessionState = {
  phase: "idle",
  totalTargetMs: 0,
  elapsedMs: 0,
  currentBlockMs: 0,
  breakElapsedMs: 0,
  faceDetected: false,
}

// ── provider ─────────────────────────────────────────────────────────────────
export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(INIT)

  // mutable refs — safe inside intervals (no stale closures)
  const phaseRef      = useRef<SessionPhase>("idle")
  const elapsedRef    = useRef(0)
  const blockRef      = useRef(0)
  const breakRef      = useRef(0)
  const targetRef     = useRef(0)
  const awayMsRef     = useRef(0)
  const lastTickRef   = useRef(0)
  const lastSpokenRef = useRef<Record<string, number>>({})

  // resource refs
  const streamRef   = useRef<MediaStream | null>(null)
  const videoRef    = useRef<HTMLVideoElement | null>(null)
  const detectorRef = useRef<Detector | null>(null)
  const timerRef    = useRef<number | null>(null)
  const detectRef   = useRef<number | null>(null)
  const synthRef    = useRef<number | null>(null)

  // ── interval cleanup helpers ──────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const clearDetect = useCallback(() => {
    if (detectRef.current) { window.clearInterval(detectRef.current); detectRef.current = null }
  }, [])

  const clearSynth = useCallback(() => {
    if (synthRef.current) { window.clearInterval(synthRef.current); synthRef.current = null }
  }, [])

  const stopCamera = useCallback(() => {
    clearDetect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current   = null
    videoRef.current    = null
    detectorRef.current?.close?.()
    detectorRef.current = null
  }, [clearDetect])

  const throttledSpeak = useCallback((key: string, text: string, cooldownMs: number) => {
    const now = Date.now()
    if (now - (lastSpokenRef.current[key] ?? 0) >= cooldownMs) {
      lastSpokenRef.current[key] = now
      speak(text)
    }
  }, [])

  // ── phase transitions ─────────────────────────────────────────────────────
  const triggerBreakPrompt = useCallback(() => {
    clearTimer()
    phaseRef.current = "break_prompt"
    setState(prev => ({ ...prev, phase: "break_prompt" }))
    speak(
      "Excellent work! You have been studying for one full hour. You deserve a well-earned break! " +
      "Would you like to take a 15-minute rest? Your brain needs time to consolidate everything you have learned.",
    )
  }, [clearTimer])

  const triggerCompleted = useCallback(() => {
    clearTimer()
    stopCamera()
    clearSynth()
    phaseRef.current = "completed"
    setState(prev => ({ ...prev, phase: "completed", elapsedMs: elapsedRef.current }))
    const ms = targetRef.current
    const h  = Math.floor(ms / 3_600_000)
    const m  = Math.floor((ms % 3_600_000) / 60_000)
    const timeStr = h > 0
      ? `${h} hour${h > 1 ? "s" : ""}${m > 0 ? ` and ${m} minutes` : ""}`
      : `${m} minutes`
    setTimeout(() => {
      speak(
        `Congratulations! You have successfully completed your study session of ${timeStr}! ` +
        "That was an absolutely outstanding performance. You should be incredibly proud of yourself! " +
        "Now take some time to rest, recharge, and let your brain absorb everything you have learned. Amazing work!",
      )
    }, 400)
  }, [clearTimer, stopCamera, clearSynth])

  // ── main study/break countdown timer ─────────────────────────────────────
  const startTimer = useCallback(() => {
    clearTimer()
    lastTickRef.current = Date.now()
    timerRef.current = window.setInterval(() => {
      const now   = Date.now()
      const delta = Math.min(now - lastTickRef.current, 3000)
      lastTickRef.current = now
      const phase = phaseRef.current

      if (phase === "running") {
        elapsedRef.current += delta
        blockRef.current   += delta

        if (blockRef.current >= BREAK_EVERY_MS) {
          triggerBreakPrompt()
          return
        }
        if (elapsedRef.current >= targetRef.current) {
          triggerCompleted()
          return
        }
        setState(prev => ({
          ...prev,
          elapsedMs:      elapsedRef.current,
          currentBlockMs: blockRef.current,
        }))
      } else if (phase === "break") {
        breakRef.current += delta
        if (breakRef.current >= BREAK_DURATION_MS) {
          breakRef.current    = 0
          blockRef.current    = 0
          phaseRef.current    = "running"
          lastTickRef.current = Date.now()
          setState(prev => ({ ...prev, phase: "running", breakElapsedMs: 0, currentBlockMs: 0 }))
          speak(
            "Break time is over! Welcome back. Let's get back to your studies. " +
            "You are doing phenomenally well — keep up the incredible work!",
          )
          return
        }
        setState(prev => ({ ...prev, breakElapsedMs: breakRef.current }))
      }
    }, 1000)
  }, [clearTimer, triggerBreakPrompt, triggerCompleted])

  // ── camera + face detection (mirrors useWebcamTracer logic exactly) ──────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false,
      })
      streamRef.current = stream

      const video       = document.createElement("video")
      video.autoplay    = true
      video.muted       = true
      video.playsInline = true
      video.srcObject   = stream
      await video.play().catch(() => undefined)
      videoRef.current = video

      // Same native → MediaPipe fallback as useWebcamTracer
      const hasNativeFaceDetector =
        typeof window !== "undefined" &&
        typeof (window as Window & { FaceDetector?: unknown }).FaceDetector === "function"

      if (hasNativeFaceDetector) {
        const NativeFaceDetector = (window as unknown as {
          FaceDetector: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
            detect: (input: HTMLVideoElement) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>>
          }
        }).FaceDetector
        const nativeDetector = new NativeFaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        detectorRef.current = {
          detect: async (input: HTMLVideoElement) => {
            const faces = await nativeDetector.detect(input)
            return (faces?.length ?? 0) > 0
          },
        }
      } else {
        const wasmBase = "/mediapipe"
        const modelAssetPath =
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"

        const vision    = await FilesetResolver.forVisionTasks(wasmBase)
        const mpDetector = await MPFaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        })

        detectorRef.current = {
          detect: async (input: HTMLVideoElement, nowMs: number) => {
            const result = mpDetector.detectForVideo(input, nowMs)
            return (result?.detections?.length ?? 0) > 0
          },
          close: () => { try { mpDetector.close() } catch { /* */ } },
        }
      }

      detectRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current || phaseRef.current !== "running") return
        if (videoRef.current.readyState < 2) return

        let detected = false
        try {
          detected = await detectorRef.current.detect(videoRef.current, Date.now())
        } catch {
          // treat as not detected so away tracking continues
        }

        awayMsRef.current = detected ? 0 : awayMsRef.current + DETECT_INTERVAL
        setState(prev => ({ ...prev, faceDetected: detected }))

        if (!detected) {
          if (awayMsRef.current >= 5_000) {
            throttledSpeak(
              "away_gentle",
              "Hey! Please focus on your studies. Come back to your desk and stay on track!",
              15_000,
            )
          }
          if (awayMsRef.current >= 20_000) {
            throttledSpeak(
              "away_urgent",
              "You have been away from your desk for a while. Your study session is still running! " +
              "Please come back and stay focused. You are so close to your goal — do not give up now!",
              30_000,
            )
          }
          if (awayMsRef.current >= 60_000) {
            throttledSpeak(
              "away_long",
              "Study session reminder — you have been away for over a minute. " +
              "Let's get back on track! Every minute of study brings you closer to your goals. Let's go!",
              60_000,
            )
          }
        }
      }, DETECT_INTERVAL)
    } catch (err) {
      console.warn("[StudySession] camera unavailable:", err)
    }
  }, [throttledSpeak])

  // ── public actions ────────────────────────────────────────────────────────
  const openSetup = useCallback(() => {
    phaseRef.current = "setup"
    setState(prev => ({ ...prev, phase: "setup" }))
  }, [])

  const cancelSetup = useCallback(() => {
    phaseRef.current = "idle"
    setState(prev => ({ ...prev, phase: "idle" }))
  }, [])

  const startSession = useCallback((hours: number, minutes: number) => {
    const totalMs = (hours * 60 + minutes) * 60_000
    if (totalMs <= 0) return

    targetRef.current     = totalMs
    elapsedRef.current    = 0
    blockRef.current      = 0
    breakRef.current      = 0
    awayMsRef.current     = 0
    lastSpokenRef.current = {}

    phaseRef.current = "running"
    setState({
      phase:          "running",
      totalTargetMs:  totalMs,
      elapsedMs:      0,
      currentBlockMs: 0,
      breakElapsedMs: 0,
      faceDetected:   false,
    })

    const h = hours, m = minutes
    const timeStr = h > 0
      ? `${h} hour${h > 1 ? "s" : ""}${m > 0 ? ` and ${m} minutes` : ""}`
      : `${m} minutes`
    speak(
      `Study session started! You have ${timeStr} of focused studying ahead of you. ` +
      "Let's make every single minute count. Stay focused, stay determined — you have got this!",
    )

    // Safari speech synthesis keep-alive (resumes if paused when tab goes to background)
    clearSynth()
    synthRef.current = window.setInterval(() => {
      if (window.speechSynthesis?.paused) window.speechSynthesis.resume()
    }, 5_000)

    void startCamera()
    startTimer()
  }, [startCamera, startTimer, clearSynth])

  const stopSession = useCallback(() => {
    const prev = phaseRef.current
    clearTimer()
    stopCamera()
    clearSynth()
    phaseRef.current   = "idle"
    elapsedRef.current = 0
    blockRef.current   = 0
    breakRef.current   = 0
    setState(INIT)
    if (prev !== "completed" && prev !== "idle" && prev !== "setup") {
      speak("Study session ended. Great effort today! Every bit of studying counts toward your success.")
    }
  }, [clearTimer, stopCamera, clearSynth])

  const takeBreak = useCallback(() => {
    breakRef.current = 0
    phaseRef.current = "break"
    setState(prev => ({ ...prev, phase: "break", breakElapsedMs: 0 }))
    startTimer()
    speak(
      "Enjoy your 15-minute break! Stretch your body, grab some water, and let your mind relax. " +
      "I will remind you when it is time to get back to your studies.",
    )
  }, [startTimer])

  const skipBreak = useCallback(() => {
    blockRef.current    = 0
    phaseRef.current    = "running"
    lastTickRef.current = Date.now()
    setState(prev => ({ ...prev, phase: "running", currentBlockMs: 0 }))
    startTimer()
    speak(
      "Great dedication! You chose to skip the break and keep going — that is impressive focus! " +
      "Let's continue making progress. Stay sharp!",
    )
  }, [startTimer])

  const resumeFromBreak = useCallback(() => {
    breakRef.current    = 0
    blockRef.current    = 0
    phaseRef.current    = "running"
    lastTickRef.current = Date.now()
    setState(prev => ({ ...prev, phase: "running", breakElapsedMs: 0, currentBlockMs: 0 }))
    startTimer()
    speak(
      "Welcome back! You came back early and you are ready to learn. " +
      "Let's dive right back in. You are doing absolutely great!",
    )
  }, [startTimer])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer()
      stopCamera()
      clearSynth()
    }
  }, [clearTimer, stopCamera, clearSynth])

  return (
    <Ctx.Provider value={{
      ...state,
      openSetup,
      cancelSetup,
      startSession,
      stopSession,
      takeBreak,
      skipBreak,
      resumeFromBreak,
    }}>
      {children}
    </Ctx.Provider>
  )
}
