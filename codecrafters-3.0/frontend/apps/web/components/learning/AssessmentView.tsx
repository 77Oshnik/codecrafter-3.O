"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, CheckCircle } from "lucide-react"
import type { AssessmentQuestion } from "@/lib/api"

interface Props {
  topic: string
  questions: AssessmentQuestion[]
  onSubmit: (answers: number[]) => Promise<void>
  onCancel: () => void
}

const DIFFICULTY_COLOR = {
  easy: "text-green-500 bg-green-500/10",
  medium: "text-yellow-500 bg-yellow-500/10",
  hard: "text-red-500 bg-red-500/10"
}

export function AssessmentView({ topic, questions, onSubmit, onCancel }: Props) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null))
  const [submitting, setSubmitting] = useState(false)

  const question = questions[current]
  const answered = answers.filter(a => a !== null).length
  const allAnswered = answered === questions.length

  if (!question) {
    return (
      <div className="w-full h-full overflow-y-auto flex items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">No assessment question available.</p>
      </div>
    )
  }

  const select = (optionIdx: number) => {
    const next = [...answers]
    next[current] = optionIdx
    setAnswers(next)
    if (current < questions.length - 1) {
      setTimeout(() => setCurrent(c => c + 1), 350)
    }
  }

  const handleSubmit = async () => {
    if (!allAnswered) return
    setSubmitting(true)
    try {
      await onSubmit(answers as number[])
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full h-full overflow-y-auto flex items-start justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" />
              Cancel
            </button>
            <span className="text-xs text-muted-foreground">{answered}/{questions.length} answered</span>
          </div>
          <h1 className="text-lg font-semibold mb-1">Knowledge Assessment: {topic}</h1>
          <p className="text-sm text-muted-foreground">
            Answer honestly — this helps us build your personalized learning roadmap.
          </p>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(answered / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question navigator dots */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-7 h-7 text-xs rounded-full border transition-all ${
                i === current
                  ? "bg-primary text-primary-foreground border-primary"
                  : answers[i] !== null
                  ? "bg-primary/20 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {answers[i] !== null ? <CheckCircle className="w-3.5 h-3.5 mx-auto" /> : i + 1}
            </button>
          ))}
        </div>

        {/* Question card */}
        <div className="bg-muted/30 border border-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[question.difficulty]}`}>
              {question.difficulty}
            </span>
            <span className="text-xs text-muted-foreground">{question.subtopic}</span>
            <span className="text-xs text-muted-foreground ml-auto">Q{current + 1} of {questions.length}</span>
          </div>

          <p className="text-sm font-medium mb-4 leading-relaxed">{question.question}</p>

          <div className="space-y-2">
            {question.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => select(i)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                  answers[current] === i
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <span className="font-medium mr-2 text-muted-foreground">
                  {String.fromCharCode(65 + i)}.
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Analyzing..." : "Submit Assessment"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
