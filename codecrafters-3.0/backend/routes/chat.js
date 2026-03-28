const express = require("express");
const { protect } = require("../middleware/auth");
const Conversation = require("../models/conversation");
const { getEmbedding, generateChatResponse } = require("../services/geminiService");
const { queryVectors } = require("../services/qdrantService");

const router = express.Router();

// GET /api/chat — list all conversations for the user
router.get("/", protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.id })
      .select("title createdAt updatedAt")
      .sort({ updatedAt: -1 });
    return res.json(conversations);
  } catch (err) {
    console.error("[chat/list]", err);
    return res.status(500).json({ error: "Failed to fetch conversations." });
  }
});

// POST /api/chat — create a new empty conversation
router.post("/", protect, async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = await Conversation.create({
      userId: req.user.id,
      title: title || "New Conversation",
      messages: [],
    });
    return res.status(201).json(conversation);
  } catch (err) {
    console.error("[chat/create]", err);
    return res.status(500).json({ error: "Failed to create conversation." });
  }
});

// GET /api/chat/:id — get a specific conversation with full message history
router.get("/:id", protect, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    return res.json(conversation);
  } catch (err) {
    console.error("[chat/get]", err);
    return res.status(500).json({ error: "Failed to fetch conversation." });
  }
});

// DELETE /api/chat/:id — delete a conversation
router.delete("/:id", protect, async (req, res) => {
  try {
    const result = await Conversation.deleteOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    return res.json({ message: "Conversation deleted." });
  } catch (err) {
    console.error("[chat/delete]", err);
    return res.status(500).json({ error: "Failed to delete conversation." });
  }
});

// PATCH /api/chat/:id/title — rename a conversation
router.patch("/:id/title", protect, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ error: "Title is required." });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { title: title.trim() },
      { new: true }
    ).select("title");

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    return res.json(conversation);
  } catch (err) {
    console.error("[chat/rename]", err);
    return res.status(500).json({ error: "Failed to rename conversation." });
  }
});

// POST /api/chat/:id/message — send a message and get RAG-augmented response
router.post("/:id/message", protect, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    const userId = req.user.id;

    // Load or create conversation
    let conversation;
    if (req.params.id === "new") {
      conversation = await Conversation.create({
        userId,
        title: message.trim().slice(0, 60),
        messages: [],
      });
    } else {
      conversation = await Conversation.findOne({
        _id: req.params.id,
        userId,
      });
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found." });
      }
    }

    // 1. Append the user message to the history
    conversation.messages.push({ role: "user", content: message.trim() });

    // 2. Build the message array for Gemini (full history including this message)
    const historyForGemini = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 3. RAG: embed the user query and retrieve similar chunks
    let context = "";
    let sources = [];
    try {
      const queryEmbedding = await getEmbedding(message.trim());
      const matches = await queryVectors(queryEmbedding, userId, 5);

      // Only use matches with a meaningful similarity score
      const relevant = matches.filter((m) => m.score > 0.5);
      if (relevant.length > 0) {
        const seen = new Set();
        const uniqueRelevant = relevant.filter((m) => {
          const key = `${m.metadata?.documentId || "unknown"}:${m.metadata?.chunkIndex ?? "x"}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        sources = uniqueRelevant.map((m) => ({
          text: m.metadata.text,
          score: Math.round(m.score * 100) / 100,
          documentId: m.metadata.documentId,
          documentName: m.metadata.documentName || "Unknown",
          chunkIndex: m.metadata.chunkIndex,
          chunkId: m.metadata.chunkId,
        }));
        context = uniqueRelevant
          .map(
            (m, i) =>
              `[Source ${i + 1} — Document: ${m.metadata.documentName} | DocId: ${m.metadata.documentId} | Chunk: ${m.metadata.chunkIndex}]\n${m.metadata.text}`
          )
          .join("\n\n");
      }
    } catch (ragErr) {
      // RAG failure is non-fatal — continue without context
      console.warn("[chat/RAG] Failed to retrieve context:", ragErr.message);
    }

    // 4. Generate AI response
    const aiText = await generateChatResponse(historyForGemini, context);

    // 5. Append the assistant message
    conversation.messages.push({
      role: "assistant",
      content: aiText,
      sources,
    });

    // 6. Auto-update title from the first exchange if still default
    if (
      conversation.title === "New Conversation" &&
      conversation.messages.length === 2
    ) {
      conversation.title = message.trim().slice(0, 60);
    }

    await conversation.save();

    const assistantMsg = conversation.messages[conversation.messages.length - 1];

    return res.json({
      conversationId: conversation._id,
      title: conversation.title,
      message: {
        id: assistantMsg._id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        sources: assistantMsg.sources,
        createdAt: assistantMsg.createdAt,
      },
    });
  } catch (err) {
    console.error("[chat/message]", err);
    return res.status(500).json({ error: "Failed to generate response." });
  }
});

module.exports = router;
