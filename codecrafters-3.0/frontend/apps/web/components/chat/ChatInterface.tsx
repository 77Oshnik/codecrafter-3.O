"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  Loader2,
  Paperclip,
  X,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  FileText,
} from "lucide-react"
import { ConversationSidebar } from "./ConversationSidebar"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { StudyToolsPanel } from "./StudyToolsPanel"
import type { StudyTool } from "./StudyToolsPanel"
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  listDocuments,
  uploadDocument,
  deleteDocument,
  generateDocumentSummary,
  generateConversationRevision,
  type Conversation,
  type Message,
  type Document,
} from "@/lib/api"

function buildRevisionBullets(text: string): string[] {
  const lines = text.split("\n").map((line) => line.trim())
  const explicitBullets = lines
    .map((line) => line.replace(/^([-*+]\s+|\d+\.\s+)/, "").trim())
    .filter((line, index) => line.length > 0 && /^([-*+]\s+|\d+\.\s+)/.test(lines[index] ?? ""))

  if (explicitBullets.length > 0) {
    return explicitBullets.slice(0, 12)
  }

  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .slice(0, 8)
}

export function ChatInterface() {
  const { data: session } = useSession()
  const token = session?.user?.backendToken ?? ""

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null)
  const [revisionText, setRevisionText] = useState("")
  const [revisionBullets, setRevisionBullets] = useState<string[]>([])
  const [revisionFileName, setRevisionFileName] = useState("revision-notes.md")
  const [generatingRevision, setGeneratingRevision] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load conversations on mount
  useEffect(() => {
    if (!token) return
    listConversations(token)
      .then(setConversations)
      .catch((e) => setError(e.message))
  }, [token])

  // Load messages + documents when active conversation changes
  useEffect(() => {
    if (!token || !activeId) {
      setMessages([])
      setDocuments([])
      setRevisionText("")
      setRevisionBullets([])
      return
    }
    getConversation(token, activeId)
      .then((c) => setMessages(c.messages))
      .catch((e) => setError(e.message))
    listDocuments(token, activeId)
      .then(setDocuments)
      .catch(() => {})
  }, [token, activeId])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollDocumentStatus = useCallback(
    (t: string, convId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const docs = await listDocuments(t, convId)
          setDocuments(docs)
          const allDone = docs.every((d) => d.status === "ready" || d.status === "failed")
          if (allDone) stopPolling()
        } catch {
          stopPolling()
        }
      }, 3000)
    },
    [stopPolling]
  )

  // Clean up poll on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const handleNewConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setDocuments([])
    stopPolling()
  }, [stopPolling])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setError(null)
      stopPolling()
    },
    [stopPolling]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteConversation(token, id)
        setConversations((prev) => prev.filter((c) => c._id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
          setDocuments([])
          stopPolling()
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, activeId, stopPolling]
  )

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!token || isLoading) return

      const userMsg: Message = { role: "user", content: text }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)

      try {
        const conversationId = activeId ?? "new"
        const result = await sendMessage(token, conversationId, text)

        if (!activeId) {
          setActiveId(result.conversationId)
          setConversations((prev) => [
            {
              _id: result.conversationId,
              title: result.title,
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ])
        } else {
          setConversations((prev) =>
            prev.map((c) =>
              c._id === result.conversationId ? { ...c, title: result.title } : c
            )
          )
        }

        setMessages((prev) => [...prev, result.message])
      } catch (e) {
        setError((e as Error).message)
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsLoading(false)
      }
    },
    [token, activeId, isLoading]
  )

  const handleUploadDocument = useCallback(
    async (file: File) => {
      if (!token || uploading) return
      setUploading(true)
      setError(null)
      try {
        // If no active conversation, create one first
        let convId = activeId
        if (!convId) {
          const newConv = await createConversation(token, "New Conversation")
          convId = newConv._id
          setActiveId(convId)
          setConversations((prev) => [newConv, ...prev])
        }

        const result = await uploadDocument(token, file, convId)
        setDocuments((prev) => [result.document, ...prev])
        pollDocumentStatus(token, convId)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setUploading(false)
      }
    },
    [token, uploading, activeId, pollDocumentStatus]
  )

  const handleDeleteDocument = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteDocument(token, id)
        setDocuments((prev) => prev.filter((d) => d._id !== id))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token]
  )

  const handleGenerateSummary = useCallback(
    async (docId: string) => {
      if (!token || generatingSummaryId) return
      setGeneratingSummaryId(docId)
      try {
        const { summary } = await generateDocumentSummary(token, docId)
        setDocuments((prev) =>
          prev.map((d) => (d._id === docId ? { ...d, summary } : d))
        )
        setExpandedDocId(docId)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setGeneratingSummaryId(null)
      }
    },
    [token, generatingSummaryId]
  )

  const handleGenerateRevision = useCallback(async () => {
    if (!token || !activeId || generatingRevision) return
    if (documents.length === 0) {
      setError("Upload at least one document before generating revision.")
      return
    }

    setGeneratingRevision(true)
    setError(null)
    try {
      const result = await generateConversationRevision(token, activeId)
      setRevisionText(result.revision)
      setRevisionBullets(buildRevisionBullets(result.revision))
      setRevisionFileName(result.fileName || "revision-notes.md")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGeneratingRevision(false)
    }
  }, [token, activeId, generatingRevision, documents.length])

  const handleDownloadRevision = useCallback(() => {
    if (!revisionText) return

    const downloadText =
      revisionBullets.length > 0
        ? `${revisionText}\n\n## Quick Bullet Points\n${revisionBullets
            .map((point) => `- ${point}`)
            .join("\n")}`
        : revisionText

    const blob = new Blob([downloadText], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = revisionFileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [revisionText, revisionBullets, revisionFileName])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUploadDocument(file)
    e.target.value = ""
  }

  const handleSelectStudyTool = useCallback(
    (tool: StudyTool) => {
      if (tool.id === "revision") {
        void handleGenerateRevision()
        return
      }
      void handleSendMessage(tool.prompt)
    },
    [handleGenerateRevision, handleSendMessage]
  )

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <main className="flex h-full min-w-0 flex-1">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          {/* Error banner */}
          {error && (
            <div className="bg-destructive/10 border-b border-destructive/30 text-destructive text-xs px-4 py-2 flex items-center gap-2">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="underline hover:no-underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          <MessageList messages={messages} isLoading={isLoading} />

          {/* Document accordion */}
          <div className="border-t border-border bg-background/60">
            {/* Upload row */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {documents.length === 0
                  ? "No documents"
                  : `${documents.length} document${documents.length > 1 ? "s" : ""}`}
              </span>
              <label
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs transition-colors hover:border-primary hover:text-primary ${
                  uploading ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="h-3 w-3" />
                )}
                <span>{uploading ? "Uploading…" : "Add PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            {/* Accordion items */}
            {documents.length > 0 && (
              <div className="max-h-[240px] divide-y divide-border overflow-y-auto border-t border-border">
                {documents.map((doc) => {
                  const isOpen = expandedDocId === doc._id
                  return (
                    <div key={doc._id}>
                      {/* Header row */}
                      <div className="flex items-center gap-2 px-4 py-2">
                        {doc.status === "processing" ? (
                          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-yellow-500" />
                        ) : doc.status === "ready" ? (
                          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                        )}
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs">{doc.name}</span>

                        {doc.status === "ready" && (
                          <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                            {doc.chunkCount} chunks
                          </span>
                        )}

                        {/* Generate summary button */}
                        {doc.status === "ready" && !doc.summary && (
                          <button
                            onClick={() => handleGenerateSummary(doc._id)}
                            disabled={generatingSummaryId === doc._id}
                            className="flex-shrink-0 text-[10px] text-primary underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
                            title="Generate summary"
                          >
                            {generatingSummaryId === doc._id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Summarize"
                            )}
                          </button>
                        )}

                        {/* Expand toggle */}
                        {doc.status === "ready" && doc.summary && (
                          <button
                            onClick={() => setExpandedDocId(isOpen ? null : doc._id)}
                            className="rounded p-0.5 transition-colors hover:bg-accent"
                            title={isOpen ? "Hide summary" : "Show summary"}
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (isOpen) setExpandedDocId(null)
                            handleDeleteDocument(doc._id)
                          }}
                          className="flex-shrink-0 rounded p-0.5 transition-colors hover:text-destructive"
                          title="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Summary panel */}
                      {isOpen && doc.summary && (
                        <div className="whitespace-pre-wrap bg-muted/30 px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                          {doc.summary}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </div>

          <MessageInput
            onSend={handleSendMessage}
            disabled={isLoading || !token}
            placeholder={token ? "Ask anything… (Shift+Enter for new line)" : "Loading…"}
          />
        </section>

        <aside className="hidden h-full w-96 min-w-96 border-l border-border lg:flex xl:w-104 xl:min-w-104">
          <StudyToolsPanel
            disabled={isLoading || !token}
            onSelectTool={handleSelectStudyTool}
            canGenerateRevision={Boolean(token && activeId && documents.length > 0)}
            generatingRevision={generatingRevision}
            revisionText={revisionText}
            revisionBullets={revisionBullets}
            onGenerateRevision={() => void handleGenerateRevision()}
            onDownloadRevision={handleDownloadRevision}
            variant="sidebar"
          />
        </aside>
      </main>
    </div>
  )
}
