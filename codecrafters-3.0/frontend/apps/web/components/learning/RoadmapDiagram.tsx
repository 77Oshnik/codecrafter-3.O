"use client"

import type { LearningPath } from "@/lib/api"

interface Props {
  path: LearningPath
}

function getTopicState(status?: string): "done" | "active" | "locked" {
  if (status === "completed") return "done"
  if (status === "locked") return "locked"
  return "active"
}

function getSubtopicState(status?: string): "done" | "open" | "locked" {
  if (status === "completed") return "done"
  if (status === "locked") return "locked"
  return "open"
}

function topicStateClasses(state: "done" | "active" | "locked"): string {
  if (state === "done") return "border-emerald-300 bg-emerald-50 text-emerald-900"
  if (state === "locked") return "border-slate-300 bg-slate-50 text-slate-600"
  return "border-cyan-300 bg-cyan-50 text-cyan-900"
}

function subtopicStateClasses(
  state: "done" | "open" | "locked",
  isRevision: boolean
): string {
  if (isRevision) return "border-amber-300 bg-amber-50 text-amber-900"
  if (state === "done") return "border-emerald-200 bg-emerald-50/70 text-emerald-900"
  if (state === "locked") return "border-slate-200 bg-slate-50 text-slate-600"
  return "border-blue-200 bg-blue-50/70 text-blue-900"
}

export function RoadmapDiagram({ path }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Roadmap Mindmap</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Notebook-style overview of all topics and subtopics for this path.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 inline-flex">
          {path.topic}
        </div>

        <div className="mt-4 space-y-4">
          {path.roadmap.map((topic, topicIndex) => {
            const topicState = getTopicState(topic.status)
            return (
              <div key={topic.id} className="relative pl-5">
                <div className="absolute left-1 top-1.5 h-full w-px bg-border" />
                <div className="absolute left-1 top-1.5 h-px w-4 bg-border" />

                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${topicStateClasses(topicState)}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {topicIndex + 1}. {topic.title}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide opacity-80">
                      {topicState}
                    </span>
                  </div>
                </div>

                <div className="mt-2 ml-3 space-y-2">
                  {topic.subtopics.map((subtopic, subIndex) => {
                    const subState = getSubtopicState(subtopic.status)
                    const isRevision = (subtopic.type || "core") !== "core"
                    return (
                      <div key={subtopic.id} className="relative pl-5">
                        <div className="absolute left-1 top-3 h-px w-4 bg-border" />
                        <div
                          className={`rounded-md border px-3 py-2 text-xs ${subtopicStateClasses(
                            subState,
                            isRevision
                          )}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {topicIndex + 1}.{subIndex + 1} {subtopic.title}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide opacity-80">
                              {subState}
                            </span>
                            {isRevision ? (
                              <span className="text-[10px] uppercase tracking-wide opacity-90">
                                {subtopic.type}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
