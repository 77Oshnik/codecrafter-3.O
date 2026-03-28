const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
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

module.exports = {
  getEmbedding,
  generateChatResponse,
  generateSummary,
  generateRevisionNotes,
  generateQuizFromContext,
  generateFlashcardsFromContext,
};
