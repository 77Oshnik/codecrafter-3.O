"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
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
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load conversations and documents on mount
  useEffect(() => {
    if (!token) return
    listConversations(token)
      .then(setConversations)
      .catch((e) => setError(e.message))
    listDocuments(token)
      .then(setDocuments)
      .catch(() => {})
  }, [token])

  // Load messages when active conversation changes
  useEffect(() => {
    if (!token || !activeId) {
      setMessages([])
      return
    }
    getConversation(token, activeId)
      .then((c) => setMessages(c.messages))
      .catch((e) => setError(e.message))
  }, [token, activeId])

  const handleNewConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id)
    setError(null)
  }, [])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteConversation(token, id)
        setConversations((prev) => prev.filter((c) => c._id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, activeId]
  )

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!token || isLoading) return

      // Optimistically add user message
      const userMsg: Message = { role: "user", content: text }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)

      try {
        const conversationId = activeId ?? "new"
        const result = await sendMessage(token, conversationId, text, selectedDocumentId ?? undefined)

        // If this was a new conversation, set the active ID and add to sidebar
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
          // Update title in sidebar if it changed
          setConversations((prev) =>
            prev.map((c) =>
              c._id === result.conversationId ? { ...c, title: result.title } : c
            )
          )
        }

        setMessages((prev) => [...prev, result.message])
      } catch (e) {
        setError((e as Error).message)
        // Remove optimistic user message on error
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setIsLoading(false)
      }
    },
    [token, activeId, isLoading, selectedDocumentId]
  )

  const handleUploadDocument = useCallback(
    async (file: File) => {
      if (!token || uploading) return
      setUploading(true)
      setError(null)
      try {
        const result = await uploadDocument(token, file)
        setDocuments((prev) => [result.document, ...prev])
        // Poll for processing completion
        pollDocumentStatus(token, result.document._id)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setUploading(false)
      }
    },
    [token, uploading]
  )

  const pollDocumentStatus = useCallback(
    (t: string, docId: string) => {
      const interval = setInterval(async () => {
        try {
          const docs = await listDocuments(t)
          setDocuments(docs)
          const doc = docs.find((d) => d._id === docId)
          if (!doc || doc.status === "ready" || doc.status === "failed") {
            clearInterval(interval)
          }
        } catch {
          clearInterval(interval)
        }
      }, 3000)
    },
    []
  )

  const handleDeleteDocument = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteDocument(token, id)
        setDocuments((prev) => prev.filter((d) => d._id !== id))
        if (selectedDocumentId === id) setSelectedDocumentId(null)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, selectedDocumentId]
  )

  const handleSelectDocument = useCallback((id: string | null) => {
    setSelectedDocumentId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeId}
        documents={documents}
        selectedDocumentId={selectedDocumentId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onUploadDocument={handleUploadDocument}
        onDeleteDocument={handleDeleteDocument}
        onSelectDocument={handleSelectDocument}
        uploading={uploading}
      />

      {/* Main chat area */}
      <main className="flex flex-col flex-1 min-w-0 h-full">
        {/* Document filter banner */}
        {selectedDocumentId && (() => {
          const doc = documents.find((d) => d._id === selectedDocumentId)
          return doc ? (
            <div className="flex items-center gap-2 bg-primary/10 border-b border-primary/20 text-primary text-xs px-4 py-2">
              <span className="flex-1 truncate">
                Searching only in: <span className="font-medium">{doc.name}</span>
              </span>
              <button
                onClick={() => setSelectedDocumentId(null)}
                className="underline hover:no-underline flex-shrink-0"
              >
                Clear
              </button>
            </div>
          ) : null
        })()}

        {/* Error banner */}
        {error && (
          <div className="bg-destructive/10 border-b border-destructive/30 text-destructive text-xs px-4 py-2">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <MessageList messages={messages} isLoading={isLoading} />
        <MessageInput
          onSend={handleSendMessage}
          disabled={isLoading || !token}
          placeholder={token ? "Ask anything… (Shift+Enter for new line)" : "Loading…"}
        />
      </main>
    </div>
  )
}
