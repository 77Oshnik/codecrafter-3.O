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
  message: string
): Promise<SendMessageResult> {
  const res = await fetch(`${BACKEND}/api/chat/${conversationId}/message`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message }),
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
  return handleResponse<{ document: Document }>(res)
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

export async function deleteDocument(token: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND}/api/documents/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<void>(res)
}
