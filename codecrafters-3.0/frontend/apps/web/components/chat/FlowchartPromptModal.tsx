"use client"

import { useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"

interface Props {
  open: boolean
  loading?: boolean
  onClose: () => void
  onSubmit: (fullPrompt: string) => void
}

const FLOWCHART_PREFIX = "Create The Flowchart Based on"

export function FlowchartPromptModal({ open, loading = false, onClose, onSubmit }: Props) {
  const [preference, setPreference] = useState("")

  const fullPrompt = useMemo(() => {
    const clean = preference.trim()
    return clean ? `${FLOWCHART_PREFIX} ${clean}` : FLOWCHART_PREFIX
  }, [preference])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Flowchart Preferences</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-accent"
            aria-label="Close flowchart preference dialog"
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Start with this text and add your preference focus. Example: key lifecycle stages, exam process,
            troubleshooting path, etc.
          </p>

          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs font-medium text-foreground">
            {FLOWCHART_PREFIX}
          </div>

          <label className="block text-xs font-medium text-foreground" htmlFor="flowchart-preference-input">
            Your preference
          </label>
          <textarea
            id="flowchart-preference-input"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            placeholder="e.g. authentication flow with error branches"
            className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus:border-primary focus:ring-1 focus:ring-primary"
            disabled={loading}
          />

          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Final input: <span className="font-medium text-foreground">{fullPrompt}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(fullPrompt)}
            disabled={loading || !preference.trim()}
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Generate Flowchart
          </button>
        </div>
      </div>
    </div>
  )
}
