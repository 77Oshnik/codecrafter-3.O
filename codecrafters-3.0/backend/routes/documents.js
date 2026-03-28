const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { protect } = require("../middleware/auth");
const Document = require("../models/document");
const { uploadPDF, deletePDF } = require("../services/cloudinaryService");
const { getEmbedding } = require("../services/geminiService");
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
    const fileName = req.file.originalname.replace(/\s+/g, "_");
    const publicId = `${userId}_${Date.now()}_${fileName}`;

    // 1. Upload PDF to Cloudinary
    const cloudResult = await uploadPDF(req.file.buffer, publicId);

    // 2. Create document record (status: processing)
    const doc = await Document.create({
      userId,
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
        chunkId: id,
        chunkIndex: i,
      },
    });
    vectorIds.push(id);
  }

  // Upsert to Pinecone (namespace = userId for isolation)
  await upsertVectors(vectors, userId);

  // Update document record
  await Document.findByIdAndUpdate(doc._id, {
    status: "ready",
    vectorIds,
    chunkCount: chunks.length,
  });
}

// GET /api/documents
router.get("/", protect, async (req, res) => {
  try {
    const docs = await Document.find({ userId: req.user.id })
      .select("name status chunkCount cloudinaryUrl createdAt")
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

module.exports = router;
