"use client"

import { useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import { Bot, User, ChevronDown } from "lucide-react"
import type { Message } from "@/lib/api"

interface Props {
  messages: Message[]
  isLoading: boolean
}

export function MessageList({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Bot className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">How can I help you?</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ask me anything. Upload PDFs in the sidebar and I will use them to give you accurate,
          sourced answers.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6 gap-6">
      {messages.map((msg, i) => (
        <div key={msg.id ?? i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {msg.role === "user" ? (
              <User className="w-4 h-4" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
          </div>

          {/* Bubble */}
          <div className={`flex flex-col gap-2 max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted rounded-tl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                    code: ({ children }) => (
                      <code className="bg-background/60 rounded px-1 py-0.5 text-xs font-mono">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="bg-background/60 rounded p-3 overflow-x-auto text-xs font-mono my-2">
                        {children}
                      </pre>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>

            {/* Sources */}
            {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
              <SourcesAccordion sources={msg.sources} />
            )}
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Bot className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function SourcesAccordion({ sources }: { sources: NonNullable<Message["sources"]> }) {
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <details ref={ref} className="text-xs text-muted-foreground w-full max-w-full">
      <summary className="flex items-center gap-1 cursor-pointer select-none list-none hover:text-foreground transition-colors">
        <ChevronDown className="w-3 h-3 transition-transform [[open]_&]:rotate-180" />
        {sources.length} source{sources.length > 1 ? "s" : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2 pl-1">
        {sources.map((s, i) => (
          <div key={i} className="rounded-md border border-border bg-background/50 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-foreground/70 truncate max-w-[80%]">
                {s.documentName}
              </span>
              <span className="text-[10px] tabular-nums bg-muted px-1.5 py-0.5 rounded">
                {Math.round(s.score * 100)}%
              </span>
            </div>
            <p className="line-clamp-3 text-[11px] leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </details>
  )
}
