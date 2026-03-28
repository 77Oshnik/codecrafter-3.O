const mongoose = require("mongoose");

const quizQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: {
      type: [String],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 4,
        message: "Each quiz question must have exactly 4 options.",
      },
      required: true,
    },
    correctOptionIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
    },
    optionReasons: {
      type: [String],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 4,
        message: "Each quiz question must have exactly 4 option reasons.",
      },
      required: true,
    },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    questions: {
      type: [quizQuestionSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 15,
        message: "Quiz must contain exactly 15 questions.",
      },
      required: true,
    },
    sourceDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quiz", quizSchema);
