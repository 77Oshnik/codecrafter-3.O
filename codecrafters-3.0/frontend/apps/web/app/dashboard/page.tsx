import { auth } from "@/auth"
import { signOut } from "@/auth"
import {
  LogOut,
  Brain,
  MessageSquare,
  Play,
  ArrowRight,
  Flame,
  Trophy,
  Activity,
  BookOpen,
  CheckCircle
} from "lucide-react"
import Link from "next/link"
import {
  getDashboardSummary,
  getLearningDashboard,
  listConversations,
  listDocuments,
  type DashboardSummary
} from "@/lib/api"

function timeAgo(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / (1000 * 60))
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default async function DashboardPage() {
  const session = await auth()
  const token = (session?.user as { backendToken?: string } | undefined)?.backendToken

  let summary: DashboardSummary | null = null
  let summaryError = ""
  if (token) {
    try {
      summary = await getDashboardSummary(token)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load dashboard analytics"

      // Fallback for environments where new backend dashboard route is not yet available.
      if (message.includes("404")) {
        try {
          const [learning, conversations, documents] = await Promise.all([
            getLearningDashboard(token),
            listConversations(token),
            listDocuments(token),
          ])

          const totalConversations = conversations.length
          const totalMessages = 0
          const totalDocuments = documents.length
          const readyDocuments = documents.filter((d) => d.status === "ready").length

          summary = {
            user: { id: String((session?.user as { id?: string } | undefined)?.id || "") },
            kpis: {
              streakDays: 0,
              avgLearningProgress: learning.activePaths.length
                ? Math.round(
                  learning.activePaths.reduce((sum, p) => sum + (p.overallProgress || 0), 0) /
                    learning.activePaths.length
                )
                : 0,
              totalQuizzes: learning.totalQuizzes || 0,
              avgQuizScore: Math.round(learning.avgScore || 0),
            },
            chat: {
              totalConversations,
              totalMessages,
            },
            learning: {
              totalPaths: learning.totalPaths || 0,
              activePaths: learning.activePaths.length || 0,
              completedPaths: learning.completedPaths.length || 0,
              dueToday: learning.dueForReview.length || 0,
              weakTopics: learning.weakTopics.length || 0,
              strongTopics: learning.strongTopics.length || 0,
              paths: [...learning.activePaths, ...learning.completedPaths].map((p) => ({
                id: p._id,
                topic: p.topic,
                status: p.status,
                overallProgress: p.overallProgress || 0,
                completedTopics: p.completedTopics || 0,
                totalTopics: p.totalTopics || 0,
                lastActiveAt: p.lastActiveAt || p.createdAt,
              })),
              latestActivePath: learning.activePaths[0]
                ? {
                  id: learning.activePaths[0]._id,
                  topic: learning.activePaths[0].topic,
                  overallProgress: learning.activePaths[0].overallProgress || 0,
                }
                : null,
            },
            youtube: {
              totalVideos: 0,
              readyVideos: 0,
            },
            documents: {
              totalDocuments,
              readyDocuments,
            },
            recentActivity: (learning.recentActivity || []).map((item) => ({
              type: "quiz" as const,
              title: `${item.topicId} / ${item.subtopicId}`,
              score: item.percentage,
              createdAt: item.createdAt,
            })),
          }

          summaryError = "Using fallback analytics (dashboard summary route not available)."
        } catch (fallbackErr) {
          summaryError =
            fallbackErr instanceof Error ? fallbackErr.message : "Failed to load dashboard analytics"
        }
      } else {
        summaryError = message
      }
    }
  } else {
    summaryError = "Session token missing"
  }

  const kpis = summary?.kpis
  const learning = summary?.learning
  const chat = summary?.chat
  const youtube = summary?.youtube
  const documents = summary?.documents
  const recentActivity = summary?.recentActivity || []
  const recentActivityTop = recentActivity.slice(0, 3)

  const last7Days = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - idx))
    return date
  })

  const activityCountByDay = recentActivity.reduce<Record<string, number>>((acc, item) => {
    const d = new Date(item.createdAt)
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      acc[key] = (acc[key] || 0) + 1
    }
    return acc
  }, {})

  const activityBars = last7Days.map((date) => {
    const key = date.toISOString().slice(0, 10)
    const count = activityCountByDay[key] || 0
    const label = date.toLocaleDateString("en-US", { weekday: "short" })
    return { label, count }
  })
  const maxDailyActivity = Math.max(1, ...activityBars.map((x) => x.count))

  const recentQuizScores = recentActivity
    .filter((item) => typeof item.score === "number")
    .slice(0, 5)
    .map((item) => ({
      label: item.title,
      score: Number(item.score || 0),
      createdAt: item.createdAt,
    }))

  return (
    <div className="flex h-full w-full flex-col px-2 pb-2 pt-2 md:px-3 md:pb-3 md:pt-3">
      {/* Top nav */}
      <header className="surface-elevated mb-2 flex shrink-0 items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-2.5 md:mb-3 md:px-5">
        <div className="flex items-center gap-2">
          <span className="font-heading text-base font-semibold tracking-wide">CodeCrafter</span>
          <span className="text-xs text-muted-foreground">Dashboard Workspace</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-border/70 bg-background/65 px-2.5 py-1 text-xs text-muted-foreground sm:block">
            {session?.user?.name ?? session?.user?.email}
          </span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="animated-button inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/45 hover:text-primary"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose what you want to work on today.
            </p>
          </div>

          {summaryError ? (
            <div className={`border rounded-xl p-3 text-xs ${
              summaryError.startsWith("Using fallback")
                ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            }`}>
              {summaryError}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Flame className="w-4 h-4 text-orange-500" />
                Current Streak
              </div>
              <p className="text-2xl font-semibold mt-2">{kpis?.streakDays ?? 0} days</p>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Activity className="w-4 h-4 text-primary" />
                Learning Progress
              </div>
              <p className="text-2xl font-semibold mt-2">{kpis?.avgLearningProgress ?? 0}%</p>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                Quizzes Completed
              </div>
              <p className="text-2xl font-semibold mt-2">{kpis?.totalQuizzes ?? 0}</p>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Trophy className="w-4 h-4 text-emerald-500" />
                Avg Quiz Score
              </div>
              <p className="text-2xl font-semibold mt-2">{kpis?.avgQuizScore ?? 0}%</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 border border-border rounded-xl p-4 bg-background">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Learning Progress</p>
                <span className="text-xs text-muted-foreground">
                  {learning?.activePaths ?? 0} active path{(learning?.activePaths ?? 0) === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {(learning?.paths || []).slice(0, 4).map((path) => (
                  <Link
                    key={path.id}
                    href={`/dashboard/learn/${path.id}`}
                    className="block border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{path.topic}</p>
                      <span className="text-xs text-muted-foreground">{path.overallProgress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, path.overallProgress || 0))}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {path.completedTopics}/{path.totalTopics} topics • {timeAgo(path.lastActiveAt)}
                    </p>
                  </Link>
                ))}
                {(learning?.paths || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No learning paths yet.</p>
                ) : null}
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <p className="text-sm font-semibold">Today&apos;s Focus</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Due Reviews</span>
                  <span className="font-semibold">{learning?.dueToday ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Weak Topics</span>
                  <span className="font-semibold">{learning?.weakTopics ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Strong Topics</span>
                  <span className="font-semibold">{learning?.strongTopics ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Conversations</span>
                  <span className="font-semibold">{chat?.totalConversations ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Docs Ready</span>
                  <span className="font-semibold">{documents?.readyDocuments ?? 0}/{documents?.totalDocuments ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Videos Ready</span>
                  <span className="font-semibold">{youtube?.readyVideos ?? 0}/{youtube?.totalVideos ?? 0}</span>
                </div>
              </div>

              {learning?.latestActivePath ? (
                <Link
                  href={`/dashboard/learn/${learning.latestActivePath.id}`}
                  className="mt-4 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                >
                  Resume {learning.latestActivePath.topic}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 border border-border rounded-xl p-4 bg-background">
              <p className="text-sm font-semibold">Progress & Activity Trends</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="border border-border rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-2">Last 7 Days Activity</p>
                  <div className="h-24 flex items-end gap-2">
                    {activityBars.map((bar) => {
                      const height = Math.max(8, Math.round((bar.count / maxDailyActivity) * 72))
                      return (
                        <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-sm bg-primary/80"
                            style={{ height: `${bar.count > 0 ? height : 6}px` }}
                            title={`${bar.label}: ${bar.count}`}
                          />
                          <span className="text-[10px] text-muted-foreground">{bar.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="border border-border rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-2">Recent Quiz Scores</p>
                  <div className="space-y-1.5">
                    {recentQuizScores.length > 0 ? recentQuizScores.map((quiz, idx) => (
                      <div key={`${quiz.createdAt}-${idx}`} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="truncate pr-2">{quiz.label}</span>
                          <span className="font-semibold">{quiz.score}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.max(0, Math.min(100, quiz.score))}%` }}
                          />
                        </div>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground">No quiz scores yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <p className="text-sm font-semibold">Quick Actions</p>
              <div className="mt-3 space-y-2">
                <Link
                  href="/dashboard/chat"
                  className="flex items-center justify-between border border-border rounded-lg p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium">Open Chat Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
                <Link
                  href="/dashboard/learn"
                  className="flex items-center justify-between border border-border rounded-lg p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium">Go To Learning Paths</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
                <Link
                  href="/dashboard/youtube"
                  className="flex items-center justify-between border border-border rounded-lg p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xs font-medium">Open YouTube Learn</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 border border-border rounded-xl p-4 bg-background">
              <p className="text-sm font-semibold">Recent Activity</p>

              <div className="mt-3 space-y-2">
                {recentActivityTop.map((item, idx) => (
                  <div key={`${item.type}-${idx}-${item.createdAt}`} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg p-2.5">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-muted-foreground capitalize">{item.type}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {typeof item.score === "number" ? (
                        <p className="font-semibold">{item.score}%</p>
                      ) : item.status ? (
                        <p className="capitalize">{item.status}</p>
                      ) : (
                        <CheckCircle className="w-4 h-4 text-primary" />
                      )}
                      <p className="text-muted-foreground">{timeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {recentActivityTop.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent activity yet.</p>
                ) : null}
              </div>
            </div>

            <div className="border border-border rounded-xl p-4 bg-background">
              <p className="text-sm font-semibold">Activity Snapshot</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs border border-border rounded-lg p-2.5">
                  <span className="text-muted-foreground">Total Activities (7d)</span>
                  <span className="font-semibold">{activityBars.reduce((sum, x) => sum + x.count, 0)}</span>
                </div>
                <div className="flex items-center justify-between text-xs border border-border rounded-lg p-2.5">
                  <span className="text-muted-foreground">Most Active Day</span>
                  <span className="font-semibold">
                    {activityBars.reduce((best, cur) => (cur.count > best.count ? cur : best), activityBars[0] || { label: "-", count: 0 }).label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border border-border rounded-lg p-2.5">
                  <span className="text-muted-foreground">Best Recent Quiz</span>
                  <span className="font-semibold">
                    {recentQuizScores.length > 0
                      ? `${Math.max(...recentQuizScores.map(q => q.score))}%`
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/dashboard/chat"
              className="group border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <MessageSquare className="w-5 h-5 text-primary" />
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-semibold mt-3">Chat Workspace</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask questions, upload docs, and use study tools.
              </p>
            </Link>

            <Link
              href="/dashboard/learn"
              className="group border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <Brain className="w-5 h-5 text-primary" />
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-semibold mt-3">Learning Paths</p>
              <p className="text-xs text-muted-foreground mt-1">
                Personalized roadmap, adaptive quizzes, and revision loops.
              </p>
            </Link>

            <Link
              href="/dashboard/youtube"
              className="group border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <Play className="w-5 h-5 text-primary" />
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-semibold mt-3">YouTube Learn</p>
              <p className="text-xs text-muted-foreground mt-1">
                Learn from video transcripts with AI summaries and notes.
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
