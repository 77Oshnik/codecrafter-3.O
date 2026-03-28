"use client"

import { useEffect, useMemo, useState } from "react"
import type { GeneratedFlashcards } from "@/lib/api"

interface Props {
  open: boolean
  deck: GeneratedFlashcards | null
  onClose: () => void
}

type ReviewState = "got-it" | "dont-know" | null
type CardReview = {
  decision: ReviewState
  revealed: boolean
}

export function FlashcardsModal({ open, deck, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviews, setReviews] = useState<CardReview[]>([])

  useEffect(() => {
    if (open && deck) {
      setCurrentIndex(0)
      setFlipped(false)
      setReviews(
        Array.from({ length: deck.cards.length }, () => ({
          decision: null,
          revealed: false,
        }))
      )
    }
  }, [open, deck?.id])

  const totalCards = deck?.cards.length ?? 0
  const card = deck?.cards[currentIndex]
  const doneCount = reviews.filter((r) => r?.decision !== null).length
  const gotWithoutRevealCount = reviews.filter((r) => r?.decision === "got-it" && !r.revealed).length
  const gotWithRevealCount = reviews.filter((r) => r?.decision === "got-it" && r.revealed).length
  const dontKnowCount = reviews.filter((r) => r?.decision === "dont-know").length
  const isLast = currentIndex === totalCards - 1
  const completed = totalCards > 0 && doneCount === totalCards
  const renderCard = card ?? { question: "", answer: "" }

  const progressPct = useMemo(() => {
    if (totalCards === 0) return 0
    return Math.round((doneCount / totalCards) * 100)
  }, [doneCount, totalCards])

  if (!open || !deck) return null

  if (!completed && !card) {
    return null
  }

  const canRate = !completed
  const currentReview = reviews[currentIndex] ?? { decision: null, revealed: false }

  function toggleFlip() {
    const nextFlipped = !flipped
    setFlipped(nextFlipped)

    if (nextFlipped) {
      setReviews((prev) => {
        const next = [...prev]
        const existing = next[currentIndex] ?? { decision: null, revealed: false }
        next[currentIndex] = { ...existing, revealed: true }
        return next
      })
    }
  }

  function handleRate(value: ReviewState) {
    if (!canRate || value === null) return
    setReviews((prev) => {
      const next = [...prev]
      const existing = next[currentIndex] ?? { decision: null, revealed: false }
      next[currentIndex] = {
        ...existing,
        decision: value,
      }
      return next
    })

    if (!isLast) {
      setCurrentIndex((prev) => prev + 1)
      setFlipped(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{deck.title}</h2>
            <p className="text-xs text-muted-foreground">
              Card {Math.min(currentIndex + 1, deck.cards.length)} of {deck.cards.length} • {progressPct}% completed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {completed ? (
            <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border bg-muted/30 p-6 text-center">
              <h3 className="text-lg font-semibold">Flashcards Completed 🎉</h3>
              <p className="mt-2 text-sm text-muted-foreground">Great review session. Here’s your quick summary:</p>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <p className="font-semibold text-green-700">Got it (without reveal)</p>
                  <p className="text-lg font-bold text-green-700">{gotWithoutRevealCount}</p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="font-semibold text-emerald-700">Got it (after reveal)</p>
                  <p className="text-lg font-bold text-emerald-700">{gotWithRevealCount}</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="font-semibold text-amber-700">Didn’t know at all</p>
                  <p className="text-lg font-bold text-amber-700">{dontKnowCount}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mx-auto max-w-2xl perspective-distant">
                <button
                  type="button"
                  onClick={toggleFlip}
                  className="group relative block h-80 w-full"
                >
                  <div
                    className={`relative h-full w-full rounded-2xl transition-transform duration-700 transform-3d ${
                      flipped ? "transform-[rotateY(180deg)]" : ""
                    }`}
                  >
                    <div className="absolute inset-0 rounded-2xl border border-border bg-linear-to-br from-sky-500/10 to-indigo-500/10 p-6 text-left backface-hidden">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Question</p>
                      <p className="mt-4 text-lg font-medium leading-relaxed">{renderCard.question}</p>
                      <p className="absolute bottom-5 right-6 text-xs text-muted-foreground">Tap card to reveal answer</p>
                    </div>

                    <div className="absolute inset-0 rounded-2xl border border-border bg-linear-to-br from-emerald-500/10 to-teal-500/10 p-6 text-left backface-hidden transform-[rotateY(180deg)]">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Answer</p>
                      <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{renderCard.answer}</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mx-auto mt-5 flex max-w-2xl items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex((prev) => Math.max(0, prev - 1))
                    setFlipped(false)
                  }}
                  disabled={currentIndex === 0}
                  className="rounded-md border border-border px-3 py-2 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRate("dont-know")}
                    disabled={!canRate}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Don’t know
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate("got-it")}
                    disabled={!canRate}
                    className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Got it
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!isLast) {
                      setCurrentIndex((prev) => prev + 1)
                      setFlipped(false)
                    }
                  }}
                  disabled={isLast}
                  className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="mx-auto mt-2 flex max-w-2xl items-center justify-center text-[11px] text-muted-foreground">
                {currentReview.decision === null
                  ? "Mark this card as Got it or Don’t know from either face."
                  : currentReview.decision === "got-it"
                    ? currentReview.revealed
                      ? "Marked: Got it (after reveal)"
                      : "Marked: Got it (without reveal)"
                    : "Marked: Don’t know"}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          You can mark <strong>Got it</strong> or <strong>Don’t know</strong> on both front and back.
          Revealed cards are tracked separately in the final summary.
        </div>
      </div>
    </div>
  )
}
