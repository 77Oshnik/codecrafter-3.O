"use client"

import { useEffect, useState } from "react"

import {
  Brain,
  Download,
  FileText,
  GitBranch,
  HelpCircle,
  Layers,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"
import type { StudyResourceItem, StudyResultItem } from "@/lib/api"

export interface StudyTool {
  id: string
  title: string
  description: string
  icon: LucideIcon
  prompt: string
  accent: string
}

interface Props {
  disabled?: boolean
  onSelectTool: (tool: StudyTool) => void
  variant?: "inline" | "sidebar"
  className?: string
  resources?: StudyResourceItem[]
  results?: StudyResultItem[]
  onOpenResource?: (type: StudyResourceItem["type"], resourceRefId: string) => void
  onDeleteResource?: (resourceId: string) => void
  onDeleteResult?: (type: StudyResultItem["type"], resultId: string) => void
  canGenerateRevision?: boolean
  generatingRevision?: boolean
  revisionText?: string
  revisionBullets?: string[]
  onGenerateRevision?: () => void
  onDownloadRevision?: () => void
}

const studyTools: StudyTool[] = [
  {
    id: "quiz",
    title: "Quiz",
    description: "Generate a smart practice quiz",
    icon: HelpCircle,
    prompt:
      "Create a quiz from my uploaded documents with 10 mixed-difficulty questions (MCQ + short answer), then provide answers at the end.",
    accent: "from-sky-500/15 to-blue-500/10",
  },
  {
    id: "flashcards",
    title: "Flashcards",
    description: "Turn concepts into cards",
    icon: Layers,
    prompt:
      "Generate concise flashcards from my uploaded documents in a Q/A format. Include at least 20 important cards.",
    accent: "from-orange-500/15 to-amber-500/10",
  },
  {
    id: "flowchart",
    title: "Flowchart",
    description: "Visual process breakdown",
    icon: GitBranch,
    prompt:
      "Create a clear step-by-step flowchart structure from the uploaded document content. Use a clean numbered flow with decision points where relevant.",
    accent: "from-violet-500/15 to-fuchsia-500/10",
  },
  {
    id: "revision",
    title: "Revision",
    description: "Rapid exam-style revision",
    icon: RefreshCcw,
    prompt:
      "Prepare a revision sheet from the uploaded content with must-remember points, formulas/definitions, and a last-minute checklist.",
    accent: "from-rose-500/15 to-pink-500/10",
  },
  {
    id: "youtube",
    title: "YouTube to Learn",
    description: "Build a video learning plan",
    icon: PlayCircle,
    prompt:
      "Based on the uploaded topic, suggest a practical YouTube learning roadmap: what to search for, channel types to follow, and a 7-day watch-and-practice plan.",
    accent: "from-red-500/15 to-orange-500/10",
  },
]

export function StudyToolsPanel({
  disabled = false,
  onSelectTool,
  variant = "inline",
  className,
  canGenerateRevision = false,
  generatingRevision = false,
  revisionText = "",
  revisionBullets = [],
  onGenerateRevision,
  onDownloadRevision,
  resources = [],
  results = [],
  onOpenResource,
  onDeleteResource,
  onDeleteResult,
}: Props) {
  const isSidebar = variant === "sidebar"
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false)

  useEffect(() => {
    if (generatingRevision || revisionText || revisionBullets.length > 0) {
      setIsRevisionDialogOpen(true)
    }
  }, [generatingRevision, revisionText, revisionBullets.length])

  return (
    <section
      className={
        isSidebar
          ? `flex h-full min-h-0 w-full flex-col bg-background/70 ${className ?? ""}`
          : `border-b border-border/70 bg-background/70 px-4 py-3 ${className ?? ""}`
      }
    >
      <div className={isSidebar ? "border-b border-border/70 px-5 py-4" : "mb-2 flex items-center justify-between"}>
        <div>
          <h3 className="font-heading text-base font-semibold">Study Tools</h3>
          <p className="text-sm text-muted-foreground">Generate learning content in one click.</p>
        </div>
      </div>

      <div
        className={
          isSidebar
            ? "flex-1 min-h-0 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
            : ""
        }
      >
        <div
          className={
            isSidebar
              ? "grid grid-cols-1 content-start gap-2.5"
              : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {studyTools.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  if (tool.id === "revision") {
                    setIsRevisionDialogOpen(true)
                    onGenerateRevision?.()
                    return
                  }
                  onSelectTool(tool)
                }}
                disabled={disabled || (tool.id === "revision" && !canGenerateRevision) || (tool.id === "revision" && generatingRevision)}
                className={`interactive-card animated-button w-full text-left rounded-2xl border border-border/75 bg-linear-to-br ${tool.accent} p-4 transition-all hover:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="rounded-lg border border-border/70 bg-background/70 p-2 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-base font-semibold leading-tight">
                    {tool.id === "revision" && generatingRevision ? "Generating..." : tool.title}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
              </button>
            )
          })}

          {isSidebar && (
            <>
              <div className="mt-3 border-t border-border pt-3">
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</h4>
                {results.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    No results yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {results.slice(0, 8).map((item) => (
                      <div
                        key={item.id}
                        className="group w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.type === "quiz" && item.quizId) {
                                onOpenResource?.("quiz", item.quizId)
                              }
                              if (item.type === "flashcards" && item.flashcardsId) {
                                onOpenResource?.("flashcards", item.flashcardsId)
                              }
                            }}
                            className="flex-1 rounded text-left transition-colors hover:text-primary"
                          >
                            <p className="line-clamp-1 text-xs font-medium">{item.title}</p>
                            {item.type === "quiz" ? (
                              <p className="text-[11px] text-muted-foreground">
                                Score: {item.score}/{item.total} ({item.percentage}%)
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Flashcards: {item.cardCount ?? 0} cards
                              </p>
                            )}
                          </button>

                          {onDeleteResult && (
                            <button
                              type="button"
                              onClick={() => onDeleteResult(item.type, item.id)}
                              className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                              title="Delete result"
                              aria-label="Delete result"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Resources</h4>
                {resources.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    No resources generated yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {resources.slice(0, 10).map((item) => (
                      <div
                        key={item.id}
                        className="group w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left"
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                (item.type === "quiz" || item.type === "flashcards" || item.type === "flowchart") &&
                                item.resourceRefId
                              ) {
                                onOpenResource?.(item.type, item.resourceRefId)
                              }
                            }}
                            className={`flex-1 rounded text-left transition-colors ${
                              item.type === "quiz" || item.type === "flashcards" || item.type === "flowchart"
                                ? "hover:text-primary"
                                : "cursor-default"
                            }`}
                          >
                            <p className="line-clamp-1 text-xs font-medium">{item.title}</p>
                            <p className="text-[11px] capitalize text-muted-foreground">{item.type}</p>
                          </button>

                          {onDeleteResource && (
                            <button
                              type="button"
                              onClick={() => onDeleteResource(item.id)}
                              className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                              title="Delete resource"
                              aria-label="Delete resource"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isRevisionDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="surface-elevated w-full max-w-2xl rounded-3xl border border-border/80 bg-background/90 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <p className="font-heading text-base font-semibold">Revision Sheet</p>
              <button
                type="button"
                onClick={() => setIsRevisionDialogOpen(false)}
                className="animated-button rounded-lg border border-border/70 bg-background/75 p-1.5 transition-colors hover:border-primary/45 hover:text-primary"
                aria-label="Close revision dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {generatingRevision ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating revision sheet...
                </div>
              ) : (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-border/65 bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
                  {revisionText || "No revision generated yet."}
                </pre>
              )}

              {!generatingRevision && revisionBullets.length > 0 && (
                <div className="mt-3 rounded-2xl border border-border/65 bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-semibold text-foreground">Quick Bullet Points</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {revisionBullets.map((point, index) => (
                      <li key={`${point}-${index}`}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4">
              <button
                type="button"
                onClick={onGenerateRevision}
                disabled={disabled || !canGenerateRevision || generatingRevision}
                className="animated-button inline-flex items-center gap-1 rounded-full border border-border/75 bg-background/75 px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingRevision && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Regenerate
              </button>
              <button
                type="button"
                onClick={onDownloadRevision}
                disabled={!revisionText}
                className="animated-button inline-flex items-center gap-1 rounded-full border border-border/75 bg-background/75 px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}