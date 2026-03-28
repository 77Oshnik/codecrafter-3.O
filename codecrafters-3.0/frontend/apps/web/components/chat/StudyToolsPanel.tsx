"use client"

import {
  Brain,
  FileText,
  GitBranch,
  HelpCircle,
  Layers,
  PlayCircle,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react"
import type { StudyResourceItem, StudyResultItem } from "@/lib/api"

interface StudyTool {
  id: string
  title: string
  description: string
  icon: LucideIcon
  prompt: string
  accent: string
}

interface Props {
  disabled?: boolean
  onSelectTool: (toolId: string, prompt: string) => void
  variant?: "inline" | "sidebar"
  resources?: StudyResourceItem[]
  results?: StudyResultItem[]
  onOpenResource?: (type: StudyResourceItem["type"], resourceRefId: string) => void
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
    id: "mindmap",
    title: "Mind Map",
    description: "Map ideas and relationships",
    icon: Brain,
    prompt:
      "Create a hierarchical mind map from the uploaded content with main topic, branches, sub-branches, and key details.",
    accent: "from-emerald-500/15 to-green-500/10",
  },
  {
    id: "summary",
    title: "Summary",
    description: "Get a compact topic summary",
    icon: FileText,
    prompt:
      "Summarize the uploaded documents into a concise, high-value summary with key points and important takeaways.",
    accent: "from-cyan-500/15 to-teal-500/10",
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
  resources = [],
  results = [],
  onOpenResource,
}: Props) {
  const isSidebar = variant === "sidebar"

  return (
    <section
      className={
        isSidebar
          ? "flex h-full min-h-0 w-full flex-col bg-background/80"
          : "border-b border-border bg-background/80 px-4 py-3"
      }
    >
      <div className={isSidebar ? "border-b border-border px-4 py-3" : "mb-2 flex items-center justify-between"}>
        <div>
          <h3 className="text-sm font-semibold">Study Tools</h3>
          <p className="text-xs text-muted-foreground">Generate learning content in one click.</p>
        </div>
      </div>

      <div
        className={
          isSidebar
            ? "flex-1 min-h-0 overflow-y-auto px-3 py-2 [scrollbar-gutter:stable]"
            : ""
        }
      >
        <div
          className={
            isSidebar
              ? "grid grid-cols-1 content-start gap-2"
              : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {studyTools.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id, tool.prompt)}
                disabled={disabled}
                className={`w-full text-left rounded-xl border border-border bg-linear-to-br ${tool.accent} p-3 transition-all hover:border-primary/40 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-md border border-border/70 bg-background/60 p-1">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium">{tool.title}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
              </button>
            )
          })}

          {isSidebar && (
            <>
              <div className="mt-3 border-t border-border pt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Results</h4>
                {results.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    No quiz attempts yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {results.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => item.quizId && onOpenResource?.("quiz", item.quizId)}
                        className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <p className="line-clamp-1 text-xs font-medium">{item.quizTitle}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Score: {item.score}/{item.total} ({item.percentage}%)
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Resources</h4>
                {resources.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                    No resources generated yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {resources.slice(0, 10).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if ((item.type === "quiz" || item.type === "flashcards") && item.resourceRefId) {
                            onOpenResource?.(item.type, item.resourceRefId)
                          }
                        }}
                        className={`w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-left transition-colors ${
                          item.type === "quiz" || item.type === "flashcards"
                            ? "hover:bg-accent/40"
                            : "cursor-default"
                        }`}
                      >
                        <p className="line-clamp-1 text-xs font-medium">{item.title}</p>
                        <p className="text-[11px] capitalize text-muted-foreground">{item.type}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}