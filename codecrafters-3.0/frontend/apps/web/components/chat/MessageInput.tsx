"use client"

import { useState, useRef } from "react"
import { Send, Loader2 } from "lucide-react"

interface Props {
  onSend: (message: string) => void
  disabled: boolean
  placeholder?: string
}

export function MessageInput({ onSend, disabled, placeholder = "Ask anything…" }: Props) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    // Auto-grow
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-border px-4 py-3 bg-background"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition-colors disabled:opacity-50 max-h-[200px] overflow-y-auto"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {disabled ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </form>
  )
}
