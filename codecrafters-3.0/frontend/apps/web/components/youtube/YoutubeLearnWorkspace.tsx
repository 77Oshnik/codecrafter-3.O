"use client"

import { useState } from "react"
import { AlertCircle, Link2, Loader2, NotebookPen, PlayCircle, Sparkles } from "lucide-react"
import {
  askTranscriptQuestion,
  fetchTranscript,
  summarizeTranscript,
  type TranscriptChatMessage,
  type TranscriptResponse,
} from "@/lib/api"
import { extractYouTubeVideoId } from "@/lib/youtube"

interface Props {
  initialConversationId?: string
}

export function YoutubeLearnWorkspace(_: Props) {
  const [transcriptUrl, setTranscriptUrl] = useState("")
  const [transcriptResult, setTranscriptResult] = useState<TranscriptResponse | null>(null)
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [transcriptSummary, setTranscriptSummary] = useState<string | null>(null)
  const [isSummarizingTranscript, setIsSummarizingTranscript] = useState(false)
  const [transcriptChat, setTranscriptChat] = useState<(TranscriptChatMessage & { related?: boolean })[]>([])
  const [transcriptQuestion, setTranscriptQuestion] = useState("")
  const [isTranscriptAnswering, setIsTranscriptAnswering] = useState(false)
  const transcriptWordCount = transcriptResult?.fullText
    ? transcriptResult.fullText.split(/\s+/).filter(Boolean).length
    : 0

  async function handleFetchTranscript() {
    const videoId = extractYouTubeVideoId(transcriptUrl)
    if (!videoId) {
      setTranscriptError("Enter a valid YouTube URL (watch, youtu.be, shorts, or embed).")
      setTranscriptResult(null)
      return
    }

    setIsFetchingTranscript(true)
    setTranscriptError(null)

    try {
      const result = await fetchTranscript({ youtubeUrl: transcriptUrl.trim() })
      setTranscriptResult(result)
      setTranscriptSummary(null)
      setTranscriptChat([])
      setTranscriptQuestion("")
    } catch (e) {
      setTranscriptResult(null)
      setTranscriptError((e as Error).message)
    } finally {
      setIsFetchingTranscript(false)
    }
  }

  async function handleSummarizeTranscript() {
    if (!transcriptResult?.fullText) {
      setTranscriptError("Fetch a transcript first.")
      return
    }

    setIsSummarizingTranscript(true)
    setTranscriptError(null)

    try {
      const { summary } = await summarizeTranscript({
        transcript: transcriptResult.fullText,
        title: transcriptResult.title,
      })
      setTranscriptSummary(summary)
    } catch (e) {
      setTranscriptError((e as Error).message)
    } finally {
      setIsSummarizingTranscript(false)
    }
  }

  async function handleTranscriptAsk() {
    if (!transcriptResult?.fullText) {
      setTranscriptError("Fetch a transcript first.")
      return
    }

    const question = transcriptQuestion.trim()
    if (!question) {
      setTranscriptError("Enter a question about the transcript.")
      return
    }

    const userMsg: TranscriptChatMessage = { role: "user", content: question }
    setTranscriptChat((prev) => [...prev, userMsg])
    setTranscriptQuestion("")
    setIsTranscriptAnswering(true)
    setTranscriptError(null)

    try {
      const history = [...transcriptChat, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const { answer, related } = await askTranscriptQuestion({
        transcript: transcriptResult.fullText,
        question,
        history,
      })

      const cleanedAnswer = answer
        .replace(/^AI\s*\n?/i, "") // drop leading model tag if present
        .trim()

      setTranscriptChat((prev) => [...prev, { role: "assistant", content: cleanedAnswer, related }])
    } catch (e) {
      setTranscriptError((e as Error).message)
      setTranscriptChat((prev) => prev.slice(0, -1))
    } finally {
      setIsTranscriptAnswering(false)
    }
  }

  function formatPreviewFileName(kind: "summary" | "notes", title: string) {
    const safe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    return `${kind}-${safe || "youtube-video"}.md`
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 md:px-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">YouTube Transcript Assistant</p>
              <p className="text-xs text-muted-foreground">Fetch transcript, summarize, and ask questions with Gemini.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">YouTube link</label>
              <input
                value={transcriptUrl}
                onChange={(e) => setTranscriptUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-10 w-full rounded-lg border border-border bg-muted/20 px-3 text-sm outline-none transition-colors focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Paste any YouTube URL (watch, youtu.be, shorts, embed). We will only use the transcript.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleFetchTranscript()}
              disabled={isFetchingTranscript}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-4 text-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFetchingTranscript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {isFetchingTranscript ? "Fetching..." : "Fetch transcript"}
            </button>
          </div>

          {transcriptError && (
            <div className="inline-flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-[2px] h-3.5 w-3.5" />
              <span>{transcriptError}</span>
            </div>
          )}

          {transcriptResult && (
            <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{transcriptResult.title || "YouTube Video"}</p>
                  <p className="text-xs text-muted-foreground">Video ID: {transcriptResult.videoId}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Length: {transcriptResult.transcriptLength.toLocaleString()} chars • ~{transcriptWordCount.toLocaleString()} words
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSummarizeTranscript()}
                  disabled={isSummarizingTranscript}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSummarizingTranscript ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isSummarizingTranscript ? "Summarizing..." : "Summarize with AI"}
                </button>
              </div>

              {transcriptSummary && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm leading-relaxed">
                  <div className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>AI Summary</span>
                  </div>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">{transcriptSummary}</div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <NotebookPen className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Ask about this transcript</p>
                  </div>

                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-dashed border-border/70 bg-muted/30 p-2 text-sm">
                    {transcriptChat.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No questions yet. Ask something about the video.</p>
                    ) : (
                      transcriptChat.map((msg, idx) => (
                        <div
                          key={`${msg.role}-${idx}-${msg.content.slice(0, 12)}`}
                          className={`rounded-md px-3 py-2 text-[13px] ${msg.role === "user" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}
                        >
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {msg.role === "user" ? "You" : msg.related === false ? "AI (unrelated)" : "AI"}
                          </p>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      value={transcriptQuestion}
                      onChange={(e) => setTranscriptQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void handleTranscriptAsk()
                        }
                      }}
                      placeholder="Ask a question about this transcript..."
                      className="h-10 w-full rounded-md border border-border bg-muted/20 px-3 text-sm outline-none transition-colors focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => void handleTranscriptAsk()}
                      disabled={isTranscriptAnswering}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isTranscriptAnswering ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
                      {isTranscriptAnswering ? "Thinking..." : "Ask"}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</p>
                  <div className="mt-2 max-h-[320px] overflow-y-auto rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-sm leading-relaxed text-foreground">
                    <div className="whitespace-pre-wrap">{transcriptResult.fullText}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
