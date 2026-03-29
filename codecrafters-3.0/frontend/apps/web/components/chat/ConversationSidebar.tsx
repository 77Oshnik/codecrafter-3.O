"use client"

import { ChevronLeft, ChevronRight, MessageSquare, Plus, Trash2 } from "lucide-react"
import type { Conversation } from "@/lib/api"
import { cn } from "@workspace/ui/lib/utils"

interface Props {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  className?: string
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  collapsed,
  onToggleCollapse,
  className,
}: Props) {
  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-muted/40 transition-[width] duration-300 ease-in-out ${
        collapsed ? "w-16 min-w-16" : "w-60 min-w-60"
      }`}
    >
      {/* Header */}
      <div className={`flex items-center border-b border-border py-3 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        {!collapsed && <span className="text-sm font-semibold">Chats</span>}
        <div className="flex items-center gap-1">
          <button
            onClick={onNewConversation}
            className="rounded-md p-1.5 transition-colors hover:bg-accent"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 transition-colors hover:bg-accent"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3.5">
        {conversations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/75 bg-background/65 px-4 py-6 text-center text-sm text-muted-foreground">
            No conversations yet. Start one!
          </p>
        ) : (
          conversations.map((c) => (
            <div
              key={c._id}
              className={`interactive-card group mb-2 flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3.5 py-3 transition-all ${
                activeConversationId === c._id
                  ? "border-primary/40 bg-primary/12 text-foreground shadow-sm"
                  : "border-border/60 bg-background/60 hover:border-primary/30 hover:bg-background"
              } ${collapsed ? "justify-center px-2" : "gap-2 px-3"}`}
              onClick={() => onSelectConversation(c._id)}
              title={collapsed ? c.title : undefined}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {!collapsed && <span className="flex-1 truncate text-xs">{c.title}</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteConversation(c._id)
                }}
                className={`rounded p-0.5 transition-all hover:text-destructive ${
                  collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
