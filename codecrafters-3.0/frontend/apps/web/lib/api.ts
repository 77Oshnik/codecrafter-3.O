const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Message {
  id?: string
  role: "user" | "assistant"
  content: string
  sources?: Source[]
  createdAt?: string
}

export interface Source {
  text: string
  score: number
  documentName: string
  documentId: string
  chunkIndex: number
}

export interface Conversation {
  _id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export interface Document {
  _id: string
  name: string
  status: "processing" | "ready" | "failed"
  chunkCount: number
  cloudinaryUrl: string
  createdAt: string
  summary?: string
}

export interface QuizQuestionPublic {
  questionNumber: number
  question: string
  options: string[]
}

export interface GeneratedQuiz {
  id: string
  title: string
  createdAt: string
  questions: QuizQuestionPublic[]
}

export interface QuizFeedbackItem {
  question: string
  options: string[]
  selectedOptionIndex: number
  correctOptionIndex: number
  isCorrect: boolean
  selectedReason: string
  correctReason: string
}

export interface QuizSubmissionResult {
  id: string
  quizId: string
  quizTitle: string
  score: number
  total: number
  percentage: number
  createdAt: string
  feedback: QuizFeedbackItem[]
}

export interface FlashcardItem {
  question: string
  answer: string
}

export interface GeneratedFlashcards {
  id: string
  title: string
  createdAt: string
  cards: FlashcardItem[]
}

export interface GeneratedFlowchart {
  id: string
  title: string
  createdAt: string
  steps: string[]
  mermaidCode: string
}

export interface StudyResourceItem {
  id: string
  type: "quiz" | "flashcards" | "flowchart" | "revision" | "youtube"
  title: string
  description: string
  resourceRefId: string
  createdAt: string
}

export interface StudyResultItem {
  id: string
  quizId: string
  quizTitle: string
  score: number
  total: number
  percentage: number
  createdAt: string
}

export interface YouTubeVideoItem {
  id: string
  conversationId: string
  url: string
  videoId: string
  title: string
  status: "processing" | "ready" | "failed"
  chunkCount: number
  summary?: string
  notes?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export async function listConversations(token: string): Promise<Conversation[]> {
  const res = await fetch(`${BACKEND}/api/chat`, {
    headers: authHeaders(token),
  })
  return handleResponse<Conversation[]>(res)
}

export async function getConversation(token: string, id: string): Promise<Conversation> {
  const res = await fetch(`${BACKEND}/api/chat/${id}`, {
    headers: authHeaders(token),
  })
  return handleResponse<Conversation>(res)
}

export async function createConversation(token: string, title?: string): Promise<Conversation> {
  const res = await fetch(`${BACKEND}/api/chat`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ title }),
  })
  return handleResponse<Conversation>(res)
}

export async function deleteConversation(token: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/chat/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return handleResponse<void>(res)
}

export async function renameConversation(
  token: string,
  id: string,
  title: string
): Promise<{ title: string }> {
  const res = await fetch(`${BACKEND}/api/chat/${id}/title`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ title }),
  })
  return handleResponse<{ title: string }>(res)
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------
export interface SendMessageResult {
  conversationId: string
  title: string
  message: Message
}

export async function sendMessage(
  token: string,
  conversationId: string,
  message: string,
  options?: { videoId?: string }
): Promise<SendMessageResult> {
  const res = await fetch(`${BACKEND}/api/chat/${conversationId}/message`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message, videoId: options?.videoId }),
  })
  return handleResponse<SendMessageResult>(res)
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function listDocuments(token: string, conversationId?: string): Promise<Document[]> {
  const url = conversationId
    ? `${BACKEND}/api/documents?conversationId=${conversationId}`
    : `${BACKEND}/api/documents`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<Document[]>(res)
}

export async function uploadDocument(
  token: string,
  file: File,
  conversationId: string
): Promise<{ document: Document }> {
  const formData = new FormData()
  formData.append("pdf", file)
  formData.append("conversationId", conversationId)

  const res = await fetch(`${BACKEND}/api/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  type UploadDocumentWire = {
    document: Omit<Document, "_id" | "chunkCount"> & {
      _id?: string
      id?: string
      chunkCount?: number
    }
  }

  const payload = await handleResponse<UploadDocumentWire>(res)
  const wireDoc = payload.document
  const { id, _id, chunkCount, ...rest } = wireDoc

  return {
    document: {
      ...rest,
      _id: _id ?? id ?? `temp-${Date.now()}`,
      chunkCount: chunkCount ?? 0,
    },
  }
}

export async function generateDocumentSummary(
  token: string,
  id: string
): Promise<{ summary: string }> {
  const res = await fetch(`${BACKEND}/api/documents/${id}/summary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ summary: string }>(res)
}

export interface RevisionResult {
  revision: string
  generatedAt: string
  documentCount: number
  fileName: string
}

export async function generateConversationRevision(
  token: string,
  conversationId: string
): Promise<RevisionResult> {
  const res = await fetch(`${BACKEND}/api/documents/revision`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ conversationId }),
  })
  return handleResponse<RevisionResult>(res)
}

export async function deleteDocument(token: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/documents/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<void>(res)
}

// ---------------------------------------------------------------------------
// Study tools
// ---------------------------------------------------------------------------
export async function generateQuiz(
  token: string,
  conversationId: string
): Promise<{ quiz: GeneratedQuiz }> {
  const res = await fetch(`${BACKEND}/api/study/quiz/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ conversationId }),
  })
  return handleResponse<{ quiz: GeneratedQuiz }>(res)
}

export async function getQuizById(
  token: string,
  quizId: string
): Promise<{ quiz: GeneratedQuiz }> {
  const res = await fetch(`${BACKEND}/api/study/quiz/${quizId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ quiz: GeneratedQuiz }>(res)
}

export async function submitQuiz(
  token: string,
  quizId: string,
  answers: number[]
): Promise<{ result: QuizSubmissionResult }> {
  const res = await fetch(`${BACKEND}/api/study/quiz/${quizId}/submit`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ answers }),
  })
  return handleResponse<{ result: QuizSubmissionResult }>(res)
}

export async function checkQuizAnswer(
  token: string,
  quizId: string,
  questionIndex: number,
  selectedOptionIndex: number
): Promise<{ feedback: QuizFeedbackItem }> {
  const res = await fetch(`${BACKEND}/api/study/quiz/${quizId}/check`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ questionIndex, selectedOptionIndex }),
  })
  return handleResponse<{ feedback: QuizFeedbackItem }>(res)
}

export async function listStudySidebarData(
  token: string,
  conversationId: string
): Promise<{ resources: StudyResourceItem[]; results: StudyResultItem[] }> {
  const res = await fetch(`${BACKEND}/api/study/sidebar?conversationId=${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ resources: StudyResourceItem[]; results: StudyResultItem[] }>(res)
}

export async function generateFlashcards(
  token: string,
  conversationId: string
): Promise<{ flashcards: GeneratedFlashcards }> {
  const res = await fetch(`${BACKEND}/api/study/flashcards/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ conversationId }),
  })
  return handleResponse<{ flashcards: GeneratedFlashcards }>(res)
}

export async function getFlashcardsById(
  token: string,
  flashcardsId: string
): Promise<{ flashcards: GeneratedFlashcards }> {
  const res = await fetch(`${BACKEND}/api/study/flashcards/${flashcardsId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ flashcards: GeneratedFlashcards }>(res)
}

export async function generateFlowchart(
  token: string,
  conversationId: string,
  flowchartPreference?: string
): Promise<{ flowchart: GeneratedFlowchart }> {
  const res = await fetch(`${BACKEND}/api/study/flowchart/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ conversationId, flowchartPreference }),
  })
  return handleResponse<{ flowchart: GeneratedFlowchart }>(res)
}

export async function getFlowchartById(
  token: string,
  flowchartId: string
): Promise<{ flowchart: GeneratedFlowchart }> {
  const res = await fetch(`${BACKEND}/api/study/flowchart/${flowchartId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ flowchart: GeneratedFlowchart }>(res)
}

export async function createStudyResource(
  token: string,
  payload: {
    conversationId: string
    type: StudyResourceItem["type"]
    title: string
    description?: string
  }
): Promise<{ resource: StudyResourceItem }> {
  const res = await fetch(`${BACKEND}/api/study/resource`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
  return handleResponse<{ resource: StudyResourceItem }>(res)
}

// ---------------------------------------------------------------------------
// YouTube learning
// ---------------------------------------------------------------------------
export async function ingestYouTubeVideo(
  token: string,
  payload: { conversationId: string; url: string }
): Promise<{ video: YouTubeVideoItem }> {
  const res = await fetch(`${BACKEND}/api/youtube/ingest`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
  return handleResponse<{ video: YouTubeVideoItem }>(res)
}

export async function listYouTubeVideos(
  token: string,
  conversationId: string
): Promise<YouTubeVideoItem[]> {
  const res = await fetch(`${BACKEND}/api/youtube?conversationId=${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<YouTubeVideoItem[]>(res)
}

export async function generateYouTubeSummary(
  token: string,
  id: string
): Promise<{ summary: string }> {
  const res = await fetch(`${BACKEND}/api/youtube/${id}/summary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ summary: string }>(res)
}

export async function generateYouTubeNotes(
  token: string,
  id: string
): Promise<{ notes: string }> {
  const res = await fetch(`${BACKEND}/api/youtube/${id}/notes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ notes: string }>(res)
}

export async function deleteYouTubeVideo(token: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/youtube/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<void>(res)
}
