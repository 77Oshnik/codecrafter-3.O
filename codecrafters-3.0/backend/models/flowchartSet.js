const mongoose = require("mongoose");

const flowchartSetSchema = new mongoose.Schema(
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
    steps: {
      type: [String],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 5,
        message: "Flowchart must contain at least 5 steps.",
      },
      required: true,
    },
    mermaidCode: { type: String, required: true },
    sourceDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("FlowchartSet", flowchartSetSchema);
