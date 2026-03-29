"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Paperclip,
  X,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Menu,
  Sparkles,
  MessageSquare,
  FileText,
} from "lucide-react"
import { ConversationSidebar } from "./ConversationSidebar"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { StudyToolsPanel } from "./StudyToolsPanel"
import type { StudyTool } from "./StudyToolsPanel"
import { QuizModal } from "./QuizModal"
import { FlashcardsModal } from "./FlashcardsModal"
import { FlowchartModal } from "./FlowchartModal"
import { FlowchartPromptModal } from "./FlowchartPromptModal"
import {
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  sendMessage,
  listDocuments,
  uploadDocument,
  deleteDocument,
  generateDocumentSummary,
  generateConversationRevision,
  generateQuiz,
  getQuizById,
  checkQuizAnswer,
  submitQuiz,
  listStudySidebarData,
  createStudyResource,
  deleteStudyResource,
  deleteStudyResult,
  generateFlashcards,
  getFlashcardsById,
  generateFlowchart,
  getFlowchartById,
  type Conversation,
  type Message,
  type Document,
  type GeneratedQuiz,
  type QuizFeedbackItem,
  type QuizSubmissionResult,
  type GeneratedFlashcards,
  type GeneratedFlowchart,
  type StudyResourceItem,
  type StudyResultItem,
} from "@/lib/api"
import { clamp, uiConfig } from "@/lib/ui-config"
import { downloadRevisionPdf } from "@/lib/revision-pdf"

function buildRevisionBullets(text: string): string[] {
  const lines = text.split("\n").map((line) => line.trim())
  const explicitBullets = lines
    .map((line) => line.replace(/^([-*+]\s+|\d+\.\s+)/, "").trim())
    .filter((line, index) => line.length > 0 && /^([-*+]\s+|\d+\.\s+)/.test(lines[index] ?? ""))

  if (explicitBullets.length > 0) {
    return explicitBullets.slice(0, 12)
  }

  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .slice(0, 8)
}

interface WorkspaceLayoutState {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

const defaultWorkspaceLayout: WorkspaceLayoutState = {
  leftWidth: uiConfig.dashboard.left.defaultWidthPx,
  rightWidth: uiConfig.dashboard.right.defaultWidthPx,
  leftCollapsed: false,
  rightCollapsed: false,
}

interface PendingDeleteAction {
  kind: string
  itemName: string
  onConfirm: () => Promise<void>
}

export function ChatInterface() {
  const { data: session } = useSession()
  const router = useRouter()
  const token = session?.user?.backendToken ?? ""

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [studyResources, setStudyResources] = useState<StudyResourceItem[]>([])
  const [studyResults, setStudyResults] = useState<StudyResultItem[]>([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null)
  const [quizModalOpen, setQuizModalOpen] = useState(false)
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false)
  const [isCheckingQuizAnswer, setIsCheckingQuizAnswer] = useState(false)
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false)
  const [activeQuiz, setActiveQuiz] = useState<GeneratedQuiz | null>(null)
  const [quizLiveFeedback, setQuizLiveFeedback] = useState<Array<QuizFeedbackItem | null>>([])
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null)
  const [flashcardsModalOpen, setFlashcardsModalOpen] = useState(false)
  const [activeFlashcards, setActiveFlashcards] = useState<GeneratedFlashcards | null>(null)
  const [flowchartModalOpen, setFlowchartModalOpen] = useState(false)
  const [activeFlowchart, setActiveFlowchart] = useState<GeneratedFlowchart | null>(null)
  const [flowchartPromptOpen, setFlowchartPromptOpen] = useState(false)
  const [revisionText, setRevisionText] = useState("")
  const [revisionBullets, setRevisionBullets] = useState<string[]>([])
  const [revisionFileName, setRevisionFileName] = useState("revision-notes.pdf")
  const [generatingRevision, setGeneratingRevision] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const [layout, setLayout] = useState<WorkspaceLayoutState>(defaultWorkspaceLayout)
  const [isDesktop, setIsDesktop] = useState(true)
  const [isLayoutReady, setIsLayoutReady] = useState(false)
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false)
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false)
  const [resizingSide, setResizingSide] = useState<"left" | "right" | null>(null)

  const leftPanelWidth = layout.leftCollapsed
    ? uiConfig.dashboard.left.collapsedWidthPx
    : layout.leftWidth

  const rightPanelWidth = layout.rightCollapsed
    ? uiConfig.dashboard.right.collapsedWidthPx
    : layout.rightWidth

  // Load conversations on mount
  useEffect(() => {
    if (!token) return
    listConversations(token)
      .then(setConversations)
      .catch((e) => setError(e.message))
  }, [token])

  // Load messages + documents when active conversation changes
  useEffect(() => {
    if (!token || !activeId) {
      setMessages([])
      setDocuments([])
      setRevisionText("")
      setRevisionBullets([])
      return
    }
    getConversation(token, activeId)
      .then((c) => setMessages(c.messages))
      .catch((e) => setError(e.message))
    listDocuments(token, activeId)
      .then(setDocuments)
      .catch(() => {})

    listStudySidebarData(token, activeId)
      .then(({ resources, results }) => {
        setStudyResources(resources)
        setStudyResults(results)
      })
      .catch(() => {})
  }, [token, activeId])

  useEffect(() => {
    if (typeof window === "undefined") return

    const media = window.matchMedia(`(min-width: ${uiConfig.dashboard.breakpointPx}px)`)

    const syncViewport = () => {
      const desktop = media.matches
      setIsDesktop(desktop)

      if (desktop) {
        setIsLeftDrawerOpen(false)
        setIsRightDrawerOpen(false)
      } else {
        setLayout((prev) => ({
          ...prev,
          leftCollapsed: true,
          rightCollapsed: true,
        }))
      }
    }

    syncViewport()
    media.addEventListener("change", syncViewport)

    return () => {
      media.removeEventListener("change", syncViewport)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const saved = window.localStorage.getItem(uiConfig.dashboard.storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<WorkspaceLayoutState>
        setLayout({
          leftWidth: clamp(
            Number(parsed.leftWidth) || defaultWorkspaceLayout.leftWidth,
            uiConfig.dashboard.left.minWidthPx,
            uiConfig.dashboard.left.maxWidthPx
          ),
          rightWidth: clamp(
            Number(parsed.rightWidth) || defaultWorkspaceLayout.rightWidth,
            uiConfig.dashboard.right.minWidthPx,
            uiConfig.dashboard.right.maxWidthPx
          ),
          leftCollapsed: Boolean(parsed.leftCollapsed),
          rightCollapsed: Boolean(parsed.rightCollapsed),
        })
      }
    } catch {
      // Ignore malformed user storage and keep defaults.
    }

    setIsLayoutReady(true)
  }, [])

  useEffect(() => {
    if (!isLayoutReady || typeof window === "undefined") return

    try {
      window.localStorage.setItem(uiConfig.dashboard.storageKey, JSON.stringify(layout))
    } catch {
      // Storage write failure should not impact runtime behavior.
    }
  }, [layout, isLayoutReady])

  const toggleLeftCollapsed = useCallback(() => {
    setLayout((prev) => ({ ...prev, leftCollapsed: !prev.leftCollapsed }))
  }, [])

  const toggleRightCollapsed = useCallback(() => {
    setLayout((prev) => ({ ...prev, rightCollapsed: !prev.rightCollapsed }))
  }, [])

  const startPanelResize = useCallback(
    (side: "left" | "right", event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isDesktop) return

      event.preventDefault()
      setResizingSide(side)

      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }

      const onPointerMove = (moveEvent: PointerEvent) => {
        const container = workspaceRef.current
        if (!container) return

        const rect = container.getBoundingClientRect()
        const reservedSpace =
          uiConfig.dashboard.minContentWidthPx + uiConfig.dashboard.handleWidthPx * 2

        setLayout((prev) => {
          const nextBase: WorkspaceLayoutState = {
            ...prev,
            leftCollapsed: side === "left" ? false : prev.leftCollapsed,
            rightCollapsed: side === "right" ? false : prev.rightCollapsed,
          }

          const currentLeft = nextBase.leftCollapsed
            ? uiConfig.dashboard.left.collapsedWidthPx
            : nextBase.leftWidth
          const currentRight = nextBase.rightCollapsed
            ? uiConfig.dashboard.right.collapsedWidthPx
            : nextBase.rightWidth

          if (side === "left") {
            const rawLeft = moveEvent.clientX - rect.left
            const maxLeftByContent = rect.width - currentRight - reservedSpace
            const maxLeft = clamp(
              maxLeftByContent,
              uiConfig.dashboard.left.minWidthPx,
              uiConfig.dashboard.left.maxWidthPx
            )

            return {
              ...nextBase,
              leftWidth: clamp(rawLeft, uiConfig.dashboard.left.minWidthPx, maxLeft),
            }
          }

          const rawRight = rect.right - moveEvent.clientX
          const maxRightByContent = rect.width - currentLeft - reservedSpace
          const maxRight = clamp(
            maxRightByContent,
            uiConfig.dashboard.right.minWidthPx,
            uiConfig.dashboard.right.maxWidthPx
          )

          return {
            ...nextBase,
            rightWidth: clamp(rawRight, uiConfig.dashboard.right.minWidthPx, maxRight),
          }
        })
      }

      const clearPointerListeners = () => {
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", clearPointerListeners)
        setResizingSide(null)

        if (typeof document !== "undefined") {
          document.body.style.cursor = ""
          document.body.style.userSelect = ""
        }

        resizeCleanupRef.current = null
      }

      resizeCleanupRef.current = clearPointerListeners
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", clearPointerListeners)
    },
    [isDesktop]
  )

  const refreshStudySidebar = useCallback(
    async (conversationId: string) => {
      if (!token) return
      try {
        const { resources, results } = await listStudySidebarData(token, conversationId)
        setStudyResources(resources)
        setStudyResults(results)
      } catch {
        // Non-fatal: sidebar can remain stale until next refresh.
      }
    },
    [token]
  )

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollDocumentStatus = useCallback(
    (t: string, convId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const docs = await listDocuments(t, convId)
          setDocuments(docs)
          const allDone = docs.every((d) => d.status === "ready" || d.status === "failed")
          if (allDone) stopPolling()
        } catch {
          stopPolling()
        }
      }, 3000)
    },
    [stopPolling]
  )

  // Clean up polling and pointer listeners on unmount.
  useEffect(() => {
    return () => {
      stopPolling()
      resizeCleanupRef.current?.()
    }
  }, [stopPolling])

  const handleNewConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setDocuments([])
    stopPolling()
  }, [stopPolling])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setError(null)
      stopPolling()
    },
    [stopPolling]
  )

  const executeDeleteConversation = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteConversation(token, id)
        setConversations((prev) => prev.filter((c) => c._id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
          setDocuments([])
          stopPolling()
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, activeId, stopPolling]
  )

  const requestDelete = useCallback(
    (kind: string, itemName: string, onConfirm: () => Promise<void>) => {
      setPendingDelete({ kind, itemName, onConfirm })
    },
    []
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      const conversation = conversations.find((c) => c._id === id)
      const itemName = conversation?.title || "this conversation"
      requestDelete("conversation", itemName, async () => {
        await executeDeleteConversation(id)
      })
    },
    [conversations, requestDelete, executeDeleteConversation]
  )

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!token || isLoading) return

      const userMsg: Message = { role: "user", content: text }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      setError(null)

      try {
        const conversationId = activeId ?? "new"
        const result = await sendMessage(token, conversationId, text)

        if (!activeId) {
          setActiveId(result.conversationId)
          setConversations((prev) => [
            {
              _id: result.conversationId,
              title: result.title,
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ])
        } else {
          setConversations((prev) =>
            prev.map((c) =>
              c._id === result.conversationId ? { ...c, title: result.title } : c
            )
          )
        }

        setMessages((prev) => [...prev, result.message])
        return result.conversationId
      } catch (e) {
        setError((e as Error).message)
        setMessages((prev) => prev.slice(0, -1))
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [token, activeId, isLoading]
  )

  const handleUploadDocument = useCallback(
    async (file: File) => {
      if (!token || uploading) return
      setUploading(true)
      setError(null)
      try {
        // If no active conversation, create one first
        let convId = activeId
        if (!convId) {
          const newConv = await createConversation(token, "New Conversation")
          convId = newConv._id
          setActiveId(convId)
          setConversations((prev) => [newConv, ...prev])
        }

        const result = await uploadDocument(token, file, convId)
        setDocuments((prev) => [result.document, ...prev])
        pollDocumentStatus(token, convId)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setUploading(false)
      }
    },
    [token, uploading, activeId, pollDocumentStatus]
  )

  const executeDeleteDocument = useCallback(
    async (id: string) => {
      if (!token) return
      try {
        await deleteDocument(token, id)
        setDocuments((prev) => prev.filter((d) => d._id !== id))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token]
  )

  const handleDeleteDocument = useCallback(
    (id: string, docName: string) => {
      requestDelete("document", docName || "this document", async () => {
        await executeDeleteDocument(id)
      })
    },
    [requestDelete, executeDeleteDocument]
  )

  const executeDeleteStudyResource = useCallback(
    async (resourceId: string) => {
      if (!token) return
      setError(null)
      try {
        await deleteStudyResource(token, resourceId)
        setStudyResources((prev) => prev.filter((resource) => resource.id !== resourceId))
        if (activeId) {
          await refreshStudySidebar(activeId)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, activeId, refreshStudySidebar]
  )

  const handleDeleteStudyResource = useCallback(
    (resourceId: string) => {
      const resource = studyResources.find((item) => item.id === resourceId)
      const itemName = resource?.title || "this resource"
      requestDelete("study resource", itemName, async () => {
        await executeDeleteStudyResource(resourceId)
      })
    },
    [studyResources, requestDelete, executeDeleteStudyResource]
  )

  const executeDeleteStudyResult = useCallback(
    async (type: StudyResultItem["type"], resultId: string) => {
      if (!token) return
      setError(null)
      try {
        await deleteStudyResult(token, type, resultId)
        setStudyResults((prev) => prev.filter((result) => result.id !== resultId))
        if (activeId) {
          await refreshStudySidebar(activeId)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token, activeId, refreshStudySidebar]
  )

  const handleDeleteStudyResult = useCallback(
    (type: StudyResultItem["type"], resultId: string) => {
      const result = studyResults.find((item) => item.id === resultId)
      const itemName = result?.title || "this result"
      requestDelete(type, itemName, async () => {
        await executeDeleteStudyResult(type, resultId)
      })
    },
    [studyResults, requestDelete, executeDeleteStudyResult]
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    try {
      await pendingDelete.onConfirm()
      setPendingDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }, [pendingDelete, isDeleting])

  const handleGenerateSummary = useCallback(
    async (docId: string) => {
      if (!token || generatingSummaryId) return
      setGeneratingSummaryId(docId)
      try {
        const { summary } = await generateDocumentSummary(token, docId)
        setDocuments((prev) =>
          prev.map((d) => (d._id === docId ? { ...d, summary } : d))
        )
        setExpandedDocId(docId)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setGeneratingSummaryId(null)
      }
    },
    [token, generatingSummaryId]
  )

  const handleGenerateRevision = useCallback(async () => {
    if (!token || !activeId || generatingRevision) return
    if (documents.length === 0) {
      setError("Upload at least one document before generating revision.")
      return
    }

    setGeneratingRevision(true)
    setError(null)
    try {
      const result = await generateConversationRevision(token, activeId)
      setRevisionText(result.revision)
      setRevisionBullets(buildRevisionBullets(result.revision))
      setRevisionFileName(result.fileName || "revision-notes.pdf")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGeneratingRevision(false)
    }
  }, [token, activeId, generatingRevision, documents.length])

  const handleDownloadRevision = useCallback(async () => {
    if (!revisionText) return

    try {
      const combinedMarkdown =
        revisionBullets.length > 0
          ? `${revisionText}\n\n## Quick Bullet Points\n${revisionBullets
              .map((point) => `- ${point}`)
              .join("\n")}`
          : revisionText

      await downloadRevisionPdf(combinedMarkdown, revisionFileName)
    } catch {
      setError("Could not generate PDF. Please try again.")
    }
  }, [revisionText, revisionBullets, revisionFileName])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUploadDocument(file)
    e.target.value = ""
  }

  const handleSubmitQuiz = useCallback(
    async (answers: number[]) => {
      if (!token || !activeQuiz) return
      setIsSubmittingQuiz(true)
      try {
        const { result } = await submitQuiz(token, activeQuiz.id, answers)
        setQuizResult(result)
        if (activeId) {
          await refreshStudySidebar(activeId)
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsSubmittingQuiz(false)
      }
    },
    [token, activeQuiz, activeId, refreshStudySidebar]
  )

  const handleCheckQuizAnswer = useCallback(
    async (questionIndex: number, selectedOptionIndex: number) => {
      if (!token || !activeQuiz) return
      setIsCheckingQuizAnswer(true)
      try {
        const { feedback } = await checkQuizAnswer(token, activeQuiz.id, questionIndex, selectedOptionIndex)
        setQuizLiveFeedback((prev) => {
          const next = [...prev]
          next[questionIndex] = feedback
          return next
        })
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsCheckingQuizAnswer(false)
      }
    },
    [token, activeQuiz]
  )

  const openSavedQuiz = useCallback(
    async (quizId: string) => {
      if (!token || !quizId) return
      setIsGeneratingQuiz(true)
      setError(null)
      try {
        const { quiz } = await getQuizById(token, quizId)
        setActiveQuiz(quiz)
        setQuizLiveFeedback(Array.from({ length: quiz.questions.length }, () => null))
        setQuizResult(null)
        setQuizModalOpen(true)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsGeneratingQuiz(false)
      }
    },
    [token]
  )

  const handleSelectStudyTool = useCallback(
    async (tool: StudyTool) => {
      if (!token) return

      const toolId = tool.id
      const prompt = tool.prompt

      if (toolId === "youtube") {
        const qs = activeId ? `?conversationId=${encodeURIComponent(activeId)}` : ""
        router.push(`/dashboard/youtube${qs}`)
        return
      }

      if (toolId === "quiz") {
        if (!activeId) {
          setError("Please open a conversation with uploaded documents before generating a quiz.")
          return
        }

        setIsGeneratingQuiz(true)
        setQuizResult(null)
        try {
          const { quiz } = await generateQuiz(token, activeId)
          setActiveQuiz(quiz)
          setQuizLiveFeedback(Array.from({ length: quiz.questions.length }, () => null))
          setQuizModalOpen(true)
          await refreshStudySidebar(activeId)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setIsGeneratingQuiz(false)
        }
        return
      }

      if (toolId === "flashcards") {
        if (!activeId) {
          setError("Please open a conversation with uploaded documents before generating flashcards.")
          return
        }

        setIsGeneratingQuiz(true)
        try {
          const { flashcards } = await generateFlashcards(token, activeId)
          setActiveFlashcards(flashcards)
          setFlashcardsModalOpen(true)
          await refreshStudySidebar(activeId)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setIsGeneratingQuiz(false)
        }
        return
      }

      if (toolId === "flowchart") {
        if (!activeId) {
          setError("Please open a conversation with uploaded documents before generating flowchart.")
          return
        }

        setFlowchartPromptOpen(true)
        return
      }

      const conversationId = await handleSendMessage(prompt)
      if (!conversationId) return

      const titleByType: Record<string, string> = {
        flashcards: "Flashcards",
        flowchart: "Flowchart",
        revision: "Revision",
        youtube: "YouTube Learning Plan",
      }

      try {
        await createStudyResource(token, {
          conversationId,
          type: toolId as StudyResourceItem["type"],
          title: titleByType[toolId] || "Study Resource",
          description: "Generated from document context via Study Tools.",
        })
        await refreshStudySidebar(conversationId)
      } catch {
        // Resource tracking failure should not block chat output.
      }
    },
    [token, activeId, handleSendMessage, refreshStudySidebar, router]
  )

  const openSavedFlashcards = useCallback(
    async (flashcardsId: string) => {
      if (!token || !flashcardsId) return
      setIsGeneratingQuiz(true)
      setError(null)
      try {
        const { flashcards } = await getFlashcardsById(token, flashcardsId)
        setActiveFlashcards(flashcards)
        setFlashcardsModalOpen(true)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsGeneratingQuiz(false)
      }
    },
    [token]
  )

  const openSavedFlowchart = useCallback(
    async (flowchartId: string) => {
      if (!token || !flowchartId) return
      setIsGeneratingQuiz(true)
      setError(null)
      try {
        const { flowchart } = await getFlowchartById(token, flowchartId)
        setActiveFlowchart(flowchart)
        setFlowchartModalOpen(true)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsGeneratingQuiz(false)
      }
    },
    [token]
  )

  const handleGenerateFlowchartFromPreference = useCallback(
    async (flowchartPreference: string) => {
      if (!token) return
      if (!activeId) {
        setError("Please open a conversation with uploaded documents before generating flowchart.")
        return
      }

      setIsGeneratingQuiz(true)
      setError(null)
      try {
        const { flowchart } = await generateFlowchart(token, activeId, flowchartPreference)
        setActiveFlowchart(flowchart)
        setFlowchartModalOpen(true)
        setFlowchartPromptOpen(false)
        await refreshStudySidebar(activeId)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setIsGeneratingQuiz(false)
      }
    },
    [token, activeId, refreshStudySidebar]
  )

  const openStudyResource = useCallback(
    async (type: StudyResourceItem["type"], resourceRefId: string) => {
      if (!resourceRefId) return
      if (type === "quiz") {
        await openSavedQuiz(resourceRefId)
        return
      }
      if (type === "flashcards") {
        await openSavedFlashcards(resourceRefId)
        return
      }
      if (type === "flowchart") {
        await openSavedFlowchart(resourceRefId)
      }
    },
    [openSavedQuiz, openSavedFlashcards, openSavedFlowchart]
  )

  const closeDrawers = useCallback(() => {
    setIsLeftDrawerOpen(false)
    setIsRightDrawerOpen(false)
  }, [])

  const canGenerateRevision = Boolean(token && activeId && documents.length > 0)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation} collapsed={false} onToggleCollapse={function (): void {
          throw new Error("Function not implemented.")
        } }      />

      <main className="flex h-full min-w-0 flex-1">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/12 px-4 py-2 text-xs text-destructive">
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="rounded-full border border-destructive/30 px-2 py-0.5 transition-colors hover:bg-destructive/12"
              >
                Dismiss
              </button>
            </div>
          )}

          <MessageList messages={messages} isLoading={isLoading} />

          <div className="border-t border-border/70 bg-background/62">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-sm font-medium text-muted-foreground">
                {documents.length === 0
                  ? "No documents uploaded"
                  : `${documents.length} document${documents.length > 1 ? "s" : ""}`}
              </span>
              <label
                className={`animated-button cta-glow inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-primary/45 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/92 ${
                  uploading ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                <span>{uploading ? "Uploading..." : "Add PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>
            </div>

            {documents.length > 0 && (
              <div className="max-h-60 divide-y divide-border/75 overflow-y-auto border-t border-border/70 bg-background/45">
                {documents.map((doc, index) => {
                  const docId = doc._id || `${doc.name}-${doc.createdAt ?? "unknown"}-${index}`
                  const isOpen = expandedDocId === docId
                  return (
                    <div key={docId} className="interactive-card">
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        {doc.status === "processing" ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-yellow-600" />
                        ) : doc.status === "ready" ? (
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-xs font-medium">{doc.name}</span>

                        {doc.status === "ready" && (
                          <span className="shrink-0 rounded-full border border-border/75 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                            {doc.chunkCount} chunks
                          </span>
                        )}

                        {doc.status === "ready" && !doc.summary && (
                          <button
                            onClick={() => handleGenerateSummary(docId)}
                            disabled={generatingSummaryId === docId}
                            className="animated-button rounded-full border border-border/70 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Generate summary"
                          >
                            {generatingSummaryId === docId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Summarize"
                            )}
                          </button>
                        )}

                        {doc.status === "ready" && doc.summary && (
                          <button
                            onClick={() => setExpandedDocId(isOpen ? null : docId)}
                            className="rounded-md border border-border/65 bg-background/70 p-1 transition-colors hover:border-primary/40 hover:text-primary"
                            title={isOpen ? "Hide summary" : "Show summary"}
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (isOpen) setExpandedDocId(null)
                            handleDeleteDocument(docId, doc.name)
                          }}
                          className="rounded-md border border-border/65 bg-background/70 p-1 transition-colors hover:border-destructive/40 hover:text-destructive"
                          title="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {isOpen && doc.summary && (
                        <div className="whitespace-pre-wrap border-t border-border/60 bg-muted/30 px-4 pb-3.5 pt-2 text-xs leading-relaxed text-muted-foreground">
                          {doc.summary}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <MessageInput
            onSend={handleSendMessage}
            disabled={isLoading || !token}
            placeholder={token ? "Ask anything... (Shift+Enter for new line)" : "Loading..."}
          />
        </section>

        <aside className="hidden h-full w-96 min-w-96 border-l border-border lg:flex xl:w-104 xl:min-w-104">
          <StudyToolsPanel
            disabled={isLoading || !token || isGeneratingQuiz || isSubmittingQuiz}
            onSelectTool={handleSelectStudyTool}
            canGenerateRevision={Boolean(token && activeId && documents.length > 0)}
            generatingRevision={generatingRevision}
            revisionText={revisionText}
            revisionBullets={revisionBullets}
            onGenerateRevision={() => void handleGenerateRevision()}
            onDownloadRevision={handleDownloadRevision}
            variant="sidebar"
            resources={studyResources}
            results={studyResults}
            onOpenResource={(type, resourceRefId) => {
              void openStudyResource(type, resourceRefId)
            }}
          />
        </aside>
      </main>

      <QuizModal
        open={quizModalOpen}
        quiz={activeQuiz}
        liveFeedback={quizLiveFeedback}
        finalResult={quizResult}
        checking={isCheckingQuizAnswer}
        submitting={isSubmittingQuiz}
        onClose={() => {
          setQuizModalOpen(false)
          setActiveQuiz(null)
          setQuizLiveFeedback([])
          setQuizResult(null)
        }}
        onCheckAnswer={handleCheckQuizAnswer}
        onSubmit={handleSubmitQuiz}
      />

      <FlashcardsModal
        open={flashcardsModalOpen}
        deck={activeFlashcards}
        onClose={() => {
          setFlashcardsModalOpen(false)
          setActiveFlashcards(null)
        }}
      />

      <FlowchartModal
        open={flowchartModalOpen}
        flowchart={activeFlowchart}
        onClose={() => {
          setFlowchartModalOpen(false)
          setActiveFlowchart(null)
        }}
      />

      <FlowchartPromptModal
        open={flowchartPromptOpen}
        loading={isGeneratingQuiz}
        onClose={() => {
          if (isGeneratingQuiz) return
          setFlowchartPromptOpen(false)
        }}
        onSubmit={(fullPrompt) => {
          void handleGenerateFlowchartFromPreference(fullPrompt)
        }}
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-background shadow-2xl">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-destructive">Delete {pendingDelete.kind}?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You are deleting <span className="font-medium text-foreground">“{pendingDelete.itemName}”</span>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDelete()
                }}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
