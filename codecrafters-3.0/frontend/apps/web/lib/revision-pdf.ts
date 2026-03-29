export type RevisionBlockType = "h1" | "h2" | "h3" | "paragraph" | "bullet" | "numbered"

export interface RevisionBlock {
  type: RevisionBlockType
  text: string
  order?: number
}

function stripInlineMarkdown(input: string): string {
  let text = input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\\([*_`~#>\-])/g, "$1")

  text = text.replace(/\s+/g, " ").trim()
  return text
}

export function parseRevisionMarkdown(markdown: string): RevisionBlock[] {
  if (!markdown.trim()) return []

  const lines = markdown.split(/\r?\n/)
  const blocks: RevisionBlock[] = []
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const text = stripInlineMarkdown(paragraphBuffer.join(" "))
    if (text) {
      blocks.push({ type: "paragraph", text })
    }
    paragraphBuffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      continue
    }

    if (/^([-*_])\1{2,}$/.test(line)) {
      flushParagraph()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      const level = Math.min(headingMatch[1].length, 3)
      const text = stripInlineMarkdown(headingMatch[2])
      if (text) {
        blocks.push({ type: `h${level}` as RevisionBlockType, text })
      }
      continue
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      const text = stripInlineMarkdown(bulletMatch[1])
      if (text) {
        blocks.push({ type: "bullet", text })
      }
      continue
    }

    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (numberedMatch) {
      flushParagraph()
      const text = stripInlineMarkdown(numberedMatch[2])
      if (text) {
        blocks.push({ type: "numbered", text, order: Number(numberedMatch[1]) || undefined })
      }
      continue
    }

    const quoteMatch = line.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      paragraphBuffer.push(quoteMatch[1])
      continue
    }

    paragraphBuffer.push(line)
  }

  flushParagraph()

  if (blocks.length === 0) {
    const fallback = stripInlineMarkdown(markdown)
    if (fallback) {
      return [{ type: "paragraph", text: fallback }]
    }
  }

  return blocks
}

export function toPdfFileName(fileName?: string): string {
  const source = fileName?.trim() || "revision-notes"
  const withoutExt = source.replace(/\.[a-z0-9]+$/i, "")
  const safe = withoutExt.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-")
  return `${safe || "revision-notes"}.pdf`
}

export async function downloadRevisionPdf(markdown: string, fileName?: string): Promise<void> {
  const blocks = parseRevisionMarkdown(markdown)
  const { jsPDF } = await import("jspdf")

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const ensurePageSpace = (required: number) => {
    if (y + required > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  const writeWrapped = (
    text: string,
    config: { fontSize: number; lineHeight: number; gapAfter: number; x?: number }
  ) => {
    const x = config.x ?? margin
    doc.setFontSize(config.fontSize)
    const width = Math.max(120, pageWidth - x - margin)
    const lines = doc.splitTextToSize(text, width)
    const required = lines.length * config.lineHeight + config.gapAfter
    ensurePageSpace(required)
    doc.text(lines, x, y)
    y += lines.length * config.lineHeight + config.gapAfter
  }

  if (blocks.length === 0) {
    writeWrapped("Revision Sheet", { fontSize: 16, lineHeight: 20, gapAfter: 10 })
  }

  for (const block of blocks) {
    if (!block.text) continue

    if (block.type === "h1") {
      writeWrapped(block.text, { fontSize: 18, lineHeight: 22, gapAfter: 10 })
      continue
    }

    if (block.type === "h2") {
      writeWrapped(block.text, { fontSize: 16, lineHeight: 20, gapAfter: 8 })
      continue
    }

    if (block.type === "h3") {
      writeWrapped(block.text, { fontSize: 14, lineHeight: 18, gapAfter: 6 })
      continue
    }

    if (block.type === "bullet") {
      writeWrapped(`• ${block.text}`, { fontSize: 11, lineHeight: 15, gapAfter: 4, x: margin + 6 })
      continue
    }

    if (block.type === "numbered") {
      const marker = block.order ? `${block.order}.` : "1."
      writeWrapped(`${marker} ${block.text}`, { fontSize: 11, lineHeight: 15, gapAfter: 4, x: margin + 6 })
      continue
    }

    writeWrapped(block.text, { fontSize: 11, lineHeight: 16, gapAfter: 8 })
  }

  doc.save(toPdfFileName(fileName))
}