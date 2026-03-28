const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { protect } = require("../middleware/auth");
const Document = require("../models/document");
const { uploadPDF, deletePDF } = require("../services/cloudinaryService");
const {
  getEmbedding,
  generateSummary,
  generateRevisionNotes,
} = require("../services/geminiService");
const { upsertVectors, deleteVectors } = require("../services/qdrantService");

const router = express.Router();

// Store files in memory so we can pipe the buffer to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed."), false);
    }
  },
});

/**
 * Split PDF text into paragraph-aware chunks.
 */
function chunkText(text, maxChunkChars = 1500, overlapParagraphs = 1) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const rawParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const paragraphs = [];
  for (const paragraph of rawParagraphs) {
    if (paragraph.length <= maxChunkChars) {
      paragraphs.push(paragraph);
      continue;
    }

    // Split oversized paragraphs by sentence boundaries first, then hard-split if needed.
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let sentenceBuffer = "";
    for (const sentence of sentences) {
      const candidate = sentenceBuffer ? `${sentenceBuffer} ${sentence}` : sentence;
      if (candidate.length <= maxChunkChars) {
        sentenceBuffer = candidate;
        continue;
      }

      if (sentenceBuffer) {
        paragraphs.push(sentenceBuffer);
      }

      if (sentence.length <= maxChunkChars) {
        sentenceBuffer = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxChunkChars) {
          paragraphs.push(sentence.slice(i, i + maxChunkChars));
        }
        sentenceBuffer = "";
      }
    }

    if (sentenceBuffer) {
      paragraphs.push(sentenceBuffer);
    }
  }

  const chunks = [];
  let current = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const candidate = current ? `${current}\n\n${p}` : p;

    if (!current || candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }

    chunks.push(current);

    const overlapStart = Math.max(0, i - overlapParagraphs);
    const overlapBlock = paragraphs.slice(overlapStart, i).join("\n\n");
    current = overlapBlock ? `${overlapBlock}\n\n${p}` : p;

    if (current.length > maxChunkChars) {
      chunks.push(current.slice(0, maxChunkChars));
      current = current.slice(maxChunkChars);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

// POST /api/documents/upload
router.post("/upload", protect, upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file provided." });
    }

    const userId = req.user.id;
    const { conversationId } = req.body;
    const fileName = req.file.originalname.replace(/\s+/g, "_");
    const publicId = `${userId}_${Date.now()}_${fileName}`;

    // 1. Upload PDF to Cloudinary
    const cloudResult = await uploadPDF(req.file.buffer, publicId);

    // 2. Create document record (status: processing)
    const doc = await Document.create({
      userId,
      conversationId: conversationId || undefined,
      name: req.file.originalname,
      cloudinaryUrl: cloudResult.secure_url,
      cloudinaryPublicId: cloudResult.public_id,
    });

    // 3. Process asynchronously (extract → chunk → embed → upsert)
    processPDF(doc, req.file.buffer, userId).catch((err) => {
      console.error("[processPDF]", err);
      Document.findByIdAndUpdate(doc._id, { status: "failed" }).catch(() => {});
    });

    return res.status(201).json({
      message: "PDF uploaded. Processing in background.",
      document: {
        id: doc._id,
        name: doc.name,
        status: doc.status,
        cloudinaryUrl: doc.cloudinaryUrl,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error("[documents/upload]", err);
    return res.status(500).json({ error: err.message || "Upload failed." });
  }
});

async function processPDF(doc, buffer, userId) {
  // Extract text
  const pdfData = await pdfParse(buffer);
  const text = pdfData.text;

  if (!text || text.trim().length === 0) {
    await Document.findByIdAndUpdate(doc._id, { status: "failed" });
    return;
  }

  // Chunk text
  const chunks = chunkText(text);

  // Embed each chunk and build vector points
  const vectors = [];
  const vectorIds = [];

  for (let i = 0; i < chunks.length; i++) {
    const id = `${doc._id}_chunk_${i}`;
    const embedding = await getEmbedding(chunks[i]);
    vectors.push({
      id,
      values: embedding,
      metadata: {
        text: chunks[i],
        documentId: doc._id.toString(),
        documentName: doc.name,
        userId,
        conversationId: doc.conversationId ? doc.conversationId.toString() : null,
        chunkId: id,
        chunkIndex: i,
      },
    });
    vectorIds.push(id);
  }

  // Upsert to Qdrant
  await upsertVectors(vectors, userId);

  // Generate summary
  let summary = "";
  try {
    summary = await generateSummary(text, doc.name);
  } catch (err) {
    console.warn("[processPDF] Summary generation failed:", err.message);
  }

  // Update document record
  await Document.findByIdAndUpdate(doc._id, {
    status: "ready",
    vectorIds,
    chunkCount: chunks.length,
    summary,
  });
}

// GET /api/documents?conversationId=xxx
router.get("/", protect, async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.conversationId) filter.conversationId = req.query.conversationId;
    const docs = await Document.find(filter)
      .select("name status chunkCount cloudinaryUrl createdAt conversationId summary")
      .sort({ createdAt: -1 });
    return res.json(docs);
  } catch (err) {
    console.error("[documents/list]", err);
    return res.status(500).json({ error: "Failed to fetch documents." });
  }
});

// DELETE /api/documents/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    // Delete vectors from Qdrant
    if (doc.vectorIds && doc.vectorIds.length > 0) {
      await deleteVectors(doc.vectorIds, req.user.id);
    }

    // Delete file from Cloudinary
    await deletePDF(doc.cloudinaryPublicId);

    // Delete from MongoDB
    await Document.deleteOne({ _id: doc._id });

    return res.json({ message: "Document deleted." });
  } catch (err) {
    console.error("[documents/delete]", err);
    return res.status(500).json({ error: "Failed to delete document." });
  }
});

// POST /api/documents/:id/summary — regenerate summary for a document
router.post("/:id/summary", protect, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ error: "Document not found." });
    if (doc.status !== "ready") {
      return res.status(400).json({ error: "Document is not ready yet." });
    }

    // Re-download the PDF from Cloudinary and extract text
    const response = await fetch(doc.cloudinaryUrl);
    if (!response.ok) throw new Error("Failed to download document from storage.");
    const buffer = Buffer.from(await response.arrayBuffer());
    const pdfData = await pdfParse(buffer);

    const summary = await generateSummary(pdfData.text, doc.name);
    await Document.findByIdAndUpdate(doc._id, { summary });

    return res.json({ summary });
  } catch (err) {
    console.error("[documents/summary]", err);
    return res.status(500).json({ error: err.message || "Failed to generate summary." });
  }
});

// POST /api/documents/revision — generate revision notes for all docs in a conversation
router.post("/revision", protect, async (req, res) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const docs = await Document.find({
      userId: req.user.id,
      conversationId,
      status: "ready",
    }).select("name summary");

    if (docs.length === 0) {
      return res.status(404).json({ error: "No ready documents found for this chat." });
    }

    const revision = await generateRevisionNotes(
      docs.map((doc) => ({
        name: doc.name,
        summary: doc.summary || "",
      }))
    );

    const generatedAt = new Date().toISOString();
    const safeConversationId = String(conversationId).slice(-8);
    const fileName = `revision-${safeConversationId}-${generatedAt.slice(0, 10)}.md`;

    return res.json({
      revision,
      generatedAt,
      documentCount: docs.length,
      fileName,
    });
  } catch (err) {
    console.error("[documents/revision]", err);
    return res.status(500).json({ error: err.message || "Failed to generate revision notes." });
  }
});

module.exports = router;
