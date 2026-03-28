"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  NotebookPen,
  PlayCircle,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react"
import { MessageList } from "@/components/chat/MessageList"
import { MessageInput } from "@/components/chat/MessageInput"
import {
  createConversation,
  deleteYouTubeVideo,
  generateYouTubeNotes,
  generateYouTubeSummary,
  getConversation,
  ingestYouTubeVideo,
  listYouTubeVideos,
  sendMessage,
  type Message,
  type YouTubeVideoItem,
} from "@/lib/api"

interface Props {
  initialConversationId?: string
}

function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, "")

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id?.slice(0, 20) ?? null
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const v = url.searchParams.get("v")
        return v?.slice(0, 20) ?? null
      }

      const parts = url.pathname.split("/").filter(Boolean)
      if (parts[0] === "shorts" || parts[0] === "embed") {
        return parts[1]?.slice(0, 20) ?? null
      }
    }
  } catch {
    return null
  }

  return null
}

export function YoutubeLearnWorkspace({ initialConversationId }: Props) {
  const { data: session } = useSession()
  const token = session?.user?.backendToken ?? ""

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null)
  const [url, setUrl] = useState("")
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false)
  const [previewDialog, setPreviewDialog] = useState<
    null | { kind: "summary" | "notes"; title: string; content: string }
  >(null)
  const [error, setError] = useState<string | null>(null)

  const canAttach = useMemo(() => Boolean(token), [token])

  const selectedVideo = useMemo(
    () => videos.find((item) => item.id === selectedVideoId) ?? null,
    [videos, selectedVideoId]
  )

  const downloadMarkdown = useCallback((content: string, fileName: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  }, [])

  const loadConversationMessages = useCallback(
    async (convId: string) => {
      if (!token) return
      try {
        const conversation = await getConversation(token, convId)
        setMessages(conversation.messages)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token]
  )

  const loadVideos = useCallback(
    async (convId: string) => {
      if (!token) return
      try {
        const items = await listYouTubeVideos(token, convId)
        setVideos(items)
        if (items.length > 0 && !selectedVideoId) {
          setSelectedVideoId(items[0]!.id)
        } else if (selectedVideoId && !items.some((v) => v.id === selectedVideoId)) {
          setSelectedVideoId(items[0]?.id ?? null)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, selectedVideoId]
  )

  useEffect(() => {
    if (!token || !conversationId) return
    void loadConversationMessages(conversationId)
    void loadVideos(conversationId)
  }, [token, conversationId, loadConversationMessages, loadVideos])

  async function handleAttach() {
    if (!token) return

    const id = extractYouTubeVideoId(url)
    if (!id) {
      setError("Enter a valid YouTube URL (watch, youtu.be, shorts, or embed).")
      return
    }

    setIsIngesting(true)
    setError(null)

    try {
      let convId = conversationId
      if (!convId) {
        const created = await createConversation(token, "YouTube Learn")
        convId = created._id
        setConversationId(created._id)
      }

      const { video } = await ingestYouTubeVideo(token, {
        conversationId: convId,
        url: url.trim(),
      })

      setSelectedVideoId(video.id)
      setUrl("")
      await loadVideos(convId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsIngesting(false)
    }
  }

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!token || !conversationId || !selectedVideo || isLoadingChat) return

      const userMsg: Message = { role: "user", content: text }
      setMessages((prev) => [...prev, userMsg])
      setIsLoadingChat(true)
      setError(null)

      try {
        const result = await sendMessage(token, conversationId, text, {
          videoId: selectedVideo.videoId,
        })
        setMessages((prev) => [...prev, result.message])
      } catch (e) {
        setError((e as Error).message)
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsLoadingChat(false)
      }
    },
    [token, conversationId, selectedVideo, isLoadingChat]
  )

  const handleGenerateSummary = useCallback(async () => {
    if (!token || !selectedVideo) return
    setIsGeneratingSummary(true)
    setError(null)
    try {
      const { summary } = await generateYouTubeSummary(token, selectedVideo.id)
      setPreviewDialog({ kind: "summary", title: selectedVideo.title, content: summary })
      if (conversationId) await loadVideos(conversationId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsGeneratingSummary(false)
    }
  }, [token, selectedVideo, conversationId, loadVideos])

  const handleGenerateNotes = useCallback(async () => {
    if (!token || !selectedVideo) return
    setIsGeneratingNotes(true)
    setError(null)
    try {
      const { notes } = await generateYouTubeNotes(token, selectedVideo.id)
      setPreviewDialog({ kind: "notes", title: selectedVideo.title, content: notes })
      if (conversationId) await loadVideos(conversationId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsGeneratingNotes(false)
    }
  }, [token, selectedVideo, conversationId, loadVideos])

  const handleDeleteVideo = useCallback(
    async (id: string) => {
      if (!token || !conversationId) return
      try {
        await deleteYouTubeVideo(token, id)
        await loadVideos(conversationId)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, conversationId, loadVideos]
  )

  const videoDraft = useMemo(() => {
    if (!selectedVideo) return null
    return { url: selectedVideo.url, videoId: selectedVideo.videoId }
  }, [selectedVideo])

  const canChat = Boolean(token && conversationId && selectedVideo && selectedVideo.status === "ready")

  function formatPreviewFileName(kind: "summary" | "notes", title: string) {
    const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    return `${kind}-${safe || "youtube-video"}.md`
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6">
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <h1 className="text-lg font-semibold">YouTube Learning Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a YouTube link, ingest the transcript, chat with the selected video, and generate notes/summary.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {!canAttach ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Session is not ready yet. Please refresh or sign in again.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[360px,1fr]">
        <section className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-background p-4">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">YouTube video URL</label>
          <div className="flex flex-col gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void handleAttach()}
              disabled={!canAttach || isIngesting}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-4 text-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isIngesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {isIngesting ? "Ingesting..." : "Attach video"}
            </button>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Videos</p>
            </div>

            {videos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                No videos yet. Paste and attach a YouTube link.
              </p>
            ) : (
              <div className="space-y-2">
                {videos.map((item) => {
                  const isSelected = selectedVideoId === item.id
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 ${isSelected ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedVideoId(item.id)}
                        className="w-full text-left"
                      >
                        <p className="line-clamp-2 text-xs font-medium">{item.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.status} • {item.chunkCount} chunks
                        </p>
                      </button>

                      <div className="mt-2 flex items-center justify-between">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary underline hover:no-underline"
                        >
                          Open
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleDeleteVideo(item.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Selected video</p>
            </div>

            {videoDraft ? (
              <div className="space-y-2 text-sm">
                <p className="break-all text-muted-foreground">{videoDraft.url}</p>
                <p className="text-xs text-muted-foreground">Video ID: {videoDraft.videoId}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No video selected.</p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleGenerateSummary()}
                disabled={!selectedVideo || selectedVideo.status !== "ready" || isGeneratingSummary}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Summary
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateNotes()}
                disabled={!selectedVideo || selectedVideo.status !== "ready" || isGeneratingNotes}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NotebookPen className="h-3.5 w-3.5" />}
                Notes
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  selectedVideo?.summary
                    ? downloadMarkdown(
                        selectedVideo.summary,
                        formatPreviewFileName("summary", selectedVideo.title)
                      )
                    : null
                }
                disabled={!selectedVideo?.summary}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Summary file
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedVideo?.notes
                    ? downloadMarkdown(
                        selectedVideo.notes,
                        formatPreviewFileName("notes", selectedVideo.title)
                      )
                    : null
                }
                disabled={!selectedVideo?.notes}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Notes file
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Chat with selected video</p>
            <p className="text-xs text-muted-foreground">
              Answers are scoped to the selected YouTube transcript.
            </p>
          </div>

          <MessageList messages={messages} isLoading={isLoadingChat} />
          <MessageInput
            onSend={(text) => {
              void handleSendMessage(text)
            }}
            disabled={!canChat || isLoadingChat}
            placeholder={
              canChat
                ? "Ask from this video transcript..."
                : "Attach and select a ready video to start chatting..."
            }
          />
        </section>
      </div>

      {previewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">
                  {previewDialog.kind === "summary" ? "Video Summary" : "Video Notes"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDialog(null)}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-4 py-3">
              <p className="mb-2 text-xs text-muted-foreground">{previewDialog.title}</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
                {previewDialog.content}
              </pre>
            </div>

            <div className="flex justify-end border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  downloadMarkdown(
                    previewDialog.content,
                    formatPreviewFileName(previewDialog.kind, previewDialog.title)
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
