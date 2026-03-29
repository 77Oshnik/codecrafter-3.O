const express = require("express");
const { extractYouTubeVideoId, fetchYouTubeTitle } = require("../utils/youtube");
const { summarizeTranscript, answerTranscriptQuestion } = require("../services/geminiService");

const router = express.Router();

async function getYoutubeTranscriptClient() {
  // youtube-transcript is ESM; load via dynamic import from CJS context.
  const mod = await import("youtube-transcript/dist/youtube-transcript.esm.js");
  return mod?.YoutubeTranscript;
}

router.post("/", async (req, res) => {
  const youtubeUrl = String(req.body?.youtubeUrl || "").trim();

  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid YouTube URL. Could not extract a video ID." });
  }

  try {
    const YoutubeTranscript = await getYoutubeTranscriptClient();
    if (!YoutubeTranscript) {
      return res.status(500).json({ success: false, error: "Transcript client failed to load." });
    }

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(404).json({ success: false, error: "No transcript available for this video." });
    }

    const segments = transcript.map((item) => ({
      text: String(item.text || "").trim(),
      offset: Number(item.offset) || 0,
      duration: Number(item.duration) || 0,
    }));

    const fullText = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    const transcriptLength = fullText.length;
    const title = await fetchYouTubeTitle(videoId);

    return res.json({
      success: true,
      videoId,
      title,
      fullText,
      segments,
      transcriptLength,
    });
  } catch (err) {
    const message = err?.message || "Failed to fetch transcript.";
    const isNotFound = /not available|not found|no transcript/i.test(message);
    return res
      .status(isNotFound ? 404 : 500)
      .json({ success: false, error: isNotFound ? "No transcript available for this video." : message });
  }
});

router.post("/summary", async (req, res) => {
  const transcript = String(req.body?.transcript || req.body?.fullText || "").trim();
  const title = String(req.body?.title || "").trim();

  if (!transcript) {
    return res.status(400).json({ success: false, error: "Transcript text is required." });
  }

  try {
    const summary = await summarizeTranscript(transcript, title);
    return res.json({ success: true, summary });
  } catch (err) {
    const message = err?.message || "Failed to summarize transcript.";
    return res.status(500).json({ success: false, error: message });
  }
});

router.post("/qa", async (req, res) => {
  const transcript = String(req.body?.transcript || req.body?.fullText || "").trim();
  const question = String(req.body?.question || "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!transcript) {
    return res.status(400).json({ success: false, error: "Transcript text is required." });
  }
  if (!question) {
    return res.status(400).json({ success: false, error: "Question is required." });
  }

  try {
    const { answer, related } = await answerTranscriptQuestion(transcript, question, history);
    return res.json({ success: true, answer, related });
  } catch (err) {
    const message = err?.message || "Failed to answer question.";
    return res.status(500).json({ success: false, error: message });
  }
});

module.exports = router;
