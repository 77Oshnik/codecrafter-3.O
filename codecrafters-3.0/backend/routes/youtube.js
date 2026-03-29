const express = require("express");
const { protect } = require("../middleware/auth");
const Conversation = require("../models/conversation");
const YouTubeVideo = require("../models/youtubeVideo");
const {
  getEmbedding,
  generateYouTubeSummary,
  generateYouTubeNotes,
} = require("../services/geminiService");
const { upsertVectors, deleteVectors } = require("../services/qdrantService");
const { extractYouTubeVideoId, fetchYouTubeTitle } = require("../utils/youtube");

const router = express.Router();

function parseInlineJson(html, variableName) {
  const marker = `var ${variableName} = `;
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(parseInt(code, 10)));
}

function parseTranscriptXml(xml, lang = "") {
  const results = [];

  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const attrs = pMatch[1] || "";
    const body = pMatch[2] || "";

    const tAttr = attrs.match(/\bt="([^"]+)"/);
    const dAttr = attrs.match(/\bd="([^"]+)"/);
    const offset = Number.parseFloat(tAttr?.[1] || "0") / 1000;
    const duration = Number.parseFloat(dAttr?.[1] || "0") / 1000;

    let combined = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(body)) !== null) {
      combined += sMatch[1] || "";
    }

    const text = decodeEntities((combined || body.replace(/<[^>]+>/g, "")).trim());
    if (text) {
      results.push({ text, offset, duration, lang });
    }
  }

  if (results.length > 0) return results;

  const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let tMatch;
  while ((tMatch = textRegex.exec(xml)) !== null) {
    const attrs = tMatch[1] || "";
    const body = tMatch[2] || "";
    const startAttr = attrs.match(/\bstart="([^"]*)"/);
    const durAttr = attrs.match(/\bdur="([^"]*)"/);

    results.push({
      text: decodeEntities(body.replace(/<[^>]+>/g, "").trim()),
      offset: Number.parseFloat(startAttr?.[1] || "0"),
      duration: Number.parseFloat(durAttr?.[1] || "0"),
      lang,
    });
  }

  return results;
}

function parseTranscriptJson3(json, lang = "") {
  const events = Array.isArray(json?.events) ? json.events : [];
  const rows = [];

  for (const event of events) {
    if (!Array.isArray(event?.segs) || event.segs.length === 0) continue;

    const text = event.segs
      .map((seg) => String(seg?.utf8 || ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    rows.push({
      text: decodeEntities(text),
      offset: (Number(event?.tStartMs) || 0) / 1000,
      duration: (Number(event?.dDurationMs) || 0) / 1000,
      lang,
    });
  }

  return rows;
}

function withJson3Format(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("fmt", "json3");
    return u.toString();
  } catch {
    return url;
  }
}

function withFormat(url, format) {
  try {
    const u = new URL(url);
    u.searchParams.set("fmt", format);
    return u.toString();
  } catch {
    return url;
  }
}

function parseVttTimestamp(value) {
  const clean = value.trim().replace(",", ".");
  const parts = clean.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return 0;

  const seconds = Number.parseFloat(parts[parts.length - 1] || "0");
  const minutes = Number.parseInt(parts[parts.length - 2] || "0", 10);
  const hours = parts.length === 3 ? Number.parseInt(parts[0] || "0", 10) : 0;

  if (Number.isNaN(seconds) || Number.isNaN(minutes) || Number.isNaN(hours)) return 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseTranscriptVtt(vtt, lang = "") {
  const lines = String(vtt || "").replace(/\r\n/g, "\n").split("\n");
  const rows = [];

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] || "").trim();

    const tsMatch = line.match(
      /^(\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3}\s+-->\s+(\d{1,2}:)?\d{1,2}:\d{2}[\.,]\d{3}/
    );

    if (!tsMatch) {
      i += 1;
      continue;
    }

    const [startRaw, endRaw] = line.split("-->").map((s) => s.trim().split(" ")[0]);
    const start = parseVttTimestamp(startRaw || "0:00.000");
    const end = parseVttTimestamp(endRaw || "0:00.000");

    i += 1;
    const cueLines = [];
    while (i < lines.length && (lines[i] || "").trim() !== "") {
      cueLines.push(lines[i]);
      i += 1;
    }

    const text = decodeEntities(cueLines.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (text) {
      rows.push({
        text,
        offset: start,
        duration: Math.max(0, end - start),
        lang,
      });
    }
  }

  return rows;
}

function parseTranscriptPayload(payload, lang = "") {
  const raw = String(payload || "").trim();
  if (!raw) return [];

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const json = JSON.parse(raw);
      const fromJson = parseTranscriptJson3(json, lang);
      if (fromJson.length > 0) return fromJson;
    } catch {
      // continue with non-JSON parsers
    }
  }

  if (raw.startsWith("WEBVTT")) {
    const fromVtt = parseTranscriptVtt(raw, lang);
    if (fromVtt.length > 0) return fromVtt;
  }

  if (raw.includes("<transcript") || raw.includes("<timedtext") || raw.includes("<text") || raw.includes("<p")) {
    const fromXml = parseTranscriptXml(raw, lang);
    if (fromXml.length > 0) return fromXml;
  }

  return [];
}

async function fetchYouTubeTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const html = await fetch(watchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  }).then((r) => r.text());

  if (!html.includes('"playabilityStatus":')) {
    throw new Error("The YouTube video is unavailable.");
  }

  const player = parseInlineJson(html, "ytInitialPlayerResponse");
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("Transcript is unavailable or disabled for this video.");
  }

  const chosenTrack = tracks[0];
  if (!chosenTrack?.baseUrl) {
    throw new Error("Transcript URL not found.");
  }

  const allTracks = tracks.filter((track) => Boolean(track?.baseUrl));
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  for (const track of allTracks) {
    const baseUrl = track.baseUrl;
    const lang = track.languageCode || "";

    const candidates = [
      withJson3Format(baseUrl),
      withFormat(baseUrl, "srv3"),
      withFormat(baseUrl, "ttml"),
      withFormat(baseUrl, "vtt"),
      baseUrl,
    ];

    const deduped = [...new Set(candidates)];

    for (const candidate of deduped) {
      try {
        const response = await fetch(candidate, {
          headers: { "User-Agent": userAgent },
        });
        if (!response.ok) continue;

        const payload = await response.text();
        const parsed = parseTranscriptPayload(payload, lang);
        if (parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Try next candidate/track.
      }
    }
  }

  const langs = tracks.map((t) => t?.languageCode).filter(Boolean);
  if (langs.length > 0) {
    throw new Error(`Transcript parsing returned no segments. Available caption languages: ${langs.join(", ")}.`);
  }

  throw new Error("Transcript parsing returned no segments.");

}

function chunkTranscriptEntries(entries, maxChars = 1400) {
  const chunks = [];
  let currentTexts = [];
  let currentStart = null;
  let currentEnd = null;
  let currentLength = 0;

  for (const item of entries) {
    const text = String(item.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const offset = Number(item.offset) || 0;
    const duration = Number(item.duration) || 0;
    const end = Math.max(offset, offset + duration);

    const candidateLength = currentLength === 0 ? text.length : currentLength + 1 + text.length;

    if (candidateLength > maxChars && currentTexts.length > 0) {
      chunks.push({
        text: currentTexts.join(" "),
        startSec: currentStart ?? 0,
        endSec: currentEnd ?? currentStart ?? 0,
      });
      currentTexts = [text];
      currentStart = offset;
      currentEnd = end;
      currentLength = text.length;
      continue;
    }

    if (currentTexts.length === 0) {
      currentStart = offset;
    }

    currentTexts.push(text);
    currentEnd = end;
    currentLength = candidateLength;
  }

  if (currentTexts.length > 0) {
    chunks.push({
      text: currentTexts.join(" "),
      startSec: currentStart ?? 0,
      endSec: currentEnd ?? currentStart ?? 0,
    });
  }

  return chunks;
}

router.post("/ingest", protect, async (req, res) => {
  try {
    const { conversationId, url } = req.body;

    if (!conversationId || !url) {
      return res.status(400).json({ error: "conversationId and url are required." });
    }

    const conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.id });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL." });
    }

    const existing = await YouTubeVideo.findOne({
      userId: req.user.id,
      conversationId,
      videoId,
    });

    if (existing?.status === "ready") {
      return res.json({
        video: {
          id: existing._id,
          conversationId: existing.conversationId,
          url: existing.url,
          videoId: existing.videoId,
          title: existing.title,
          status: existing.status,
          chunkCount: existing.chunkCount,
          summary: existing.summary,
          notes: existing.notes,
          createdAt: existing.createdAt,
        },
      });
    }

    const transcript = await fetchYouTubeTranscript(videoId);
    if (!Array.isArray(transcript) || transcript.length === 0) {
      return res.status(400).json({ error: "Transcript not available for this video." });
    }

    const title = await fetchYouTubeTitle(videoId);
    const chunks = chunkTranscriptEntries(transcript);
    if (chunks.length === 0) {
      return res.status(400).json({ error: "Transcript is empty after preprocessing." });
    }

    const userId = String(req.user.id);

    let video = existing;
    if (!video) {
      video = await YouTubeVideo.create({
        userId,
        conversationId,
        url,
        videoId,
        title,
        status: "processing",
      });
    } else {
      video.url = url;
      video.title = title;
      video.status = "processing";
      video.transcript = "";
      video.vectorIds = [];
      video.chunkCount = 0;
      await video.save();
    }

    const vectors = [];
    const vectorIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vectorId = `yt_${video._id}_chunk_${i}`;
      const embedding = await getEmbedding(chunk.text);

      vectors.push({
        id: vectorId,
        values: embedding,
        metadata: {
          sourceType: "youtube",
          text: chunk.text,
          userId,
          conversationId: String(conversationId),
          videoRecordId: String(video._id),
          videoId,
          videoTitle: title,
          documentId: `youtube:${videoId}`,
          documentName: title,
          chunkId: vectorId,
          chunkIndex: i,
          startSec: chunk.startSec,
          endSec: chunk.endSec,
        },
      });
      vectorIds.push(vectorId);
    }

    await upsertVectors(vectors, userId);

    const transcriptText = chunks.map((c, idx) => `(${idx + 1}) ${c.text}`).join("\n\n");

    video.status = "ready";
    video.vectorIds = vectorIds;
    video.chunkCount = chunks.length;
    video.transcript = transcriptText;
    video.transcriptLanguage = transcript[0]?.lang || "";
    await video.save();

    return res.status(201).json({
      video: {
        id: video._id,
        conversationId: video.conversationId,
        url: video.url,
        videoId: video.videoId,
        title: video.title,
        status: video.status,
        chunkCount: video.chunkCount,
        summary: video.summary,
        notes: video.notes,
        createdAt: video.createdAt,
      },
    });
  } catch (err) {
    console.error("[youtube/ingest]", err);
    return res.status(500).json({ error: err.message || "Failed to ingest YouTube video." });
  }
});

router.get("/", protect, async (req, res) => {
  try {
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required." });
    }

    const videos = await YouTubeVideo.find({ userId: req.user.id, conversationId })
      .select("conversationId url videoId title status chunkCount summary notes createdAt")
      .sort({ createdAt: -1 });

    return res.json(
      videos.map((video) => ({
        id: video._id,
        conversationId: video.conversationId,
        url: video.url,
        videoId: video.videoId,
        title: video.title,
        status: video.status,
        chunkCount: video.chunkCount,
        summary: video.summary,
        notes: video.notes,
        createdAt: video.createdAt,
      }))
    );
  } catch (err) {
    console.error("[youtube/list]", err);
    return res.status(500).json({ error: "Failed to fetch videos." });
  }
});

router.post("/:id/summary", protect, async (req, res) => {
  try {
    const video = await YouTubeVideo.findOne({ _id: req.params.id, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found." });
    if (video.status !== "ready") return res.status(400).json({ error: "Video is not ready yet." });

    const summary = await generateYouTubeSummary({
      title: video.title,
      transcript: video.transcript,
    });

    video.summary = summary;
    await video.save();

    return res.json({ summary });
  } catch (err) {
    console.error("[youtube/summary]", err);
    return res.status(500).json({ error: err.message || "Failed to generate summary." });
  }
});

router.post("/:id/notes", protect, async (req, res) => {
  try {
    const video = await YouTubeVideo.findOne({ _id: req.params.id, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found." });
    if (video.status !== "ready") return res.status(400).json({ error: "Video is not ready yet." });

    const notes = await generateYouTubeNotes({
      title: video.title,
      transcript: video.transcript,
    });

    video.notes = notes;
    await video.save();

    return res.json({ notes });
  } catch (err) {
    console.error("[youtube/notes]", err);
    return res.status(500).json({ error: err.message || "Failed to generate notes." });
  }
});

router.delete("/:id", protect, async (req, res) => {
  try {
    const video = await YouTubeVideo.findOne({ _id: req.params.id, userId: req.user.id });
    if (!video) return res.status(404).json({ error: "Video not found." });

    if (Array.isArray(video.vectorIds) && video.vectorIds.length > 0) {
      await deleteVectors(video.vectorIds, req.user.id).catch(() => {});
    }

    await YouTubeVideo.deleteOne({ _id: video._id });
    return res.json({ message: "Video deleted." });
  } catch (err) {
    console.error("[youtube/delete]", err);
    return res.status(500).json({ error: "Failed to delete video." });
  }
});

module.exports = router;
