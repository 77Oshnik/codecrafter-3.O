"use client"

import type { ReactNode } from "react"

interface GeneratedRichTextProps {
  content: string
  compact?: boolean
  className?: string
}

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; code: string }

export function GeneratedRichText({
  content,
  compact = false,
  className = "",
}: GeneratedRichTextProps) {
  const normalized = normalizeGeneratedContent(content)

  if (!normalized) {
    return <p className={`text-sm text-muted-foreground ${className}`}>No content generated yet.</p>
  }

  const blocks = parseMarkdownBlocks(normalized)

  const headingClass: Record<1 | 2 | 3, string> = {
    1: compact
      ? "font-heading text-sm font-semibold text-foreground underline decoration-primary/35 decoration-2 underline-offset-4"
      : "font-heading text-base font-semibold text-foreground underline decoration-primary/35 decoration-2 underline-offset-4",
    2: compact
      ? "font-heading text-xs font-semibold text-foreground/95 underline decoration-primary/30 decoration-2 underline-offset-4"
      : "font-heading text-sm font-semibold text-foreground/95 underline decoration-primary/30 decoration-2 underline-offset-4",
    3: compact
      ? "text-xs font-semibold text-foreground/90"
      : "text-sm font-semibold text-foreground/90",
  }

  return (
    <div className={`${compact ? "space-y-2 text-xs leading-relaxed" : "space-y-2.5 text-sm leading-relaxed"} ${className}`}>
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
            <p key={index} className="whitespace-pre-wrap text-muted-foreground/95">
              {renderInlineMarkdown(block.text)}
            </p>
          )
        }

        if (block.type === "ul") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-4 text-muted-foreground/95 marker:text-primary/70">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          )
        }

        if (block.type === "ol") {
          return (
            <ol key={index} className="list-decimal space-y-1 pl-4 text-muted-foreground/95 marker:text-primary/75">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ol>
          )
        }

        return (
          <pre
            key={index}
            className="overflow-x-auto rounded-xl border border-border/65 bg-background/70 p-3 text-[11px] font-mono leading-relaxed text-foreground"
          >
            <code>{block.code}</code>
          </pre>
        )
      })}
    </div>
  )
}

function normalizeGeneratedContent(content: string): string {
  const normalizedLineEndings = content.replace(/\r\n/g, "\n")

  const normalizedBullets = normalizedLineEndings.replace(/^(\s*)\*\s+/gm, "$1- ")

  const emphasizedLabels = normalizedBullets
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(?:[-+]\s+|\d+\.\s+)?([^:\n]{2,72}:)\s+.+$/)
      if (!match || line.includes("**")) return line
      const label = match[1] ?? ""
      return line.replace(label, `**${label}**`)
    })
    .join("\n")

  return emphasizedLabels.replace(/\n{3,}/g, "\n\n").trim()
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split("\n")
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
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] !== undefined) {
      parts.push(
        <strong
          key={match.index}
          className="rounded-sm bg-primary/10 px-1 py-0.5 font-semibold text-foreground underline decoration-primary/40 decoration-2 underline-offset-4"
        >
          {match[1]}
        </strong>
      )
    } else if (match[2] !== undefined) {
      parts.push(
        <code
          key={match.index}
          className="rounded-md border border-border/55 bg-background/60 px-1 py-0.5 font-mono text-[11px]"
        >
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