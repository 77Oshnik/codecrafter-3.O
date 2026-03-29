"use client"

import { useEffect, useRef, useState } from "react"
import { FaceDetector as MPFaceDetector, FilesetResolver } from "@mediapipe/tasks-vision"
import {
  endWebcamFocusSession,
  pushWebcamFocusEvent,
  startWebcamFocusSession,
  type WebcamLatestMetrics,
} from "@/lib/api"
import { emitToast } from "@/lib/toast"

type Options = {
  enabled: boolean
  token: string
  pathId: string
  topicId: string
  subtopicId: string
}

type TracerState = {
  active: boolean
  error: string
  metrics: WebcamLatestMetrics
  sessionMs: number
  focusedMs: number
  awayMs: number
  interruptions: number
}

type FaceBox = {
  x: number
  y: number
  width: number
  height: number
}

type DetectorRuntime = {
  detect: (input: HTMLVideoElement, nowMs: number) => Promise<FaceBox | null>
  close?: () => void
}

const INITIAL_METRICS: WebcamLatestMetrics = {
  faceDetected: false,
  headYaw: 0,
  headPitch: 0,
  eyesOpenProb: 0,
  blinkClosureMs: 0,
  awayMs: 0,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useWebcamTracer({ enabled, token, pathId, topicId, subtopicId }: Options): TracerState {
  const [state, setState] = useState<TracerState>({
    active: false,
    error: "",
    metrics: INITIAL_METRICS,
    sessionMs: 0,
    focusedMs: 0,
    awayMs: 0,
    interruptions: 0,
  })

  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const detectorRef = useRef<DetectorRuntime | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const loopTimerRef = useRef<number | null>(null)
  const heartbeatRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(Date.now())
  const focusedSinceLastPushRef = useRef(0)
  const awaySinceLastPushRef = useRef(0)
  const interruptionsSinceLastPushRef = useRef(0)
  const totalsRef = useRef({ sessionMs: 0, focusedMs: 0, awayMs: 0, interruptions: 0 })
  const latestMetricsRef = useRef<WebcamLatestMetrics>(INITIAL_METRICS)
  const blinkMsRef = useRef(0)
  const consecutiveAwayMsRef = useRef(0)
  const lastFaceDetectedRef = useRef(false)
  const lastAwayToastRef = useRef(0)

  useEffect(() => {
    if (!enabled || !token || !pathId || !topicId || !subtopicId) return

    let cancelled = false

    const cleanup = async () => {
      if (loopTimerRef.current) window.clearInterval(loopTimerRef.current)
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current)
      loopTimerRef.current = null
      heartbeatRef.current = null

      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      videoRef.current = null
      detectorRef.current?.close?.()
      detectorRef.current = null

      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (!sessionId) return

      try {
        await endWebcamFocusSession(token, sessionId, {
          durationMs: totalsRef.current.sessionMs,
          focusedMs: totalsRef.current.focusedMs,
          awayMs: totalsRef.current.awayMs,
          interruptions: totalsRef.current.interruptions,
          faceDetected: latestMetricsRef.current.faceDetected,
          headYaw: latestMetricsRef.current.headYaw,
          headPitch: latestMetricsRef.current.headPitch,
          eyesOpenProb: latestMetricsRef.current.eyesOpenProb,
          blinkClosureMs: latestMetricsRef.current.blinkClosureMs,
        })
      } catch {
        // no-op
      }
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        streamRef.current = stream

        const video = document.createElement("video")
        video.autoplay = true
        video.muted = true
        video.playsInline = true
        video.srcObject = stream
        await video.play().catch(() => undefined)
        videoRef.current = video

        const hasNativeFaceDetector =
          typeof window !== "undefined" && typeof (window as Window & { FaceDetector?: unknown }).FaceDetector === "function"

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
              const box = faces?.[0]?.boundingBox
              if (!box) return null
              return {
                x: Number(box.x || 0),
                y: Number(box.y || 0),
                width: Number(box.width || 0),
                height: Number(box.height || 0),
              }
            },
          }
          emitToast({ message: "Webcam tracer: native face detector active", type: "success", durationMs: 1800 })
        } else {
          const wasmBase = "/mediapipe"
          const modelAssetPath =
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"

          const vision = await FilesetResolver.forVisionTasks(wasmBase)
          const mpDetector = await MPFaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          })

          detectorRef.current = {
            detect: async (input: HTMLVideoElement, nowMs: number) => {
              const result = mpDetector.detectForVideo(input, nowMs)
              const box = result?.detections?.[0]?.boundingBox
              if (!box) return null
              return {
                x: Number(box.originX || 0),
                y: Number(box.originY || 0),
                width: Number(box.width || 0),
                height: Number(box.height || 0),
              }
            },
            close: () => {
              try {
                mpDetector.close()
              } catch {
                // no-op
              }
            },
          }

          emitToast({
            message: "Webcam tracer: MediaPipe fallback active",
            type: "info",
            durationMs: 2200,
          })
        }

        if (!detectorRef.current) {
          throw new Error("No supported face detector runtime could be initialized")
        }

        const { sessionId } = await startWebcamFocusSession(token, {
          pathId,
          topicId,
          subtopicId,
          cameraEnabled: true,
        })
        sessionIdRef.current = sessionId

        lastTickRef.current = Date.now()

        setState(prev => ({ ...prev, active: true, error: "" }))
        emitToast({ message: "Webcam tracer enabled", type: "success" })

        loopTimerRef.current = window.setInterval(async () => {
          const currentVideo = videoRef.current
          const detector = detectorRef.current
          if (!currentVideo) return

          const now = Date.now()
          const deltaMs = Math.max(250, now - lastTickRef.current)
          lastTickRef.current = now

          let faceDetected = false
          let headYaw = 0
          let headPitch = 0

          if (detector && currentVideo.readyState >= 2) {
            try {
              const box = await detector.detect(currentVideo, now)
              faceDetected = Boolean(box)

              if (box) {
                const width = currentVideo.videoWidth || 1
                const height = currentVideo.videoHeight || 1
                const centerX = box.x + box.width / 2
                const centerY = box.y + box.height / 2
                const offsetX = centerX / width - 0.5
                const offsetY = 0.5 - centerY / height
                headYaw = clamp(offsetX * 90, -45, 45)
                headPitch = clamp(offsetY * 60, -30, 30)
              }
            } catch {
              faceDetected = false
            }
          }

          const eyesOpenProb = faceDetected
            ? clamp(1 - Math.abs(headYaw) / 75 - Math.abs(headPitch) / 55, 0.1, 1)
            : 0

          const lookingAway = !faceDetected || Math.abs(headYaw) > 24 || Math.abs(headPitch) > 16
          if (lookingAway) {
            consecutiveAwayMsRef.current += deltaMs
            awaySinceLastPushRef.current += deltaMs
          } else {
            consecutiveAwayMsRef.current = 0
            focusedSinceLastPushRef.current += deltaMs
          }

          const blinkClosureMs = eyesOpenProb < 0.2 ? blinkMsRef.current + deltaMs : 0
          blinkMsRef.current = blinkClosureMs

          const faceChanged = lastFaceDetectedRef.current !== faceDetected

          if (faceChanged) {
            emitToast({
              message: faceDetected ? "Face detected" : "Face not detected",
              type: faceDetected ? "success" : "warning",
              durationMs: 1800,
            })
            if (!faceDetected) interruptionsSinceLastPushRef.current += 1
          }
          lastFaceDetectedRef.current = faceDetected

          if (lookingAway && consecutiveAwayMsRef.current >= 3000 && now - lastAwayToastRef.current > 7000) {
            emitToast({
              message: `Looking away (${Math.round(consecutiveAwayMsRef.current / 1000)}s)`,
              type: "warning",
              durationMs: 2200,
            })
            lastAwayToastRef.current = now
          }

          if (blinkClosureMs >= 1800 && blinkClosureMs - deltaMs < 1800) {
            emitToast({
              message: "Eyes appear closed",
              type: "warning",
              durationMs: 2200,
            })
          }

          totalsRef.current.sessionMs += deltaMs
          totalsRef.current.focusedMs += lookingAway ? 0 : deltaMs
          totalsRef.current.awayMs += lookingAway ? deltaMs : 0
          totalsRef.current.interruptions += faceChanged ? 1 : 0

          latestMetricsRef.current = {
            faceDetected,
            headYaw,
            headPitch,
            eyesOpenProb,
            blinkClosureMs,
            awayMs: totalsRef.current.awayMs,
          }

          setState(prev => ({
            ...prev,
            metrics: latestMetricsRef.current,
            sessionMs: totalsRef.current.sessionMs,
            focusedMs: totalsRef.current.focusedMs,
            awayMs: totalsRef.current.awayMs,
            interruptions: totalsRef.current.interruptions,
          }))
        }, 1200)

        heartbeatRef.current = window.setInterval(async () => {
          const sessionId = sessionIdRef.current
          if (!sessionId) return

          const payload = {
            deltaMs: focusedSinceLastPushRef.current + awaySinceLastPushRef.current,
            focusedMs: focusedSinceLastPushRef.current,
            awayMs: awaySinceLastPushRef.current,
            interruptions: interruptionsSinceLastPushRef.current,
            faceDetected: lastFaceDetectedRef.current,
            headYaw: latestMetricsRef.current.headYaw,
            headPitch: latestMetricsRef.current.headPitch,
            eyesOpenProb: latestMetricsRef.current.eyesOpenProb,
            blinkClosureMs: blinkMsRef.current,
          }

          focusedSinceLastPushRef.current = 0
          awaySinceLastPushRef.current = 0
          interruptionsSinceLastPushRef.current = 0

          if (!payload.deltaMs) return

          try {
            await pushWebcamFocusEvent(token, sessionId, payload)
          } catch {
            // no-op
          }
        }, 5000)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start webcam tracer"
        setState(prev => ({ ...prev, active: false, error: message }))
        emitToast({ message: `Webcam tracer error: ${message}`, type: "error", durationMs: 3600 })
      }
    }

    void start()

    return () => {
      cancelled = true
      void cleanup()
      setState(prev => ({ ...prev, active: false }))
      emitToast({ message: "Webcam tracer stopped", type: "info" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, pathId, topicId, subtopicId])

  return state
}
