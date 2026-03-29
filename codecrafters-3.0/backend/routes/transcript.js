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

// Fetch related YouTube videos using Data API (fallbacks to query search when needed)
router.get("/related", async (req, res) => {
  const requestedQuery = String(req.query?.q || "").trim();
  const youtubeUrl = String(req.query?.youtubeUrl || "").trim();
  const videoIdParam = String(req.query?.videoId || "").trim();
  const title = String(req.query?.title || "").trim();

  const videoId = extractYouTubeVideoId(youtubeUrl) || videoIdParam;
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ success: false, error: "YOUTUBE_API_KEY is not configured." });
  }

  try {
    let effectiveQuery = requestedQuery || title;
    if (!effectiveQuery && videoId) {
      try {
        effectiveQuery = await fetchYouTubeTitle(videoId);
      } catch {
        // Ignore title fetch failures and use fallback query.
      }
    }
    effectiveQuery = (effectiveQuery || "learning tutorial").trim();

    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoEmbeddable", "true");
    searchUrl.searchParams.set("maxResults", "6");
    searchUrl.searchParams.set("q", effectiveQuery);
    searchUrl.searchParams.set("key", apiKey);

    const ytRes = await fetch(searchUrl.toString());
    const ytJson = await ytRes.json();

    if (!ytRes.ok) {
      const errMessage = ytJson?.error?.message || "Failed to fetch related videos.";
      return res.status(502).json({ success: false, error: errMessage });
    }

    const items = Array.isArray(ytJson?.items) ? ytJson.items : [];
    const videos = items
      .map((item) => {
        const vid = item?.id?.videoId;
        const snippet = item?.snippet || {};
        if (!vid) return null;
        return {
          videoId: vid,
          title: snippet.title || "Untitled video",
          channelTitle: snippet.channelTitle || "",
          description: snippet.description || "",
          publishedAt: snippet.publishedAt || null,
          thumbnailUrl:
            snippet?.thumbnails?.high?.url ||
            snippet?.thumbnails?.medium?.url ||
            snippet?.thumbnails?.default?.url ||
            "",
          url: `https://www.youtube.com/watch?v=${vid}`,
          embedUrl: `https://www.youtube.com/embed/${vid}`,
        };
      })
      .filter(Boolean);

    return res.json({ success: true, videos, query: effectiveQuery });
  } catch (err) {
    const message = err?.message || "Failed to fetch related videos.";
    return res.status(500).json({ success: false, error: message });
  }
});

module.exports = router;
