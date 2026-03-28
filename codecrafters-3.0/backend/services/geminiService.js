const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Generate a 768-dim embedding for the given text using text-embedding-004.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const model = getClient().getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Generate a chat response using Gemini with full conversation history and RAG context.
 *
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages - Full history including the latest user message
 * @param {string} context - Retrieved document chunks joined as a string
 * @returns {Promise<string>}
 */
async function generateChatResponse(messages, context) {
  const systemInstruction = context
    ? `You are a helpful AI assistant. Use the following context retrieved from the user's documents to answer questions accurately. If the answer is not in the context, say so and still try to be helpful based on your own knowledge.

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`
    : "You are a helpful AI assistant. Answer the user's questions clearly and concisely.";

  const model = getClient().getGenerativeModel({
    model: "gemini-2.0-flash",
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

module.exports = { getEmbedding, generateChatResponse };
