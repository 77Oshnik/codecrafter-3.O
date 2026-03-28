const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    selectedOptionIndex: { type: Number, required: true },
    correctOptionIndex: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true },
    selectedReason: { type: String, required: true },
    correctReason: { type: String, required: true },
  },
  { _id: false }
);

const quizResultSchema = new mongoose.Schema(
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
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    answers: [{ type: Number, required: true }],
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percentage: { type: Number, required: true },
    feedback: { type: [feedbackSchema], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizResult", quizResultSchema);
