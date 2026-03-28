const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema(
  {
    text: String,
    score: Number,
    documentName: String,
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    sources: [sourceSchema],
  },
  { timestamps: true }
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, default: "New Conversation" },
    messages: [messageSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
