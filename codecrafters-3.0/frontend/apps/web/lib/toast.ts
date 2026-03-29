"use client"

export type AppToastType = "info" | "success" | "warning" | "error"

export type AppToastDetail = {
  id?: string
  message: string
  type?: AppToastType
  durationMs?: number
}

export function emitToast(detail: AppToastDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<AppToastDetail>("app-toast", { detail }))
}
