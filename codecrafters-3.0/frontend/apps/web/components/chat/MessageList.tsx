"use client"

import { useEffect, useRef, type ReactNode } from "react"
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
                <MarkdownContent content={msg.content} />
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

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content)

  const headingClass: Record<1 | 2 | 3, string> = {
    1: "text-base font-bold mt-1",
    2: "text-sm font-bold mt-1",
    3: "text-sm font-semibold mt-0.5",
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p key={index} className={headingClass[block.level]}>
              {renderInlineMarkdown(block.text)}
            </p>
          )
        }

        if (block.type === "paragraph") {
          return (
            <p key={index} className="last:mb-0 whitespace-pre-wrap">
              {renderInlineMarkdown(block.text)}
            </p>
          )
        }

        if (block.type === "ul") {
          return (
            <ul key={index} className="list-disc pl-4 space-y-0.5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === "ol") {
          return (
            <ol key={index} className="list-decimal pl-4 space-y-0.5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ol>
          )
        }

        return (
          <pre key={index} className="bg-background/60 my-2 overflow-x-auto rounded p-3 text-xs font-mono">
            <code>{block.code}</code>
          </pre>
        )
      })}
    </div>
  )
}

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; code: string }

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let paragraphLines: string[] = []
  let listType: "ul" | "ol" | null = null
  let listItems: string[] = []
  let codeLines: string[] = []
  let inCodeBlock = false

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n").trim() })
    paragraphLines = []
  }

  const flushList = () => {
    if (listType && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems })
    }
    listType = null
    listItems = []
  }

  const flushCode = () => {
    if (codeLines.length > 0) {
      blocks.push({ type: "code", code: codeLines.join("\n") })
    }
    codeLines = []
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        flushCode()
      } else {
        flushParagraph()
        flushList()
      }
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const level = Math.min(headingMatch[1]!.length, 3) as 1 | 2 | 3
      blocks.push({ type: "heading", level, text: headingMatch[2] ?? "" })
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/)
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/)

    if (unorderedMatch) {
      flushParagraph()
      if (listType === "ol") flushList()
      listType = "ul"
      listItems.push(unorderedMatch[1] ?? "")
      continue
    }

    if (orderedMatch) {
      flushParagraph()
      if (listType === "ul") flushList()
      listType = "ol"
      listItems.push(orderedMatch[1] ?? "")
      continue
    }

    if (line.trim() === "") {
      flushParagraph()
      flushList()
      continue
    }

    if (listType) {
      flushList()
    }
    paragraphLines.push(line)
  }

  if (inCodeBlock) {
    flushCode()
  }
  flushParagraph()
  flushList()

  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: content }]
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = []
  // Matches **bold** and `code` in one pass
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] !== undefined) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[1]}
        </strong>
      )
    } else if (match[2] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">
          {match[2]}
        </code>
      )
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
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
