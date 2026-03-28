const mongoose = require("mongoose");

const studyResourceSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["quiz", "flashcards", "flowchart", "revision", "youtube"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    resourceRefId: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudyResource", studyResourceSchema);
