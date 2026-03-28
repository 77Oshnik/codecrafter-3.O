const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { protect } = require("../middleware/auth");
const Document = require("../models/document");
const { uploadPDF, deletePDF } = require("../services/cloudinaryService");
const { getEmbedding } = require("../services/geminiService");
const { upsertVectors, deleteVectors } = require("../services/pineconeService");

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
 * Split text into overlapping chunks.
 */
function chunkText(text, chunkSize = 1500, overlap = 200) {
  const chunks = [];
  let start = 0;
  const clean = text.replace(/\s+/g, " ").trim();
  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - overlap;
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

  // Embed each chunk and build Pinecone vectors
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

    // Delete vectors from Pinecone
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
