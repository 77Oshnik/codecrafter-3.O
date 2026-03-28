"use client"

import { MessageSquare, Plus, Trash2 } from "lucide-react"
import type { Conversation } from "@/lib/api"

interface Props {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: Props) {
  return (
    <aside className="flex flex-col w-60 min-w-[240px] h-full bg-muted/40 border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm">Chats</span>
        <button
          onClick={onNewConversation}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="New conversation"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
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
    </aside>
  )
}
