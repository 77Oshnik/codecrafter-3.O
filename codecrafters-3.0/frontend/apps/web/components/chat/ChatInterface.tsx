"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Loader2, Paperclip, X, CheckCircle, AlertCircle } from "lucide-react"
import { ConversationSidebar } from "./ConversationSidebar"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  listDocuments,
  uploadDocument,
  deleteDocument,
  type Conversation,
  type Message,
  type Document,
} from "@/lib/api"

export function ChatInterface() {
  const { data: session } = useSession()
  const token = session?.user?.backendToken ?? ""

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUploadDocument(file)
    e.target.value = ""
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <main className="flex flex-col flex-1 min-w-0 h-full">
        {/* Error banner */}
        {error && (
          <div className="bg-destructive/10 border-b border-destructive/30 text-destructive text-xs px-4 py-2 flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="underline hover:no-underline flex-shrink-0">
              Dismiss
            </button>
          </div>
        )}

        <MessageList messages={messages} isLoading={isLoading} />

        {/* Document strip */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-2 flex-wrap bg-background/60">
          {documents.map((doc) => (
            <div
              key={doc._id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs max-w-[200px]"
            >
              {doc.status === "processing" ? (
                <Loader2 className="w-3 h-3 animate-spin text-yellow-500 flex-shrink-0" />
              ) : doc.status === "ready" ? (
                <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
              )}
              <span className="truncate">{doc.name}</span>
              <button
                onClick={() => handleDeleteDocument(doc._id)}
                className="flex-shrink-0 rounded-full hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          <label
            className={`flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs cursor-pointer hover:border-primary hover:text-primary transition-colors ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Paperclip className="w-3 h-3" />
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

        <MessageInput
          onSend={handleSendMessage}
          disabled={isLoading || !token}
          placeholder={token ? "Ask anything… (Shift+Enter for new line)" : "Loading…"}
        />
      </main>
    </div>
  )
}
