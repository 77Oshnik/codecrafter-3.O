"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import type { GeneratedQuiz, QuizSubmissionResult, QuizFeedbackItem } from "@/lib/api"

interface Props {
  open: boolean
  quiz: GeneratedQuiz | null
  liveFeedback: Array<QuizFeedbackItem | null>
  finalResult: QuizSubmissionResult | null
  checking: boolean
  submitting: boolean
  onClose: () => void
  onCheckAnswer: (questionIndex: number, selectedOptionIndex: number) => Promise<void>
  onSubmit: (answers: number[]) => Promise<void>
}

export function QuizModal({
  open,
  quiz,
  liveFeedback,
  finalResult,
  checking,
  submitting,
  onClose,
  onCheckAnswer,
  onSubmit,
}: Props) {
  const [answers, setAnswers] = useState<number[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentQuestion = quiz?.questions[currentIndex]
  const currentFeedback = liveFeedback[currentIndex]
  const currentAnswer = answers[currentIndex]

  useEffect(() => {
    if (open && quiz) {
      setAnswers([])
      setCurrentIndex(0)
    }
  }, [open, quiz?.id])

  const canSubmit = useMemo(() => {
    if (!quiz || finalResult) return false
    return answers.length === quiz.questions.length && answers.every((a) => a >= 0 && a <= 3)
  }, [quiz, finalResult, answers])

  const canGoNext = !!currentFeedback && currentIndex < (quiz?.questions.length ?? 0) - 1
  const isLastQuestion = currentIndex === (quiz?.questions.length ?? 1) - 1

  if (!open || !quiz) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{quiz.title}</h2>
            <p className="text-xs text-muted-foreground">15 questions • Based on your uploaded documents</p>
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
          {!finalResult && currentQuestion && (
            <div className="rounded-xl border border-border p-4">
              <p className="mb-1 text-xs text-muted-foreground">
                Question {currentQuestion.questionNumber} of {quiz.questions.length}
              </p>
              <p className="mb-3 text-sm font-medium">
                Q{currentQuestion.questionNumber}. {currentQuestion.question}
              </p>

              <div className="space-y-2">
                {currentQuestion.options.map((option, optIdx) => {
                  const selected = currentAnswer === optIdx
                  const isCorrectOption = currentFeedback?.correctOptionIndex === optIdx
                  const isWrongSelected = currentFeedback?.selectedOptionIndex === optIdx && !currentFeedback.isCorrect

                  return (
                    <button
                      key={`${currentQuestion.questionNumber}-${optIdx}`}
                      type="button"
                      disabled={!!currentFeedback || checking}
                      onClick={async () => {
                        setAnswers((prev) => {
                          const next = [...prev]
                          next[currentIndex] = optIdx
                          return next
                        })
                        await onCheckAnswer(currentIndex, optIdx)
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        isCorrectOption
                          ? "border-green-500/60 bg-green-500/10"
                          : isWrongSelected
                            ? "border-destructive/70 bg-destructive/10"
                            : selected
                              ? "border-primary/60 bg-primary/10"
                              : "border-border hover:bg-accent/60"
                      } ${currentFeedback ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="font-medium">{String.fromCharCode(65 + optIdx)}.</span> {option}
                    </button>
                  )
                })}
              </div>

              {checking && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking answer...
                </div>
              )}

              {currentFeedback && (
                <div className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    {currentFeedback.isCorrect ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    )}
                    <p className={currentFeedback.isCorrect ? "text-green-700" : "text-destructive"}>
                      {currentFeedback.isCorrect
                        ? "Correct!"
                        : `Wrong choice: ${String.fromCharCode(65 + currentFeedback.selectedOptionIndex)}.`}
                      <span className="ml-1">{currentFeedback.selectedReason}</span>
                    </p>
                  </div>
                  {!currentFeedback.isCorrect && (
                    <p className="text-foreground/80">
                      Correct answer is <strong>{String.fromCharCode(65 + currentFeedback.correctOptionIndex)}</strong>. {currentFeedback.correctReason}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0 || submitting || checking}
                  className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                {!isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => prev + 1)}
                    disabled={!canGoNext || submitting || checking}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next Question
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onSubmit(answers)}
                    disabled={!canSubmit || submitting || checking}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Finish & View Result
                  </button>
                )}
              </div>
            </div>
          )}

          {finalResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <h3 className="text-base font-semibold">Overall Result</h3>
                <p className="mt-1 text-sm">
                  Score: <strong>{finalResult.score}/{finalResult.total}</strong> ({finalResult.percentage}%)
                </p>
              </div>

              <div className="rounded-xl border border-border p-4">
                <h4 className="mb-2 text-sm font-medium">Question Summary</h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
                  {finalResult.feedback.map((item, idx) => (
                    <button
                      key={`summary-${idx}`}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        item.isCorrect
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-destructive/40 bg-destructive/10"
                      }`}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {finalResult ? (
            <p className="text-sm font-medium">
              Score: {finalResult.score}/{finalResult.total} ({finalResult.percentage}%)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Answer each question to move ahead.</p>
          )}

          {finalResult && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
