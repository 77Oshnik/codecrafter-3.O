"use client"

import { useState } from "react"
import { X, Loader2, CheckCircle, XCircle, Trophy, RotateCcw, ArrowRight } from "lucide-react"
import type { LearningQuizQuestion, LearningQuizSubmitResult } from "@/lib/api"

interface Props {
  quizId: string
  questions: LearningQuizQuestion[]
  onSubmit: (quizId: string, answers: number[]) => Promise<LearningQuizSubmitResult>
  onClose: () => void
  onNext?: (nextInfo: LearningQuizSubmitResult["nextInfo"]) => void
}

export function SubtopicQuizModal({ quizId, questions, onSubmit, onClose, onNext }: Props) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null))
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<LearningQuizSubmitResult | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const question = questions[current]
  const allAnswered = answers.every(a => a !== null)

  const select = (idx: number) => {
    if (result) return
    const next = [...answers]
    next[current] = idx
    setAnswers(next)
    if (current < questions.length - 1) {
      setTimeout(() => setCurrent(c => c + 1), 300)
    }
  }

  const handleSubmit = async () => {
    if (!allAnswered) return
    setSubmitError("")
    console.log("[SubtopicQuizModal] submit clicked", {
      quizId,
      currentQuestion: current,
      totalQuestions: questions.length,
      answers,
    })
    setSubmitting(true)
    try {
      const res = await onSubmit(quizId, answers as number[])
      console.log("[SubtopicQuizModal] submit succeeded", {
        quizId,
        percentage: res.percentage,
        passed: res.passed,
      })
      setResult(res)
    } catch (error) {
      console.error("[SubtopicQuizModal] submit failed", {
        quizId,
        answers,
        error,
      })
      setSubmitError(error instanceof Error ? error.message : "Failed to submit quiz")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = () => {
    setAnswers(Array(questions.length).fill(null))
    setCurrent(0)
    setResult(null)
    setShowReview(false)
  }

  if (result && !showReview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            result.passed ? "bg-green-500/10" : "bg-red-500/10"
          }`}>
            {result.passed ? (
              <Trophy className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
          </div>

          <h2 className="text-lg font-semibold mb-1">
            {result.passed ? "Great Work!" : "Keep Practicing"}
          </h2>
          <p className="text-4xl font-bold my-3">{result.percentage}%</p>
          <p className="text-sm text-muted-foreground mb-1">
            {result.score}/{result.total} correct
          </p>
          <p className="text-xs text-muted-foreground mb-4">{result.message}</p>

          <div className="bg-muted/30 rounded-lg p-3 mb-5 text-left">
            <p className="text-xs text-muted-foreground">Confidence Score</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${result.confidenceScore >= 80 ? "bg-green-500" : result.confidenceScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${result.confidenceScore}%` }}
                />
              </div>
              <span className="text-xs font-medium">{result.confidenceScore}%</span>
            </div>
            {result.nextReviewAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Next review: {new Date(result.nextReviewAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowReview(true)}
              className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              Review Answers
            </button>
            {result.passed ? (
              result.nextInfo ? (
                <button
                  onClick={() => onNext?.(result.nextInfo)}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                >
                  {result.nextInfo.subtopicType === "revision" ? "Go To Revision" : "Next"} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
                  Done
                </button>
              )
            ) : result.nextInfo ? (
              <button
                onClick={() => onNext?.(result.nextInfo)}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                {result.nextInfo.subtopicType === "revision" ? "Start Revision" : "Continue"} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleRetry}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (result && showReview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold">Answer Review</h2>
            <button onClick={() => setShowReview(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {result.feedback.map((fb, i) => (
              <div key={i} className={`border rounded-lg p-3 ${fb.isCorrect ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-start gap-2 mb-2">
                  {fb.isCorrect ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                  <p className="text-xs font-medium">{fb.question}</p>
                </div>
                <p className="text-xs text-muted-foreground ml-6">{fb.explanation}</p>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border">
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Subtopic Quiz</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{current + 1}/{questions.length}</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
        </div>

        <div className="p-5">
          <p className="text-sm font-medium mb-4 leading-relaxed">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => select(i)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                  answers[current] === i
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-4 gap-2">
          {submitError ? (
            <p className="text-xs text-destructive flex-1">{submitError}</p>
          ) : (
            <div className="flex-1" />
          )}

          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
          >
            ← Back
          </button>

          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? "Submitting..." : "Submit Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
