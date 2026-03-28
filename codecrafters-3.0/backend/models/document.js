const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    // Array of Pinecone vector IDs so we can delete them later
    vectorIds: [{ type: String }],
    chunkCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
