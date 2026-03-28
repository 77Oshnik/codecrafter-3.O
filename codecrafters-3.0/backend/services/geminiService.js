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

module.exports = { getEmbedding, generateChatResponse, generateSummary };
