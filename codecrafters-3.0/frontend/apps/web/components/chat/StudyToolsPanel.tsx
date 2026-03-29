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
import { parseRevisionMarkdown } from "@/lib/revision-pdf"
import { GeneratedRichText } from "./GeneratedRichText"

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

const resultToneByType: Record<StudyResultItem["type"], {
  label: string
  icon: LucideIcon
  container: string
  badge: string
  emphasis: string
}> = {
  quiz: {
    label: "Quiz Result",
    icon: HelpCircle,
    container:
      "border-sky-500/25 bg-linear-to-br from-sky-500/10 via-background/85 to-primary/6 hover:border-sky-500/40",
    badge: "border-sky-500/35 bg-sky-500/14 text-sky-800 dark:text-sky-200",
    emphasis: "text-sky-700 dark:text-sky-300",
  },
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    container:
      "border-amber-500/25 bg-linear-to-br from-amber-500/12 via-background/85 to-primary/6 hover:border-amber-500/40",
    badge: "border-amber-500/35 bg-amber-500/14 text-amber-800 dark:text-amber-200",
    emphasis: "text-amber-700 dark:text-amber-300",
  },
}

const resourceToneByType: Record<StudyResourceItem["type"], {
  label: string
  icon: LucideIcon
  container: string
  badge: string
  emphasis: string
}> = {
  quiz: {
    label: "Quiz",
    icon: HelpCircle,
    container:
      "border-sky-500/22 bg-linear-to-br from-sky-500/9 via-background/85 to-primary/6 hover:border-sky-500/36",
    badge: "border-sky-500/30 bg-sky-500/12 text-sky-800 dark:text-sky-200",
    emphasis: "text-sky-700 dark:text-sky-300",
  },
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    container:
      "border-amber-500/22 bg-linear-to-br from-amber-500/10 via-background/85 to-primary/6 hover:border-amber-500/36",
    badge: "border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-200",
    emphasis: "text-amber-700 dark:text-amber-300",
  },
  flowchart: {
    label: "Flowchart",
    icon: GitBranch,
    container:
      "border-indigo-500/20 bg-linear-to-br from-indigo-500/10 via-background/85 to-primary/6 hover:border-indigo-500/34",
    badge: "border-indigo-500/30 bg-indigo-500/12 text-indigo-800 dark:text-indigo-200",
    emphasis: "text-indigo-700 dark:text-indigo-300",
  },
  revision: {
    label: "Revision",
    icon: RefreshCcw,
    container:
      "border-rose-500/20 bg-linear-to-br from-rose-500/10 via-background/85 to-primary/6 hover:border-rose-500/34",
    badge: "border-rose-500/30 bg-rose-500/12 text-rose-800 dark:text-rose-200",
    emphasis: "text-rose-700 dark:text-rose-300",
  },
  youtube: {
    label: "YouTube",
    icon: PlayCircle,
    container:
      "border-orange-500/20 bg-linear-to-br from-orange-500/10 via-background/85 to-primary/6 hover:border-orange-500/34",
    badge: "border-orange-500/30 bg-orange-500/12 text-orange-800 dark:text-orange-200",
    emphasis: "text-orange-700 dark:text-orange-300",
  },
}

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
  const revisionBlocks = parseRevisionMarkdown(revisionText)
  const revisionDisplayText =
    revisionBlocks.length > 0
      ? revisionBlocks
          .map((block) => {
            if (block.type === "h1") return `# ${block.text}`
            if (block.type === "h2") return `## ${block.text}`
            if (block.type === "h3") return `### ${block.text}`
            if (block.type === "bullet") return `- ${block.text}`
            if (block.type === "numbered") return `${block.order ?? 1}. ${block.text}`
            return block.text
          })
          .join("\n")
      : revisionText

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
            ? "scrollbar-right-panel flex-1 min-h-0 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
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
                    {results.slice(0, 8).map((item) => {
                      const tone = resultToneByType[item.type]
                      const ToneIcon = tone.icon

                      return (
                        <div
                          key={item.id}
                          className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${tone.container}`}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone.badge}`}>
                              <ToneIcon className="h-3 w-3" />
                              {tone.label}
                            </span>

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
                            className="flex w-full rounded text-left transition-colors hover:text-primary"
                          >
                            <div className="flex-1">
                              <p className="line-clamp-1 text-xs font-medium">{item.title}</p>
                              {item.type === "quiz" ? (
                                <p className="text-[11px] text-muted-foreground">
                                  Score: {item.score}/{item.total} <span className={tone.emphasis}>({item.percentage}%)</span>
                                </p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  Flashcards: <span className={tone.emphasis}>{item.cardCount ?? 0} cards</span>
                                </p>
                              )}
                            </div>
                          </button>
                        </div>
                      )
                    })}
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
                    {resources.slice(0, 10).map((item) => {
                      const tone = resourceToneByType[item.type]
                      const ToneIcon = tone.icon
                      const canOpen =
                        (item.type === "quiz" || item.type === "flashcards" || item.type === "flowchart") &&
                        Boolean(item.resourceRefId)

                      return (
                        <div
                          key={item.id}
                          className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 ${tone.container}`}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone.badge}`}>
                              <ToneIcon className="h-3 w-3" />
                              {tone.label}
                            </span>

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

                          <button
                            type="button"
                            onClick={() => {
                              if (canOpen) {
                                onOpenResource?.(item.type, item.resourceRefId)
                              }
                            }}
                            className={`flex w-full rounded text-left transition-colors ${canOpen ? "hover:text-primary" : "cursor-default"}`}
                          >
                            <div className="flex-1">
                              <p className="line-clamp-1 text-xs font-medium">{item.title}</p>
                              <p className={`text-[11px] capitalize ${tone.emphasis}`}>{item.type}</p>
                            </div>
                          </button>
                        </div>
                      )
                    })}
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
                <div className="max-h-64 overflow-auto rounded-2xl border border-border/65 bg-muted/20 p-3">
                  {revisionDisplayText ? (
                    <GeneratedRichText content={revisionDisplayText} compact />
                  ) : (
                    <p className="text-sm text-muted-foreground">No revision generated yet.</p>
                  )}
                </div>
              )}

              {!generatingRevision && revisionBullets.length > 0 && (
                <div className="mt-3 rounded-2xl border border-border/65 bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-semibold text-foreground">Quick Bullet Points</p>
                  <GeneratedRichText
                    content={revisionBullets.map((point) => `- ${point}`).join("\n")}
                    compact
                    className="text-muted-foreground"
                  />
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
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}