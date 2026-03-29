const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
let transcriptGenAI = null;
let transcriptApiKey = null;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function getTranscriptClient() {
  const apiKey = process.env.GEMINI_API_KEY_TRANSCRIPT || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_TRANSCRIPT or GEMINI_API_KEY is not configured. Check your .env file.");
  }

  if (!transcriptGenAI || transcriptApiKey !== apiKey) {
    transcriptGenAI = new GoogleGenerativeAI(apiKey);
    transcriptApiKey = apiKey;
  }

  return transcriptGenAI;
}

/**
 * Generate 3072-dim embedding for the given text using Gemini.
 * gemini-embedding-001 natively supports 3072 dimensions.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Check your .env file.");
  }

  const model = getClient().getGenerativeModel({ model: "gemini-embedding-001" });

  try {
    const result = await model.embedContent(text);
    const embeddings = result.embedding.values;

    console.log(`[getEmbedding] Generated embedding with dimension: ${embeddings.length}`);

    if (embeddings.length !== 3072) {
      console.warn(`[getEmbedding] WARNING: Expected 3072 dimensions, got ${embeddings.length}`);
    }

    return embeddings;
  } catch (error) {
    console.error("[getEmbedding] Error details:", {
      status: error.status,
      statusText: error.statusText,
      message: error.message,
      apiKeySet: !!process.env.GEMINI_API_KEY,
    });
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generate a chat response using Gemini with full conversation history and RAG context.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages - Full history including the latest user message
 * @param {string} context - Retrieved document chunks joined as a string
 * @returns {Promise<string>}
 */
/**
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {string} context - Retrieved document chunks (only called when context is non-empty)
 */
async function generateChatResponse(messages, context) {
  const systemInstruction = `You are a helpful AI assistant with access to document context uploaded by the user.
Answer the user's question using the document context below. Cite it naturally in your response.

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`;

  const model = getClient().getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview",
    systemInstruction,
  });

  // Separate history (all but last message) from the current user message
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const currentMessage = messages[messages.length - 1].content;

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(currentMessage);
  return result.response.text();
}

/**
 * Generate a concise summary of the given document text.
 * @param {string} text - Raw document text (will be truncated to first 12000 chars)
 * @param {string} documentName
 * @returns {Promise<string>}
 */
async function generateSummary(text, documentName) {
  // Use gemini-1.5-flash (1500 free req/day) instead of gemini-2.5-flash (20/day)
  // to avoid exhausting the quota shared with chat responses.
  const model = getClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
  const prompt = `Summarize the following document titled "${documentName}" in 4–6 concise bullet points. Focus on the key topics, findings, and important data points. Return only the bullet points, no intro or outro text.

Document text:
${text.slice(0, 12000)}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function summarizeTranscript(text, videoTitle) {
  const trimmed = String(text || "").slice(0, 16000);
  if (!trimmed) {
    throw new Error("Transcript text is required for summarization.");
  }

  // Using user-specified model that supports generateContent on v1beta
  const model = getTranscriptClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
  const prompt = `Summarize the YouTube transcript for "${videoTitle || "Untitled video"}" in 4-6 concise bullet points. Be brief and avoid repetition. Return only the bullets (no intro or outro). Transcript:\n${trimmed}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * Generate revision notes from multiple document summaries.
 * @param {Array<{name: string, summary: string}>} documents
 * @returns {Promise<string>}
 */
async function generateRevisionNotes(documents) {
  const model = getClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const prepared = documents
    .map((doc, idx) => `Document ${idx + 1}: ${doc.name}\n${doc.summary || "(No summary available)"}`)
    .join("\n\n");

  const prompt = `Create high-quality revision notes from the document summaries below.

Requirements:
- Output in Markdown only.
- Use bullet points heavily.
- Add short section headings.
- Keep content concise, exam-oriented, and easy to revise.
- Include important definitions, facts, formulas, and takeaways where available.

Document summaries:
${prepared}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

function extractJsonBlock(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1).trim();
  }

  return text.trim();
}

function shuffleQuestionOptions(question) {
  const zipped = question.options.map((option, idx) => ({
    option,
    reason: question.optionReasons[idx],
    isCorrect: idx === question.correctOptionIndex,
  }));

  for (let i = zipped.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [zipped[i], zipped[j]] = [zipped[j], zipped[i]];
  }

  const newCorrectOptionIndex = zipped.findIndex((item) => item.isCorrect);

  return {
    ...question,
    options: zipped.map((item) => item.option),
    optionReasons: zipped.map((item) => item.reason),
    correctOptionIndex: newCorrectOptionIndex,
  };
}

async function answerTranscriptQuestion(transcript, question, history = []) {
  const cleanedTranscript = String(transcript || "").slice(0, 16000);
  const cleanedQuestion = String(question || "").trim();

  if (!cleanedTranscript) {
    throw new Error("Transcript text is required for Q&A.");
  }
  if (!cleanedQuestion) {
    throw new Error("Question is required for Q&A.");
  }

  // Using user-specified model that supports generateContent on v1beta
  const model = getTranscriptClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const historyText = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .slice(-8) // last 8 turns
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")
    : "";

  const prompt = `You are a concise tutor answering questions about a YouTube video transcript. Always rely on the transcript content. If the user's question is unrelated to the transcript, start your reply with "Unrelated:" and then give a brief general answer. Keep responses under 120 words. Avoid repetition.

Transcript (trimmed):
${cleanedTranscript}

Recent chat history:
${historyText || "(none)"}

User question: ${cleanedQuestion}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text() || "";

  const normalized = text.trim();
  const unrelated = /^unrelated[:\-]/i.test(normalized) || /unrelated to the transcript/i.test(normalized);
  const related = !unrelated;

  return { answer: normalized, related };
}

/**
 * Generate a 15-question MCQ quiz from provided document context.
 * @param {string} context
 * @returns {Promise<{title: string, questions: Array<{question: string, options: string[], correctOptionIndex: number, optionReasons: string[]}>}>}
 */
async function generateQuizFromContext(context) {
  const model = getClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const prompt = `You are creating a strict MCQ quiz from the provided document context only.

Return ONLY valid JSON in this exact shape:
{
  "title": "string",
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctOptionIndex": 0,
      "optionReasons": ["one sentence", "one sentence", "one sentence", "one sentence"]
    }
  ]
}

Rules:
- Exactly 15 questions.
- Exactly 4 options per question.
- Only one correct option.
- correctOptionIndex must be 0, 1, 2, or 3.
- optionReasons must have 4 one-sentence explanations aligned with each option.
- The reason for the correct option should explain why it is correct.
- The reasons for incorrect options should explain why they are wrong.
- Do not include markdown, comments, or extra keys.
- Base every question strictly on the context below.

Context:
${context.slice(0, 40000)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch (error) {
    throw new Error("Failed to parse quiz JSON from Gemini response.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) {
    throw new Error("Quiz payload is malformed.");
  }

  if (parsed.questions.length !== 15) {
    throw new Error(`Quiz must contain exactly 15 questions, got ${parsed.questions.length}.`);
  }

  parsed.questions.forEach((q, index) => {
    if (!q || typeof q.question !== "string") {
      throw new Error(`Question ${index + 1} is missing text.`);
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Question ${index + 1} must have exactly 4 options.`);
    }
    if (![0, 1, 2, 3].includes(q.correctOptionIndex)) {
      throw new Error(`Question ${index + 1} has invalid correctOptionIndex.`);
    }
    if (!Array.isArray(q.optionReasons) || q.optionReasons.length !== 4) {
      throw new Error(`Question ${index + 1} must have exactly 4 optionReasons.`);
    }
  });

  const shuffledQuestions = parsed.questions.map((q) => shuffleQuestionOptions(q));

  return {
    title: typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Document Quiz",
    questions: shuffledQuestions,
  };
}

/**
 * Generate a flashcard set from provided document context.
 * @param {string} context
 * @returns {Promise<{title: string, cards: Array<{question: string, answer: string}>}>}
 */
async function generateFlashcardsFromContext(context) {
  const model = getClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const prompt = `You are creating flashcards from the provided document context only.

Return ONLY valid JSON in this exact shape:
{
  "title": "string",
  "cards": [
    {
      "question": "string",
      "answer": "string"
    }
  ]
}

Rules:
- Generate exactly 15 flashcards.
- Keep question concise and factual.
- Keep answer clear, accurate, and short (1-3 sentences max).
- No markdown, no comments, no extra keys.
- Base all content strictly on the context below.

Context:
${context.slice(0, 40000)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch (_error) {
    throw new Error("Failed to parse flashcards JSON from Gemini response.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cards)) {
    throw new Error("Flashcards payload is malformed.");
  }

  if (parsed.cards.length !== 15) {
    throw new Error(`Flashcards must contain exactly 15 cards, got ${parsed.cards.length}.`);
  }

  parsed.cards.forEach((card, index) => {
    if (!card || typeof card.question !== "string" || !card.question.trim()) {
      throw new Error(`Flashcard ${index + 1} is missing question.`);
    }
    if (!card || typeof card.answer !== "string" || !card.answer.trim()) {
      throw new Error(`Flashcard ${index + 1} is missing answer.`);
    }
  });

  return {
    title: typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Document Flashcards",
    cards: parsed.cards,
  };
}

function buildLinearMermaidFromSteps(steps) {
  const lines = ["flowchart TD"];
  for (let i = 0; i < steps.length; i++) {
    const nodeId = `S${i + 1}`;
    const safeLabel = String(steps[i]).replace(/[\[\]"]+/g, "").trim();
    lines.push(`  ${nodeId}["${safeLabel}"]`);
    if (i < steps.length - 1) {
      lines.push(`  ${nodeId} --> S${i + 2}`);
    }
  }
  return lines.join("\n");
}

/**
 * Generate flowchart steps and Mermaid code from context.
 * @param {string} context
 * @param {string} [flowchartPreference]
 * @returns {Promise<{title: string, steps: string[], mermaidCode: string}>}
 */
async function generateFlowchartFromContext(context, flowchartPreference = "") {
  const model = getClient().getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const normalizedPreference = String(flowchartPreference || "").trim();

  const prompt = `Create a process flowchart from the document context.

Return ONLY valid JSON in this shape:
{
  "title": "string",
  "steps": ["step 1", "step 2", "step 3"],
  "mermaidCode": "flowchart TD\\nA[Start] --> B[Next]",
  "insufficientContext": false,
  "reason": "string"
}

Rules:
- steps must contain at least 5 clear logical steps.
- First create the steps sequence, then convert it to Mermaid flowchart code.
- Mermaid code must be valid and start with "flowchart TD".
- Keep labels concise and readable.
- Use ONLY the document context. Do NOT add any knowledge outside the context.
- You may refine, re-order, and summarize context facts for clarity.
- If the requested preference cannot be supported by the context, return:
  - insufficientContext: true
  - reason: short explanation
  - steps: []
  - mermaidCode: ""
- Output JSON only.
- Base content strictly on context below.

User flowchart preference:
${normalizedPreference || "No extra preference provided."}

Context:
${context.slice(0, 45000)}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(extractJsonBlock(text));
  } catch (_error) {
    throw new Error("Failed to parse flowchart JSON from Gemini response.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Flowchart payload is malformed.");
  }

  if (parsed.insufficientContext === true) {
    throw new Error(
      parsed.reason && typeof parsed.reason === "string"
        ? parsed.reason
        : "Insufficient document context to generate this flowchart preference."
    );
  }

  if (!Array.isArray(parsed.steps) || parsed.steps.length < 5) {
    throw new Error("Flowchart must include at least 5 steps.");
  }

  const cleanedSteps = parsed.steps
    .map((step) => (typeof step === "string" ? step.trim() : ""))
    .filter(Boolean);

  if (cleanedSteps.length < 5) {
    throw new Error("Flowchart must include at least 5 non-empty steps.");
  }

  const candidateCode = typeof parsed.mermaidCode === "string" ? parsed.mermaidCode.trim() : "";
  const mermaidCode = /^flowchart\s+/i.test(candidateCode)
    ? candidateCode
    : buildLinearMermaidFromSteps(cleanedSteps);

  return {
    title: typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "Document Flowchart",
    steps: cleanedSteps,
    mermaidCode,
  };
}

module.exports = {
  getEmbedding,
  generateChatResponse,
  generateSummary,
  generateRevisionNotes,
  generateQuizFromContext,
  generateFlashcardsFromContext,
  summarizeTranscript,
  answerTranscriptQuestion,
  generateFlowchartFromContext,
};
