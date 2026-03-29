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

export interface TranscriptSegment {
  text: string
  offset: number
  duration: number
}

export interface TranscriptResponse {
  success: boolean
  videoId: string
  title?: string
  fullText: string
  segments: TranscriptSegment[]
  transcriptLength: number
}

export interface TranscriptChatMessage {
  role: "user" | "assistant"
  content: string
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
  type: "quiz" | "flashcards"
  title: string
  quizId?: string
  flashcardsId?: string
  score?: number
  total?: number
  percentage?: number
  cardCount?: number
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

export interface DashboardSummary {
  user: { id: string }
  kpis: {
    streakDays: number
    avgLearningProgress: number
    totalQuizzes: number
    avgQuizScore: number
  }
  chat: {
    totalConversations: number
    totalMessages: number
  }
  learning: {
    totalPaths: number
    activePaths: number
    completedPaths: number
    dueToday: number
    weakTopics: number
    strongTopics: number
    paths: Array<{
      id: string
      topic: string
      status: string
      overallProgress: number
      completedTopics: number
      totalTopics: number
      lastActiveAt: string
    }>
    latestActivePath: { id: string; topic: string; overallProgress: number } | null
  }
  youtube: {
    totalVideos: number
    readyVideos: number
  }
  documents: {
    totalDocuments: number
    readyDocuments: number
  }
  recentActivity: Array<{
    type: "quiz" | "chat" | "youtube"
    title: string
    score?: number
    status?: string
    createdAt: string
  }>
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
    console.error("[api] request failed", {
      url: res.url,
      status: res.status,
      statusText: res.statusText,
      body,
    })
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

export async function deleteStudyResource(token: string, resourceId: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/study/resource/${resourceId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<void>(res)
}

export async function deleteStudyResult(
  token: string,
  type: StudyResultItem["type"],
  resultId: string
): Promise<void> {
  const res = await fetch(`${BACKEND}/api/study/result/${type}/${resultId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<void>(res)
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

// ---------------------------------------------------------------------------
// YouTube transcript (Phase 1)
// ---------------------------------------------------------------------------
export async function fetchTranscript(
  payload: { youtubeUrl: string }
): Promise<TranscriptResponse> {
  const res = await fetch(`${BACKEND}/api/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  return handleResponse<TranscriptResponse>(res)
}

export async function summarizeTranscript(
  payload: { transcript: string; title?: string }
): Promise<{ summary: string }> {
  const res = await fetch(`${BACKEND}/api/transcript/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  return handleResponse<{ summary: string }>(res)
}

export async function askTranscriptQuestion(
  payload: { transcript: string; question: string; history?: TranscriptChatMessage[] }
): Promise<{ answer: string; related: boolean }> {
  const res = await fetch(`${BACKEND}/api/transcript/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  return handleResponse<{ answer: string; related: boolean }>(res)
}

// ---------------------------------------------------------------------------
// Learning Platform Types
// ---------------------------------------------------------------------------
export interface LearningPathSummary {
  _id: string
  topic: string
  userLevel: "beginner" | "intermediate" | "advanced"
  status: "assessing" | "active" | "completed"
  overallProgress: number
  totalTopics: number
  completedTopics: number
  createdAt: string
  lastActiveAt: string
}

export interface Subtopic {
  id: string
  title: string
  description: string
  type?: "core" | "revision" | "remedial"
  adaptive?: boolean
  sourceSubtopicId?: string
  unlockReason?: "quiz-failed" | "low-confidence" | "scheduled-review" | null
  status: "locked" | "available" | "completed"
  quizScore?: number
  quizAttempts: number
  contentGenerated: boolean
  completedAt?: string
}

export interface RoadmapTopic {
  id: string
  title: string
  description: string
  order: number
  difficulty: "beginner" | "intermediate" | "advanced"
  estimatedTime: string
  status: "locked" | "available" | "in-progress" | "completed"
  subtopics: Subtopic[]
  completedAt?: string
}

export interface LearningPath extends LearningPathSummary {
  userLevel: "beginner" | "intermediate" | "advanced"
  assessmentScore: number
  levelExplanation: string
  strengths: string[]
  weaknesses: string[]
  roadmap: RoadmapTopic[]
  recentResults?: { topicId: string; subtopicId: string; percentage: number; createdAt: string }[]
  weakTopics?: { topicTitle: string; subtopicTitle: string; confidenceScore: number }[]
}

export interface AssessmentQuestion {
  id: string
  question: string
  options: string[]
  difficulty: "easy" | "medium" | "hard"
  subtopic: string
}

export interface TopicContent {
  _id: string
  topicTitle: string
  subtopicTitle: string
  userLevel: string
  mainTopic: string
  content: string
  keyPoints: string[]
  youtubeSearchQuery: string
  quizId?: string
}

export interface LearningYouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  description: string
  publishedAt: string | null
  thumbnailUrl: string
  url: string
  embedUrl: string
}

export interface LearningQuizQuestion {
  index: number
  question: string
  options: string[]
}

export interface LearningQuizFeedback {
  question: string
  selectedIndex: number
  correctIndex: number
  isCorrect: boolean
  explanation: string
}

export interface LearningQuizSubmitResult {
  score: number
  total: number
  percentage: number
  passed: boolean
  feedback: LearningQuizFeedback[]
  nextInfo?: {
    type: "subtopic" | "topic"
    topicId: string
    subtopicId: string
    title: string
    subtopicType?: "core" | "revision" | "remedial"
  } | null
  confidenceScore: number
  nextReviewAt: string
  message: string
}

export interface MemoryItem {
  topicTitle: string
  subtopicTitle: string
  mainTopic?: string
  confidenceScore: number
  nextReviewAt?: string
  intervalDays?: number
  isWeak?: boolean
}

export interface LearningDashboard {
  activePaths: LearningPathSummary[]
  completedPaths: LearningPathSummary[]
  totalPaths: number
  totalQuizzes: number
  avgScore: number
  weakTopics: MemoryItem[]
  strongTopics: MemoryItem[]
  dueForReview: MemoryItem[]
  recentActivity: { topicId: string; subtopicId: string; percentage: number; createdAt: string }[]
}

// ---------------------------------------------------------------------------
// Learning Platform API
// ---------------------------------------------------------------------------
export async function startLearningAssessment(
  token: string,
  topic: string
): Promise<{ assessmentId: string; topic: string; questions: AssessmentQuestion[] }> {
  const res = await fetch(`${BACKEND}/api/learning/start`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ topic }),
  })
  return handleResponse(res)
}

export async function submitLearningAssessment(
  token: string,
  assessmentId: string,
  answers: number[]
): Promise<{
  learningPathId: string
  score: number
  level: "beginner" | "intermediate" | "advanced"
  explanation: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  totalTopics: number
}> {
  const res = await fetch(`${BACKEND}/api/learning/assessment/${assessmentId}/submit`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ answers }),
  })
  return handleResponse(res)
}

export async function listLearningPaths(token: string): Promise<LearningPathSummary[]> {
  const res = await fetch(`${BACKEND}/api/learning/paths`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

export async function getLearningPath(token: string, id: string): Promise<LearningPath> {
  const res = await fetch(`${BACKEND}/api/learning/paths/${id}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

export async function deleteLearningPath(token: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/learning/paths/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

export async function getSubtopicContent(
  token: string,
  pathId: string,
  topicId: string,
  subtopicId: string
): Promise<TopicContent> {
  const res = await fetch(
    `${BACKEND}/api/learning/paths/${pathId}/topics/${topicId}/subtopics/${subtopicId}/content`,
    { headers: authHeaders(token) }
  )
  return handleResponse(res)
}

export async function getSubtopicQuiz(
  token: string,
  pathId: string,
  topicId: string,
  subtopicId: string
): Promise<{ quizId: string; questions: LearningQuizQuestion[] }> {
  console.log("[api] getSubtopicQuiz request", {
    pathId,
    topicId,
    subtopicId,
    hasToken: Boolean(token),
  })
  const res = await fetch(
    `${BACKEND}/api/learning/paths/${pathId}/topics/${topicId}/subtopics/${subtopicId}/quiz`,
    { headers: authHeaders(token) }
  )
  console.log("[api] getSubtopicQuiz response", {
    pathId,
    topicId,
    subtopicId,
    status: res.status,
    ok: res.ok,
  })
  return handleResponse(res)
}

export async function getSubtopicVideos(
  token: string,
  pathId: string,
  topicId: string,
  subtopicId: string,
  q?: string
): Promise<{ query: string; videos: LearningYouTubeVideo[] }> {
  const url = new URL(
    `${BACKEND}/api/learning/paths/${pathId}/topics/${topicId}/subtopics/${subtopicId}/videos`
  )
  if (q?.trim()) {
    url.searchParams.set("q", q.trim())
  }
  const res = await fetch(url.toString(), { headers: authHeaders(token) })
  return handleResponse(res)
}

export async function submitSubtopicQuiz(
  token: string,
  pathId: string,
  topicId: string,
  subtopicId: string,
  quizId: string,
  answers: number[]
): Promise<LearningQuizSubmitResult> {
  const requestBody = { pathId, topicId, subtopicId, answers }
  console.log("[api] submitSubtopicQuiz request", {
    quizId,
    pathId,
    topicId,
    subtopicId,
    answerCount: answers.length,
    answers,
  })

  const res = await fetch(
    `${BACKEND}/api/learning/quiz/${quizId}/submit`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(requestBody),
    }
  )

  console.log("[api] submitSubtopicQuiz response", {
    quizId,
    status: res.status,
    ok: res.ok,
  })

  return handleResponse(res)
}

export async function getLearningDashboard(token: string): Promise<LearningDashboard> {
  const res = await fetch(`${BACKEND}/api/learning/dashboard`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

export async function getMemoryData(
  token: string,
  pathId: string
): Promise<{ dueToday: MemoryItem[]; upcoming: MemoryItem[]; mastered: MemoryItem[] }> {
  const res = await fetch(`${BACKEND}/api/learning/memory/${pathId}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

export async function getDashboardSummary(token: string): Promise<DashboardSummary> {
  const res = await fetch(`${BACKEND}/api/dashboard/summary`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}
