"use client"

import { useRouter } from "next/navigation"
import { Lock, PlayCircle, CheckCircle, ChevronDown, ChevronRight, Clock, Brain } from "lucide-react"
import { useState } from "react"
import type { LearningPath, RoadmapTopic } from "@/lib/api"

interface Props {
  path: LearningPath
}

const LEVEL_BADGE = {
  beginner: "text-green-600 bg-green-500/10",
  intermediate: "text-yellow-600 bg-yellow-500/10",
  advanced: "text-blue-600 bg-blue-500/10"
}

const TOPIC_STATUS_BADGE = {
  completed: "bg-green-500/10 text-green-700 border-green-500/20",
  available: "bg-primary/10 text-primary border-primary/20",
  "in-progress": "bg-primary/10 text-primary border-primary/20",
  locked: "bg-muted text-muted-foreground border-border",
}

function getSubtopicBadge(subtopic: RoadmapTopic["subtopics"][number]) {
  if (subtopic.type === "revision") return "Revision"
  if (subtopic.type === "remedial") return "Remedial"
  return null
}

function TopicCard({ topic, pathId, index }: { topic: RoadmapTopic; pathId: string; index: number }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(
    topic.status === "available" || topic.status === "in-progress" || topic.status === "completed"
  )
  const completedSubs = topic.subtopics.filter(s => s.status === "completed").length
  const progress = topic.subtopics.length > 0
    ? Math.round((completedSubs / topic.subtopics.length) * 100)
    : 0

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${
      topic.status === "locked" ? "border-border/80 bg-background/60" :
      topic.status === "completed" ? "border-green-500/25 bg-green-500/5" :
      "border-primary/25 bg-primary/5"
    }`}>
      {/* Topic header */}
      <button
        className="w-full p-5 flex items-start gap-3 text-left"
        onClick={() => topic.status !== "locked" && setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full border bg-background flex items-center justify-center text-xs font-semibold mt-0.5">
          {topic.status === "completed" ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : topic.status === "locked" ? (
            <Lock className="w-4 h-4 text-muted-foreground" />
          ) : (
            <span className="text-primary">{index + 1}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{topic.title}</h3>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${LEVEL_BADGE[topic.difficulty]}`}>
              {topic.difficulty}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${TOPIC_STATUS_BADGE[topic.status] || TOPIC_STATUS_BADGE.locked}`}>
              {topic.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{topic.description}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" /> {topic.estimatedTime}
            </span>
            <span className="text-xs text-muted-foreground">
              {completedSubs}/{topic.subtopics.length} subtopics
            </span>
            {topic.status !== "locked" && (
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>

        {topic.status !== "locked" && (
          <div className="flex-shrink-0">
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        )}
      </button>

      {/* Subtopics */}
      {expanded && topic.status !== "locked" && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-1.5">
          {topic.subtopics.map(sub => (
            <button
              key={sub.id}
              onClick={() => sub.status !== "locked" && router.push(`/dashboard/learn/${pathId}/topic/${topic.id}?subtopic=${sub.id}`)}
              disabled={sub.status === "locked"}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group border ${
                sub.status === "locked"
                  ? "opacity-45 cursor-not-allowed border-border bg-background/60"
                  : sub.status === "completed"
                  ? "border-green-500/20 bg-green-500/5 hover:bg-green-500/10"
                  : "border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer"
              }`}
            >
              <div className="flex-shrink-0">
                {sub.status === "completed" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : sub.status === "locked" ? (
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <PlayCircle className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-xs font-medium truncate">{sub.title}</p>
                  {getSubtopicBadge(sub) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">
                      {getSubtopicBadge(sub)}
                    </span>
                  )}
                </div>
                {sub.quizScore !== undefined && (
                  <p className="text-xs text-muted-foreground">Quiz: {sub.quizScore}%</p>
                )}
                {sub.adaptive && sub.unlockReason && (
                  <p className="text-[11px] text-muted-foreground">
                    {sub.unlockReason === "quiz-failed" ? "Added after a weak quiz attempt" : "Added to reinforce low confidence"}
                  </p>
                )}
              </div>
              {sub.status === "available" && (
                <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Start →</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RoadmapView({ path }: Props) {
  const allSubtopics = path.roadmap.flatMap(topic => topic.subtopics)
  const completedSubtopics = allSubtopics.filter(sub => sub.status === "completed").length
  const adaptiveSubtopics = allSubtopics.filter(sub => sub.adaptive).length

  return (
    <div className="max-w-6xl mx-auto">
      {/* Path header */}
      <div className="mb-6 border border-border rounded-2xl bg-background p-5">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{path.topic}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${LEVEL_BADGE[path.userLevel]}`}>
            {path.userLevel}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{path.levelExplanation}</p>

        {/* Overall progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${path.overallProgress}%` }}
            />
          </div>
          <span className="text-sm font-medium text-primary">{path.overallProgress}%</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{path.completedTopics} of {path.totalTopics} topics completed</span>
          <span>•</span>
          <span>{completedSubtopics} subtopics completed</span>
          <span>•</span>
          <span>{adaptiveSubtopics} adaptive steps</span>
        </div>
      </div>

      {/* Roadmap topics */}
      <div className="grid gap-3 lg:grid-cols-2">
        {path.roadmap.map((topic, i) => (
          <TopicCard key={topic.id} topic={topic} pathId={path._id} index={i} />
        ))}
      </div>

      {path.status === "completed" && (
        <div className="mt-6 text-center p-4 border border-green-500/30 rounded-xl bg-green-500/5">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium">Roadmap Completed!</p>
          <p className="text-xs text-muted-foreground mt-1">You&apos;ve mastered all topics in {path.topic}</p>
        </div>
      )}
    </div>
  )
}
