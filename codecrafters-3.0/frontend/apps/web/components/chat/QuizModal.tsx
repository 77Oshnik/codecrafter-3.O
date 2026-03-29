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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="surface-elevated flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border/75 bg-background/92 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div>
            <h2 className="font-heading text-xl font-semibold">{quiz.title}</h2>
            <p className="text-sm text-muted-foreground">15 questions • based on your uploaded documents</p>
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
          {!finalResult && currentQuestion && (
            <div className="card-pop rounded-3xl border border-border/75 bg-background/80 p-5 shadow-sm">
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Question Progress
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {currentQuestion.questionNumber}/{quiz.questions.length}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/55">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${(currentQuestion.questionNumber / quiz.questions.length) * 100}%` }}
                  />
                </div>
              </div>

              <p className="mb-1 text-xs text-muted-foreground">
                Question {currentQuestion.questionNumber} of {quiz.questions.length}
              </p>
              <p className="mb-4 text-lg font-semibold leading-relaxed">
                Q{currentQuestion.questionNumber}. {currentQuestion.question}
              </p>

              <div className="space-y-2.5">
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
                      className={`interactive-card w-full rounded-2xl border px-4 py-3 text-left text-sm transition-all ${
                        isCorrectOption
                          ? "border-emerald-500/60 bg-emerald-500/12"
                          : isWrongSelected
                            ? "border-destructive/70 bg-destructive/10"
                            : selected
                              ? "border-primary/60 bg-primary/12"
                              : "border-border/70 bg-background/80 hover:border-primary/35 hover:bg-accent/45"
                      } ${currentFeedback ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/75 bg-background/75 text-xs font-semibold text-muted-foreground">
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      {option}
                    </button>
                  )
                })}
              </div>

              {checking && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking answer...
                </div>
              )}

              {currentFeedback && (
                <div className="mt-3 space-y-2 rounded-2xl border border-border/65 bg-muted/35 p-3 text-sm">
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
                    className="animated-button rounded-xl border border-border/75 bg-background/75 px-4 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                {!isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => prev + 1)}
                    disabled={!canGoNext || submitting || checking}
                    className="animated-button rounded-xl border border-primary/45 bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next Question
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onSubmit(answers)}
                    disabled={!canSubmit || submitting || checking}
                    className="animated-button inline-flex items-center gap-2 rounded-xl border border-primary/45 bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Finish & View Result
                  </button>
                )}
              </div>
            </div>
          )}

          {finalResult && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/25 p-5">
                <h3 className="font-heading text-xl font-semibold">Overall Result</h3>
                <p className="mt-2 text-base">
                  Score: <strong>{finalResult.score}/{finalResult.total}</strong> ({finalResult.percentage}%)
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 p-5">
                <h4 className="mb-3 text-base font-semibold">Question Summary</h4>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-8">
                  {finalResult.feedback.map((item, idx) => (
                    <button
                      key={`summary-${idx}`}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`interactive-card rounded-xl border px-2.5 py-2 text-sm font-semibold ${
                        item.isCorrect
                          ? "border-green-500/40 bg-green-500/12"
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

        <div className="flex items-center justify-between border-t border-border/70 px-6 py-4">
          {finalResult ? (
            <p className="text-base font-medium">
              Score: {finalResult.score}/{finalResult.total} ({finalResult.percentage}%)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Answer each question to move ahead.</p>
          )}

          {finalResult && (
            <button
              type="button"
              onClick={onClose}
              className="animated-button rounded-xl border border-primary/45 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
