"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  const [ripDirection, setRipDirection] = useState<"left" | "right" | null>(null)
  const ripTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open && deck) {
      if (ripTimeoutRef.current) {
        clearTimeout(ripTimeoutRef.current)
        ripTimeoutRef.current = null
      }
      setCurrentIndex(0)
      setFlipped(false)
      setRipDirection(null)
      setReviews(
        Array.from({ length: deck.cards.length }, () => ({
          decision: null,
          revealed: false,
        }))
      )
    }
  }, [open, deck?.id])

  useEffect(() => {
    return () => {
      if (ripTimeoutRef.current) {
        clearTimeout(ripTimeoutRef.current)
      }
    }
  }, [])

  const totalCards = deck?.cards.length ?? 0
  const card = deck?.cards[currentIndex]
  const doneCount = reviews.filter((r) => r?.decision !== null).length
  const gotWithoutRevealCount = reviews.filter((r) => r?.decision === "got-it" && !r.revealed).length
  const gotWithRevealCount = reviews.filter((r) => r?.decision === "got-it" && r.revealed).length
  const dontKnowCount = reviews.filter((r) => r?.decision === "dont-know").length
  const isLast = currentIndex === totalCards - 1
  const completed = totalCards > 0 && doneCount === totalCards
  const renderCard = card ?? { question: "", answer: "" }
  const isTransitioning = ripDirection !== null

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
    if (isTransitioning || completed) return
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
    if (!canRate || value === null || isTransitioning) return
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
      const direction = value === "got-it" ? "right" : "left"
      setRipDirection(direction)

      if (ripTimeoutRef.current) {
        clearTimeout(ripTimeoutRef.current)
      }

      ripTimeoutRef.current = setTimeout(() => {
        setCurrentIndex((prev) => Math.min(prev + 1, totalCards - 1))
        setFlipped(false)
        setRipDirection(null)
        ripTimeoutRef.current = null
      }, 300)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="surface-elevated flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/75 bg-background/92 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div>
            <h2 className="font-heading text-xl font-semibold">{deck.title}</h2>
            <p className="text-sm text-muted-foreground">
              Card {Math.min(currentIndex + 1, deck.cards.length)} of {deck.cards.length} • {progressPct}% completed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="animated-button rounded-xl border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/45 hover:text-primary"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {completed ? (
            <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-border/70 bg-muted/28 p-6 text-center">
              <h3 className="font-heading text-2xl font-semibold">Flashcards Completed</h3>
              <p className="mt-2 text-sm text-muted-foreground">Great review session. Here is your quick summary:</p>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3">
                  <p className="font-semibold text-green-700">Got it (without reveal)</p>
                  <p className="text-lg font-bold text-green-700">{gotWithoutRevealCount}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="font-semibold text-emerald-700">Got it (after reveal)</p>
                  <p className="text-lg font-bold text-emerald-700">{gotWithRevealCount}</p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
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
                  disabled={isTransitioning}
                  className="group relative block h-90 w-full disabled:cursor-not-allowed"
                >
                  <div
                    className={`relative h-full w-full rounded-3xl transition-transform duration-700 transform-3d ${
                      ripDirection === "right"
                        ? "flashcard-rip-right"
                        : ripDirection === "left"
                          ? "flashcard-rip-left"
                          : ""
                    } ${
                      flipped ? "transform-[rotateY(180deg)]" : ""
                    }`}
                  >
                    <div className="absolute inset-0 rounded-3xl border border-border/75 bg-linear-to-br from-sky-500/14 to-indigo-500/10 p-7 text-left backface-hidden">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Question</p>
                      <p className="mt-5 text-2xl font-semibold leading-relaxed">{renderCard.question}</p>
                      <p className="absolute bottom-6 right-7 text-xs text-muted-foreground">Tap card to reveal answer</p>
                    </div>

                    <div className="absolute inset-0 rounded-3xl border border-border/75 bg-linear-to-br from-emerald-500/12 to-teal-500/10 p-7 text-left backface-hidden transform-[rotateY(180deg)]">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Answer</p>
                      <p className="mt-5 whitespace-pre-wrap text-lg leading-relaxed">{renderCard.answer}</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="mx-auto mt-6 flex max-w-2xl items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentIndex((prev) => Math.max(0, prev - 1))
                    setFlipped(false)
                  }}
                  disabled={currentIndex === 0 || isTransitioning}
                  className="animated-button rounded-xl border border-border/75 bg-background/75 px-4 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleRate("dont-know")}
                    disabled={!canRate || isTransitioning}
                    className="animated-button rounded-xl border border-amber-500/45 bg-amber-500/12 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-500/24 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Don’t know
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate("got-it")}
                    disabled={!canRate || isTransitioning}
                    className="animated-button rounded-xl border border-green-500/45 bg-green-500/12 px-4 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-500/24 disabled:cursor-not-allowed disabled:opacity-50"
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
                  disabled={isLast || isTransitioning}
                  className="animated-button rounded-xl border border-primary/45 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="mx-auto mt-2 flex max-w-2xl items-center justify-center text-xs text-muted-foreground">
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

        <div className="border-t border-border/70 px-6 py-4 text-sm text-muted-foreground">
          You can mark <strong>Got it</strong> or <strong>Don’t know</strong> on both front and back.
          Revealed cards are tracked separately in the final summary.
        </div>
      </div>
    </div>
  )
}
