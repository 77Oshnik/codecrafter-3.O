const express = require("express");
const { protect } = require("../middleware/auth");
const Conversation = require("../models/conversation");
const Document = require("../models/document");
const Quiz = require("../models/quiz");
const QuizResult = require("../models/quizResult");
const StudyResource = require("../models/studyResource");
const FlashcardSet = require("../models/flashcardSet");
const YouTubeVideo = require("../models/youtubeVideo");
const { getEmbedding, generateChatResponse } = require("../services/geminiService");
const { queryVectors, deleteVectors } = require("../services/qdrantService");
const { deletePDF } = require("../services/cloudinaryService");

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

// DELETE /api/chat/:id — delete a conversation and its associated documents
router.delete("/:id", protect, async (req, res) => {
  try {
    const result = await Conversation.deleteOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    // Cascade: delete all documents belonging to this conversation
    const docs = await Document.find({ conversationId: req.params.id, userId: req.user.id });
    for (const doc of docs) {
      if (doc.vectorIds?.length > 0) {
        await deleteVectors(doc.vectorIds, req.user.id).catch(() => {});
      }
      await deletePDF(doc.cloudinaryPublicId).catch(() => {});
    }
    await Document.deleteMany({ conversationId: req.params.id });
    await Quiz.deleteMany({ conversationId: req.params.id, userId: req.user.id }).catch(() => {});
    await FlashcardSet.deleteMany({ conversationId: req.params.id, userId: req.user.id }).catch(() => {});
    await QuizResult.deleteMany({ conversationId: req.params.id, userId: req.user.id }).catch(() => {});
    await StudyResource.deleteMany({ conversationId: req.params.id, userId: req.user.id }).catch(() => {});

    const videos = await YouTubeVideo.find({ conversationId: req.params.id, userId: req.user.id });
    for (const video of videos) {
      if (video.vectorIds?.length > 0) {
        await deleteVectors(video.vectorIds, req.user.id).catch(() => {});
      }
    }
    await YouTubeVideo.deleteMany({ conversationId: req.params.id, userId: req.user.id }).catch(() => {});

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
    const { message, videoId } = req.body;

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
    const sourceFilter = videoId
      ? [
          { key: "sourceType", match: { value: "youtube" } },
          { key: "videoId", match: { value: String(videoId) } },
        ]
      : [];

    const hasSources = videoId
      ? (await YouTubeVideo.countDocuments({
          conversationId: conversation._id,
          userId,
          videoId: String(videoId),
          status: "ready",
        })) > 0
      : (await Document.countDocuments({ conversationId: conversation._id, status: "ready" })) > 0;

    try {
      const queryEmbedding = await getEmbedding(message.trim());
      const matches = await queryVectors(
        queryEmbedding,
        userId,
        6,
        conversation._id.toString(),
        sourceFilter
      );

      // Primary: high-confidence matches (>0.65).
      // Fallback: if no high-confidence match but documents exist (e.g. meta queries like
      // "what is this document"), use top-3 chunks above 0.4 so the model has some context.
      const highRelevant = matches.filter((m) => m.score > 0.65);
      const relevant =
        highRelevant.length > 0
          ? highRelevant
          : hasSources
            ? matches.filter((m) => m.score > 0.4).slice(0, 3)
            : [];
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
          documentName: m.metadata.documentName || m.metadata.videoTitle || "Unknown",
          chunkIndex: m.metadata.chunkIndex,
          chunkId: m.metadata.chunkId,
        }));
        context = uniqueRelevant
          .map(
            (m, i) =>
              `[Source ${i + 1} — Document: ${m.metadata.documentName || m.metadata.videoTitle} | DocId: ${m.metadata.documentId} | Chunk: ${m.metadata.chunkIndex}]\n${m.metadata.text}`
          )
          .join("\n\n");
      }
    } catch (ragErr) {
      // RAG failure is non-fatal — continue without context
      console.warn("[chat/RAG] Failed to retrieve context:", ragErr.message);
    }

    // 4. Generate AI response
    // Short-circuit: don't call the LLM at all when there's no relevant context —
    // the model will always add general knowledge regardless of instructions.
    let aiText;
    if (!hasSources) {
      aiText = videoId
        ? "This YouTube video is not indexed yet in this chat. Please ingest it first."
        : "No documents have been uploaded to this chat. Please upload a PDF to get started.";
    } else if (!context) {
      aiText = videoId
        ? "The selected YouTube video doesn't contain information about this topic."
        : "The uploaded documents don't have information about this topic.";
    } else {
      aiText = await generateChatResponse(historyForGemini, context);
    }

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
