"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft, Loader2, Play, CheckCircle, Lock,
  Search, BookOpen, Brain, ChevronRight
} from "lucide-react"
import { SubtopicQuizModal } from "@/components/learning/SubtopicQuizModal"
import {
  getLearningPath,
  getSubtopicContent,
  getSubtopicVideos,
  getSubtopicQuiz,
  submitSubtopicQuiz,
  type LearningPath,
  type TopicContent,
  type LearningYouTubeVideo,
  type LearningQuizQuestion,
  type LearningQuizSubmitResult
} from "@/lib/api"

function TopicPageInner() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const pathId = params.pathId as string
  const topicId = params.topicId as string
  const token = (session?.user as { backendToken?: string })?.backendToken ?? ""

  const [path, setPath] = useState<LearningPath | null>(null)
  const [activeSubtopicId, setActiveSubtopicId] = useState<string>(searchParams.get("subtopic") ?? "")
  const [content, setContent] = useState<TopicContent | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [quiz, setQuiz] = useState<{ quizId: string; questions: LearningQuizQuestion[] } | null>(null)
  const [videos, setVideos] = useState<LearningYouTubeVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState("")
  const [selectedVideoId, setSelectedVideoId] = useState("")
  const [resourceTab, setResourceTab] = useState<"videos" | "search">("videos")
  const [quizLoading, setQuizLoading] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState("")

  const topic = path?.roadmap.find(t => t.id === topicId)
  const activeSubtopic = topic?.subtopics.find(s => s.id === activeSubtopicId)

  const loadContent = useCallback(async (stId: string) => {
    if (!token || !pathId || !topicId || !stId) return
    setContentLoading(true)
    setContent(null)
    setQuiz(null)
    try {
      const c = await getSubtopicContent(token, pathId, topicId, stId)
      setContent(c)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load content")
    } finally {
      setContentLoading(false)
    }
  }, [token, pathId, topicId])

  // Load path
  useEffect(() => {
    if (!token || !pathId) return
    getLearningPath(token, pathId)
      .then(p => {
        setPath(p)
        const t = p.roadmap.find(t => t.id === topicId)
        if (t) {
          // Default to first available subtopic
          const initialSubtopic = searchParams.get("subtopic") ||
            t.subtopics.find(s => s.status !== "locked")?.id || ""
          setActiveSubtopicId(initialSubtopic)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setPageLoading(false))
  }, [token, pathId, topicId, searchParams])

  // Load content when subtopic changes
  useEffect(() => {
    if (activeSubtopicId) loadContent(activeSubtopicId)
  }, [activeSubtopicId, loadContent])

  // Load YouTube suggestions for active subtopic
  useEffect(() => {
    if (!token || !pathId || !topicId || !activeSubtopicId) return
    const query = content?.youtubeSearchQuery?.trim()
    if (!query) {
      setVideos([])
      setVideosError("")
      setSelectedVideoId("")
      return
    }

    setVideosLoading(true)
    setVideosError("")
    getSubtopicVideos(token, pathId, topicId, activeSubtopicId, query)
      .then(data => {
        setVideos(data.videos || [])
        const firstVideoId = data.videos?.[0]?.videoId || ""
        setSelectedVideoId(firstVideoId)
      })
      .catch(e => {
        setVideos([])
        setSelectedVideoId("")
        setVideosError(e instanceof Error ? e.message : "Failed to load videos")
      })
      .finally(() => setVideosLoading(false))
  }, [token, pathId, topicId, activeSubtopicId, content?.youtubeSearchQuery])

  const handleLoadQuiz = async () => {
    if (!activeSubtopicId) return
    if (!token) {
      setError("Session token missing. Please sign in again.")
      return
    }

    console.log("[topic page] loading quiz", {
      pathId,
      topicId,
      activeSubtopicId,
      hasToken: Boolean(token),
    })
    setQuizLoading(true)
    try {
      const q = await getSubtopicQuiz(token, pathId, topicId, activeSubtopicId)
      setQuiz(q)
      setShowQuiz(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load quiz")
    } finally {
      setQuizLoading(false)
    }
  }

  const handleQuizSubmit = async (quizId: string, answers: number[]): Promise<LearningQuizSubmitResult> => {
    console.log("[topic page] submitting subtopic quiz", {
      pathId,
      topicId,
      activeSubtopicId,
      quizId,
      answerCount: answers.length,
    })

    try {
      const result = await submitSubtopicQuiz(token, pathId, topicId, activeSubtopicId, quizId, answers)
      console.log("[topic page] subtopic quiz submitted", {
        quizId,
        percentage: result.percentage,
        passed: result.passed,
        nextInfo: result.nextInfo,
      })

      // Refresh path to update progress
      getLearningPath(token, pathId).then(setPath).catch(err => {
        console.error("[topic page] failed to refresh learning path after quiz submit", err)
      })

      return result
    } catch (error) {
      console.error("[topic page] subtopic quiz submit failed", {
        pathId,
        topicId,
        activeSubtopicId,
        quizId,
        answers,
        error,
      })
      throw error
    }
  }

  const handleNext = (nextInfo: LearningQuizSubmitResult["nextInfo"]) => {
    setShowQuiz(false)
    if (!nextInfo) return
    if (nextInfo.type === "subtopic") {
      setActiveSubtopicId(nextInfo.subtopicId)
    } else if (nextInfo.type === "topic") {
      router.push(`/dashboard/learn/${pathId}/topic/${nextInfo.topicId}?subtopic=${nextInfo.subtopicId}`)
    }
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !content) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <button onClick={() => router.push(`/dashboard/learn/${pathId}`)} className="text-sm text-primary hover:underline">
          Back to Roadmap
        </button>
      </div>
    )
  }

  return (
    <>
      {showQuiz && quiz && (
        <SubtopicQuizModal
          quizId={quiz.quizId}
          questions={quiz.questions}
          onSubmit={handleQuizSubmit}
          onClose={() => setShowQuiz(false)}
          onNext={handleNext}
        />
      )}

      <div className="flex w-full h-full overflow-hidden">
        {/* Subtopic sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-border overflow-y-auto bg-muted/20">
          <div className="p-3 border-b border-border">
            <button
              onClick={() => router.push(`/dashboard/learn/${pathId}`)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ChevronLeft className="w-3 h-3" /> Roadmap
            </button>
            <p className="text-xs font-semibold truncate">{topic?.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{topic?.subtopics.length} subtopics</p>
          </div>

          <nav className="p-2 space-y-0.5">
            {topic?.subtopics.map(sub => (
              <button
                key={sub.id}
                onClick={() => sub.status !== "locked" && setActiveSubtopicId(sub.id)}
                disabled={sub.status === "locked"}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${
                  sub.id === activeSubtopicId
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : sub.status === "locked"
                    ? "opacity-40 cursor-not-allowed text-muted-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="flex-shrink-0">
                  {sub.status === "completed" ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : sub.status === "locked" ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-primary" />
                  )}
                </span>
                <span className="truncate">
                  {sub.title}
                  {sub.type === "revision" ? " • Revision" : ""}
                  {sub.type === "remedial" ? " • Remedial" : ""}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {contentLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating content with AI...</p>
            </div>
          ) : content ? (
            <div className="max-w-3xl mx-auto p-6">
              {/* Content header */}
              <div className="mb-6">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <span>{content.mainTopic}</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>{content.topicTitle}</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-foreground font-medium">{content.subtopicTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                    {content.userLevel}
                  </span>
                  {activeSubtopic?.type && activeSubtopic.type !== "core" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 capitalize">
                      {activeSubtopic.type}
                    </span>
                  )}
                </div>
                {activeSubtopic?.adaptive && activeSubtopic.unlockReason && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {activeSubtopic.unlockReason === "quiz-failed"
                      ? "This step was added because the previous quiz attempt needs reinforcement."
                      : "This step was added to strengthen a low-confidence area before moving on."}
                  </p>
                )}
              </div>

              {/* Key Points */}
              {content.keyPoints.length > 0 && (
                <div className="mb-5 border border-primary/20 rounded-xl p-4 bg-primary/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-primary" />
                    <p className="text-xs font-semibold text-primary">Key Points</p>
                  </div>
                  <ul className="space-y-1.5">
                    {content.keyPoints.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="text-primary mt-0.5">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Main content - markdown rendered as pre-formatted */}
              <article className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                <div className="whitespace-pre-wrap text-foreground/90 text-sm leading-7">
                  {content.content}
                </div>
              </article>

              {/* YouTube search */}
              {content.youtubeSearchQuery && (
                <div className="mt-6 border border-border rounded-xl p-4 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Find Video Resources</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Search YouTube for related tutorials and explanations.
                  </p>
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(content.youtubeSearchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search: &quot;{content.youtubeSearchQuery}&quot;
                  </a>
                </div>
              )}

              {/* Take quiz CTA */}
              <div className="mt-6 p-4 border border-primary/20 rounded-xl bg-primary/5 text-center">
                <p className="text-sm font-medium mb-1">Ready to test your knowledge?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Take a 5-question quiz to reinforce what you&apos;ve learned and unlock the next subtopic.
                </p>
                <button
                  onClick={handleLoadQuiz}
                  disabled={quizLoading || activeSubtopic?.status === "locked"}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {quizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {quizLoading
                    ? "Loading quiz..."
                    : activeSubtopic?.type === "revision"
                    ? "Take Revision Quiz"
                    : activeSubtopic?.status === "completed"
                    ? "Retake Quiz"
                    : "Take Quiz"}
                </button>
                {activeSubtopic?.quizScore !== undefined && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last score: <span className="font-medium text-foreground">{activeSubtopic.quizScore}%</span>
                    {" "}({activeSubtopic.quizAttempts} attempt{activeSubtopic.quizAttempts !== 1 ? "s" : ""})
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <BookOpen className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">Select a Subtopic</p>
              <p className="text-xs text-muted-foreground">
                Choose a subtopic from the sidebar to view AI-generated learning content.
              </p>
            </div>
          )}
        </main>

        {/* Right resource tab panel */}
        <aside className="hidden xl:flex w-[24rem] flex-shrink-0 border-l border-border bg-muted/10 flex-col">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold">Learning Resources</p>
            <div className="mt-2 inline-flex rounded-lg border border-border p-0.5 bg-background">
              <button
                onClick={() => setResourceTab("videos")}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  resourceTab === "videos"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Videos
              </button>
              <button
                onClick={() => setResourceTab("search")}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  resourceTab === "search"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Search
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {resourceTab === "videos" ? (
              <>
                {videosLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading videos...
                  </div>
                ) : videosError ? (
                  <p className="text-xs text-destructive">{videosError}</p>
                ) : videos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No videos found for this topic yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedVideoId ? (
                      <div className="rounded-lg overflow-hidden border border-border bg-black">
                        <iframe
                          title="Learning video"
                          src={`https://www.youtube.com/embed/${selectedVideoId}`}
                          className="w-full aspect-video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {videos.map(video => (
                        <button
                          key={video.videoId}
                          onClick={() => setSelectedVideoId(video.videoId)}
                          className={`w-full text-left p-2 rounded-lg border transition-colors ${
                            selectedVideoId === video.videoId
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-background"
                          }`}
                        >
                          <div className="flex gap-2">
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="w-20 h-12 rounded object-cover flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-medium line-clamp-2">{video.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{video.channelTitle}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Open YouTube search directly for this subtopic.
                </p>
                {content?.youtubeSearchQuery ? (
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(content.youtubeSearchQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Search on YouTube
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">Search query is not available yet.</p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}

export default function TopicPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <TopicPageInner />
    </Suspense>
  )
}
