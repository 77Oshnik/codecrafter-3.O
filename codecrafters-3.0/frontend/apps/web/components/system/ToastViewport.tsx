"use client"

import { useEffect, useMemo, useState } from "react"
import type { AppToastDetail, AppToastType } from "@/lib/toast"

type ToastItem = Required<AppToastDetail> & { id: string }

const TYPE_CLASS: Record<AppToastType, string> = {
  info: "border-border bg-background text-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (event: Event) => {
      const custom = event as CustomEvent<AppToastDetail>
      const detail = custom.detail
      if (!detail?.message) return

      const item: ToastItem = {
        id: detail.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message: detail.message,
        type: detail.type || "info",
        durationMs: detail.durationMs ?? 2600,
      }

      setToasts(prev => [...prev.slice(-4), item])
      window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id))
      }, item.durationMs)
    }

    window.addEventListener("app-toast", onToast)
    return () => window.removeEventListener("app-toast", onToast)
  }, [])

  const hasToasts = useMemo(() => toasts.length > 0, [toasts.length])
  if (!hasToasts) return null

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`rounded-xl border px-3 py-2 text-xs shadow-sm backdrop-blur ${TYPE_CLASS[toast.type]}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
