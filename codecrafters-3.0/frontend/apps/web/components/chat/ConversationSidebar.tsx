"use client"

import { useState } from "react"
import { MessageSquare, Plus, Trash2, FileText, Upload, X, Loader2 } from "lucide-react"
import type { Conversation, Document } from "@/lib/api"

interface Props {
  conversations: Conversation[]
  activeConversationId: string | null
  documents: Document[]
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onUploadDocument: (file: File) => Promise<void>
  onDeleteDocument: (id: string) => void
  uploading: boolean
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  documents,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onUploadDocument,
  onDeleteDocument,
  uploading,
}: Props) {
  const [tab, setTab] = useState<"chats" | "docs">("chats")
  const [dragging, setDragging] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUploadDocument(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === "application/pdf") onUploadDocument(file)
  }

  return (
    <aside className="flex flex-col w-64 min-w-[256px] h-full bg-muted/40 border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm">RAG Chat</span>
        <button
          onClick={onNewConversation}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="New conversation"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(["chats", "docs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "chats" ? "Chats" : "Documents"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "chats" ? (
          <div className="py-2">
            {conversations.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                No conversations yet. Start one!
              </p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c._id}
                  className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer transition-colors ${
                    activeConversationId === c._id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => onSelectConversation(c._id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-xs truncate">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteConversation(c._id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="py-2">
            {/* Upload area */}
            <div className="px-3 py-2">
              <label
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/30"
                } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground text-center">
                  {uploading ? "Uploading…" : "Drop PDF or click to upload"}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            {documents.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground text-center">
                No documents uploaded yet.
              </p>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc._id?.toString?.() || doc.name || Math.random()}
                  className="group flex items-center gap-2 px-3 py-2 mx-2 rounded-md"
                >
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{doc.name}</p>
                    <p
                      className={`text-[10px] ${
                        doc.status === "ready"
                          ? "text-green-500"
                          : doc.status === "failed"
                            ? "text-destructive"
                            : "text-yellow-500"
                      }`}
                    >
                      {doc.status === "ready"
                        ? `${doc.chunkCount} chunks`
                        : doc.status === "failed"
                          ? "Failed"
                          : "Processing…"}
                    </p>
                  </div>
                  <button
                    onClick={() => onDeleteDocument(doc._id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
