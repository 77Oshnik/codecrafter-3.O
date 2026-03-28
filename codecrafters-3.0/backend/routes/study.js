const express = require("express");
const { protect } = require("../middleware/auth");
const Conversation = require("../models/conversation");
const Document = require("../models/document");
const Quiz = require("../models/quiz");
const QuizResult = require("../models/quizResult");
const StudyResource = require("../models/studyResource");
const FlashcardSet = require("../models/flashcardSet");
const FlowchartSet = require("../models/flowchartSet");
const {
  getEmbedding,
  generateQuizFromContext,
  generateFlashcardsFromContext,
  generateFlowchartFromContext,
} = require("../services/geminiService");
const { queryVectors } = require("../services/qdrantService");

const router = express.Router();

// POST /api/study/resource
router.post("/resource", protect, async (req, res) => {
  try {
    const { conversationId, type, title, description = "" } = req.body;
    if (!conversationId || !type || !title) {
      return res.status(400).json({ error: "conversationId, type and title are required." });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const resource = await StudyResource.create({
      userId: req.user.id,
      conversationId,
      type,
      title,
      description,
    });

    return res.status(201).json({
      resource: {
        id: resource._id,
        type: resource.type,
        title: resource.title,
        description: resource.description,
        resourceRefId: resource.resourceRefId,
        createdAt: resource.createdAt,
      },
    });
  } catch (err) {
    console.error("[study/resource]", err);
    return res.status(500).json({ error: "Failed to save study resource." });
  }
});

// DELETE /api/study/resource/:id
router.delete("/resource/:id", protect, async (req, res) => {
  try {
    const resource = await StudyResource.findOne({ _id: req.params.id, userId: req.user.id });
    if (!resource) {
      return res.status(404).json({ error: "Study resource not found." });
    }

    if (resource.type === "quiz" && resource.resourceRefId) {
      await Quiz.deleteOne({ _id: resource.resourceRefId, userId: req.user.id }).catch(() => {});
      await QuizResult.deleteMany({ quizId: resource.resourceRefId, userId: req.user.id }).catch(() => {});
    }

    if (resource.type === "flashcards" && resource.resourceRefId) {
      await FlashcardSet.deleteOne({ _id: resource.resourceRefId, userId: req.user.id }).catch(() => {});
    }

    if (resource.type === "flowchart" && resource.resourceRefId) {
      await FlowchartSet.deleteOne({ _id: resource.resourceRefId, userId: req.user.id }).catch(() => {});
    }

    await StudyResource.deleteOne({ _id: resource._id, userId: req.user.id });
    return res.json({ message: "Study resource deleted." });
  } catch (err) {
    console.error("[study/resource/delete]", err);
    return res.status(500).json({ error: "Failed to delete study resource." });
  }
});

// DELETE /api/study/result/:type/:id
router.delete("/result/:type/:id", protect, async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "quiz") {
      const result = await QuizResult.findOne({ _id: id, userId: req.user.id });
      if (!result) {
        return res.status(404).json({ error: "Quiz result not found." });
      }
      await QuizResult.deleteOne({ _id: result._id, userId: req.user.id });
      return res.json({ message: "Quiz result deleted." });
    }

    if (type === "flashcards") {
      const set = await FlashcardSet.findOne({ _id: id, userId: req.user.id });
      if (!set) {
        return res.status(404).json({ error: "Flashcards result not found." });
      }
      await FlashcardSet.deleteOne({ _id: set._id, userId: req.user.id });
      await StudyResource.deleteMany({
        userId: req.user.id,
        conversationId: set.conversationId,
        type: "flashcards",
        resourceRefId: set._id.toString(),
      }).catch(() => {});
      return res.json({ message: "Flashcards result deleted." });
    }

    return res.status(400).json({ error: "Unsupported result type." });
  } catch (err) {
    console.error("[study/result/delete]", err);
    return res.status(500).json({ error: "Failed to delete result." });
  }
});

async function buildStudyContext({ userId, conversationId, intentPrompt }) {
  const queryEmbedding = await getEmbedding(intentPrompt);

  const matches = await queryVectors(queryEmbedding, userId, 25, conversationId);
  const relevant = matches.filter((m) => m.score > 0.4);

  if (relevant.length > 0) {
    const seen = new Set();
    const unique = [];
    for (const item of relevant) {
      const key = `${item.metadata?.documentId || "unknown"}:${item.metadata?.chunkIndex ?? "x"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
      if (unique.length >= 18) break;
    }

    return {
      context: unique
        .map(
          (m, i) =>
            `[Chunk ${i + 1} | ${m.metadata?.documentName || "Unknown"} | ${m.metadata?.documentId || "NA"}]
${m.metadata?.text || ""}`
        )
        .join("\n\n"),
      sourceDocumentIds: [...new Set(unique.map((m) => m.metadata?.documentId).filter(Boolean))],
    };
  }

  const docs = await Document.find({
    userId,
    conversationId,
    status: "ready",
    summary: { $ne: "" },
  })
    .select("_id name summary")
    .sort({ createdAt: -1 })
    .limit(10);

  if (docs.length === 0) {
    return { context: "", sourceDocumentIds: [] };
  }

  return {
    context: docs
      .map((d, i) => `[Summary ${i + 1} | ${d.name} | ${d._id}]\n${d.summary}`)
      .join("\n\n"),
    sourceDocumentIds: docs.map((d) => d._id.toString()),
  };
}

// POST /api/study/quiz/generate
router.post("/quiz/generate", protect, async (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const readyDocCount = await Document.countDocuments({
      userId: req.user.id,
      conversationId,
      status: "ready",
    });

    if (readyDocCount === 0) {
      return res.status(400).json({ error: "No ready documents found for this conversation." });
    }

    const { context, sourceDocumentIds } = await buildStudyContext({
      userId: req.user.id,
      conversationId,
      intentPrompt:
        "Generate a comprehensive quiz from the key concepts, definitions, facts, and processes in these documents.",
    });

    if (!context) {
      return res.status(400).json({ error: "Not enough document context to generate quiz." });
    }

    let quizPayload;
    try {
      quizPayload = await generateQuizFromContext(context);
    } catch (firstErr) {
      // Retry once to handle occasional malformed model output.
      quizPayload = await generateQuizFromContext(context);
    }

    const quiz = await Quiz.create({
      userId: req.user.id,
      conversationId,
      title: quizPayload.title,
      questions: quizPayload.questions,
      sourceDocumentIds,
    });

    await StudyResource.create({
      userId: req.user.id,
      conversationId,
      type: "quiz",
      title: quiz.title,
      description: "15-question MCQ generated from uploaded document context.",
      resourceRefId: quiz._id.toString(),
    });

    return res.status(201).json({
      quiz: {
        id: quiz._id,
        title: quiz.title,
        createdAt: quiz.createdAt,
        questions: quiz.questions.map((q, index) => ({
          questionNumber: index + 1,
          question: q.question,
          options: q.options,
        })),
      },
    });
  } catch (err) {
    console.error("[study/quiz/generate]", err);
    return res.status(500).json({ error: err.message || "Failed to generate quiz." });
  }
});

// POST /api/study/flashcards/generate
router.post("/flashcards/generate", protect, async (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const readyDocCount = await Document.countDocuments({
      userId: req.user.id,
      conversationId,
      status: "ready",
    });

    if (readyDocCount === 0) {
      return res.status(400).json({ error: "No ready documents found for this conversation." });
    }

    const { context, sourceDocumentIds } = await buildStudyContext({
      userId: req.user.id,
      conversationId,
      intentPrompt:
        "Generate effective study flashcards from key definitions, concepts, formulas, and practical takeaways in these documents.",
    });

    if (!context) {
      return res.status(400).json({ error: "Not enough document context to generate flashcards." });
    }

    let flashcardsPayload;
    try {
      flashcardsPayload = await generateFlashcardsFromContext(context);
    } catch (_firstErr) {
      flashcardsPayload = await generateFlashcardsFromContext(context);
    }

    const set = await FlashcardSet.create({
      userId: req.user.id,
      conversationId,
      title: flashcardsPayload.title,
      cards: flashcardsPayload.cards,
      sourceDocumentIds,
    });

    await StudyResource.create({
      userId: req.user.id,
      conversationId,
      type: "flashcards",
      title: set.title,
      description: "15 flashcards generated from uploaded document context.",
      resourceRefId: set._id.toString(),
    });

    return res.status(201).json({
      flashcards: {
        id: set._id,
        title: set.title,
        createdAt: set.createdAt,
        cards: set.cards,
      },
    });
  } catch (err) {
    console.error("[study/flashcards/generate]", err);
    return res.status(500).json({ error: err.message || "Failed to generate flashcards." });
  }
});

// GET /api/study/flashcards/:id
router.get("/flashcards/:id", protect, async (req, res) => {
  try {
    const set = await FlashcardSet.findOne({ _id: req.params.id, userId: req.user.id });
    if (!set) {
      return res.status(404).json({ error: "Flashcards not found." });
    }

    return res.json({
      flashcards: {
        id: set._id,
        title: set.title,
        createdAt: set.createdAt,
        cards: set.cards,
      },
    });
  } catch (err) {
    console.error("[study/flashcards/get]", err);
    return res.status(500).json({ error: "Failed to load flashcards." });
  }
});

// POST /api/study/flowchart/generate
router.post("/flowchart/generate", protect, async (req, res) => {
  try {
    const { conversationId, flowchartPreference = "" } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const readyDocCount = await Document.countDocuments({
      userId: req.user.id,
      conversationId,
      status: "ready",
    });

    if (readyDocCount === 0) {
      return res.status(400).json({ error: "No ready documents found for this conversation." });
    }

    const { context, sourceDocumentIds } = await buildStudyContext({
      userId: req.user.id,
      conversationId,
      intentPrompt: String(flowchartPreference).trim()
        ? String(flowchartPreference).trim()
        : "Create The Flowchart Based on key concepts and step-by-step process from these documents.",
    });

    if (!context) {
      return res.status(400).json({ error: "Not enough document context to generate flowchart." });
    }

    let flowchartPayload;
    try {
      flowchartPayload = await generateFlowchartFromContext(context, String(flowchartPreference || ""));
    } catch (_firstErr) {
      flowchartPayload = await generateFlowchartFromContext(context, String(flowchartPreference || ""));
    }

    const set = await FlowchartSet.create({
      userId: req.user.id,
      conversationId,
      title: flowchartPayload.title,
      steps: flowchartPayload.steps,
      mermaidCode: flowchartPayload.mermaidCode,
      sourceDocumentIds,
    });

    await StudyResource.create({
      userId: req.user.id,
      conversationId,
      type: "flowchart",
      title: set.title,
      description: "Step-by-step flowchart generated from uploaded document context.",
      resourceRefId: set._id.toString(),
    });

    return res.status(201).json({
      flowchart: {
        id: set._id,
        title: set.title,
        createdAt: set.createdAt,
        steps: set.steps,
        mermaidCode: set.mermaidCode,
      },
    });
  } catch (err) {
    console.error("[study/flowchart/generate]", err);
    const message = err?.message || "Failed to generate flowchart.";
    if (/insufficient document context|cannot be supported by the context/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
});

// GET /api/study/flowchart/:id
router.get("/flowchart/:id", protect, async (req, res) => {
  try {
    const set = await FlowchartSet.findOne({ _id: req.params.id, userId: req.user.id });
    if (!set) {
      return res.status(404).json({ error: "Flowchart not found." });
    }

    return res.json({
      flowchart: {
        id: set._id,
        title: set.title,
        createdAt: set.createdAt,
        steps: set.steps,
        mermaidCode: set.mermaidCode,
      },
    });
  } catch (err) {
    console.error("[study/flowchart/get]", err);
    return res.status(500).json({ error: "Failed to load flowchart." });
  }
});

// POST /api/study/quiz/:id/submit
router.post("/quiz/:id/submit", protect, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "answers must be an array of selected option indexes." });
    }

    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    if (answers.length !== quiz.questions.length) {
      return res.status(400).json({ error: `You must answer all ${quiz.questions.length} questions.` });
    }

    const feedback = quiz.questions.map((q, i) => {
      const selected = Number(answers[i]);
      const normalizedSelected = Number.isInteger(selected) && selected >= 0 && selected <= 3 ? selected : -1;
      const correct = q.correctOptionIndex;
      const isCorrect = normalizedSelected === correct;

      return {
        question: q.question,
        options: q.options,
        selectedOptionIndex: normalizedSelected,
        correctOptionIndex: correct,
        isCorrect,
        selectedReason:
          normalizedSelected >= 0 && normalizedSelected <= 3
            ? q.optionReasons[normalizedSelected]
            : "No valid option selected.",
        correctReason: q.optionReasons[correct],
      };
    });

    const score = feedback.filter((f) => f.isCorrect).length;
    const total = feedback.length;
    const percentage = Math.round((score / total) * 100);

    const result = await QuizResult.create({
      userId: req.user.id,
      conversationId: quiz.conversationId,
      quizId: quiz._id,
      answers,
      score,
      total,
      percentage,
      feedback,
    });

    return res.json({
      result: {
        id: result._id,
        quizId: quiz._id,
        quizTitle: quiz.title,
        score,
        total,
        percentage,
        createdAt: result.createdAt,
        feedback,
      },
    });
  } catch (err) {
    console.error("[study/quiz/submit]", err);
    return res.status(500).json({ error: err.message || "Failed to submit quiz." });
  }
});

// POST /api/study/quiz/:id/check
router.post("/quiz/:id/check", protect, async (req, res) => {
  try {
    const { questionIndex, selectedOptionIndex } = req.body;

    if (!Number.isInteger(questionIndex) || questionIndex < 0) {
      return res.status(400).json({ error: "questionIndex must be a non-negative integer." });
    }

    if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex > 3) {
      return res.status(400).json({ error: "selectedOptionIndex must be between 0 and 3." });
    }

    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    if (questionIndex >= quiz.questions.length) {
      return res.status(400).json({ error: "questionIndex is out of range." });
    }

    const q = quiz.questions[questionIndex];
    const correctOptionIndex = q.correctOptionIndex;
    const isCorrect = selectedOptionIndex === correctOptionIndex;

    return res.json({
      feedback: {
        question: q.question,
        options: q.options,
        selectedOptionIndex,
        correctOptionIndex,
        isCorrect,
        selectedReason: q.optionReasons[selectedOptionIndex],
        correctReason: q.optionReasons[correctOptionIndex],
      },
    });
  } catch (err) {
    console.error("[study/quiz/check]", err);
    return res.status(500).json({ error: err.message || "Failed to check answer." });
  }
});

// GET /api/study/quiz/:id
router.get("/quiz/:id", protect, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user.id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found." });
    }

    return res.json({
      quiz: {
        id: quiz._id,
        title: quiz.title,
        createdAt: quiz.createdAt,
        questions: quiz.questions.map((q, index) => ({
          questionNumber: index + 1,
          question: q.question,
          options: q.options,
        })),
      },
    });
  } catch (err) {
    console.error("[study/quiz/get]", err);
    return res.status(500).json({ error: "Failed to load quiz." });
  }
});

// GET /api/study/sidebar?conversationId=...
router.get("/sidebar", protect, async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const [resources, quizResults, flashcardSets] = await Promise.all([
      StudyResource.find({
        userId: req.user.id,
        conversationId,
      })
        .select("type title description resourceRefId createdAt")
        .sort({ createdAt: -1 })
        .limit(30),
      QuizResult.find({
        userId: req.user.id,
        conversationId,
      })
        .populate({ path: "quizId", select: "title" })
        .select("quizId score total percentage createdAt")
        .sort({ createdAt: -1 })
        .limit(30),
      FlashcardSet.find({
        userId: req.user.id,
        conversationId,
      })
        .select("title cards createdAt")
        .sort({ createdAt: -1 })
        .limit(30),
    ]);

    const mergedResults = [
      ...quizResults.map((r) => ({
        id: r._id,
        type: "quiz",
        quizId: r.quizId?._id,
        title: r.quizId?.title || "Quiz",
        score: r.score,
        total: r.total,
        percentage: r.percentage,
        createdAt: r.createdAt,
      })),
      ...flashcardSets.map((set) => ({
        id: set._id,
        type: "flashcards",
        flashcardsId: set._id,
        title: set.title,
        cardCount: Array.isArray(set.cards) ? set.cards.length : 0,
        createdAt: set.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);

    return res.json({
      resources: resources.map((r) => ({
        id: r._id,
        type: r.type,
        title: r.title,
        description: r.description,
        resourceRefId: r.resourceRefId,
        createdAt: r.createdAt,
      })),
      results: mergedResults,
    });
  } catch (err) {
    console.error("[study/sidebar]", err);
    return res.status(500).json({ error: "Failed to load study sidebar data." });
  }
});

module.exports = router;
