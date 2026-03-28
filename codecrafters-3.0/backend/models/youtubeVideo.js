const mongoose = require("mongoose");

const youtubeVideoSchema = new mongoose.Schema(
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
    url: { type: String, required: true },
    videoId: { type: String, required: true, index: true },
    title: { type: String, default: "YouTube Video" },
    transcript: { type: String, default: "" },
    transcriptLanguage: { type: String, default: "" },
    vectorIds: [{ type: String }],
    chunkCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    summary: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

youtubeVideoSchema.index({ userId: 1, conversationId: 1, videoId: 1 }, { unique: true });

module.exports = mongoose.model("YouTubeVideo", youtubeVideoSchema);
