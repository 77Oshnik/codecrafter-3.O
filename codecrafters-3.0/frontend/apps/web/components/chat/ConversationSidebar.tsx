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
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-border/70 bg-sidebar/58 transition-[width] duration-300 ease-in-out",
        collapsed ? "w-18 min-w-18" : "w-72 min-w-72",
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex border-b border-border/70",
          collapsed
            ? "flex-col items-center gap-1.5 px-2 py-2.5"
            : "items-center justify-between px-4 py-3.5"
        )}
      >
        {!collapsed && <span className="font-heading text-base font-semibold">Chats</span>}
        <div className={cn("flex gap-1.5", collapsed ? "flex-col items-center" : "items-center")}>
          <button
            onClick={onNewConversation}
            className="animated-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/78 transition-colors hover:border-primary/45 hover:text-primary"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="animated-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/78 transition-colors hover:border-primary/45 hover:text-primary"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="scrollbar-left-panel flex-1 overflow-y-auto px-2.5 py-3.5">
        {conversations.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/75 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
            No conversations yet. Start one!
          </p>
        ) : (
          conversations.map((c) => (
            <div
              key={c._id}
              className={`interactive-card group mb-2 flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3.5 py-3.5 transition-all ${
                activeConversationId === c._id
                  ? "border-primary/40 bg-primary/12 text-foreground shadow-sm"
                  : "border-border/60 bg-background/60 hover:border-primary/30 hover:bg-background"
              } ${collapsed ? "justify-center px-2" : "gap-2.5 px-3"}`}
              onClick={() => onSelectConversation(c._id)}
              title={collapsed ? c.title : undefined}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              {!collapsed && <span className="flex-1 truncate text-sm font-medium">{c.title}</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteConversation(c._id)
                }}
                className={`rounded-md border border-transparent p-1 text-muted-foreground transition-all hover:border-destructive/30 hover:bg-destructive/12 hover:text-destructive ${
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
