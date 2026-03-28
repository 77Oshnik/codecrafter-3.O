"use client"

import { useEffect, useMemo, useState } from "react"
import mermaid from "mermaid"
import type { GeneratedFlowchart } from "@/lib/api"

interface Props {
  open: boolean
  flowchart: GeneratedFlowchart | null
  onClose: () => void
}

let mermaidInitialized = false

export function FlowchartModal({ open, flowchart, onClose }: Props) {
  const [svg, setSvg] = useState("")
  const [renderError, setRenderError] = useState<string | null>(null)

  const mermaidCode = flowchart?.mermaidCode ?? ""

  const normalizedSteps = useMemo(() => {
    return (flowchart?.steps ?? []).filter((step) => typeof step === "string" && step.trim().length > 0)
  }, [flowchart?.steps])

  useEffect(() => {
    if (!open || !flowchart) return

    const render = async () => {
      try {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "default",
            themeVariables: {
              primaryColor: "#e0f2fe",
              primaryBorderColor: "#0284c7",
              lineColor: "#334155",
              textColor: "#0f172a",
              fontSize: "14px",
            },
          })
          mermaidInitialized = true
        }

        const id = `flowchart-${flowchart.id}-${Date.now()}`
        const result = await mermaid.render(id, mermaidCode)
        setSvg(result.svg)
        setRenderError(null)
      } catch (error) {
        setSvg("")
        setRenderError("Unable to render Mermaid diagram. Showing code fallback.")
      }
    }

    void render()
  }, [open, flowchart?.id, mermaidCode])

  if (!open || !flowchart) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{flowchart.title}</h2>
            <p className="text-xs text-muted-foreground">Step sequence + Mermaid flowchart visualization</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 lg:grid-cols-[320px_1fr]">
          <aside className="overflow-y-auto border-r border-border bg-muted/20 px-4 py-4">
            <h3 className="mb-3 text-sm font-semibold">Flowchart Sequence</h3>
            <ol className="space-y-2 text-sm">
              {normalizedSteps.map((step, idx) => (
                <li key={`${step}-${idx}`} className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs font-semibold text-primary">Step {idx + 1}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/90">{step}</p>
                </li>
              ))}
            </ol>
          </aside>

          <section className="min-h-0 overflow-auto px-4 py-4">
            <h3 className="mb-3 text-sm font-semibold">Mermaid Diagram</h3>

            {renderError && (
              <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                {renderError}
              </p>
            )}

            {svg ? (
              <div className="rounded-xl border border-border bg-white p-4" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed">
                {mermaidCode}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
