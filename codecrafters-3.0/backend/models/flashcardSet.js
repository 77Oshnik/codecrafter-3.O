const mongoose = require("mongoose");

const flashcardSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false }
);

const flashcardSetSchema = new mongoose.Schema(
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
    cards: {
      type: [flashcardSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 8,
        message: "Flashcard set must contain at least 8 cards.",
      },
      required: true,
    },
    sourceDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("FlashcardSet", flashcardSetSchema);
