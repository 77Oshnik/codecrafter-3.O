function extractYouTubeVideoId(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  // Try full URL parsing first for common patterns
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? id.slice(0, 11) : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const v = url.searchParams.get("v");
        return v ? v.slice(0, 11) : null;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v") {
        return parts[1] ? parts[1].slice(0, 11) : null;
      }
    }
  } catch {
    // Fall back to regex extraction below
  }

  // Regex fallback for any other YouTube URL shapes
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/))([\w-]{11})/;
  const match = input.match(regex);
  if (match?.[1]) return match[1];

  // Direct video id provided
  if (/^[\w-]{11}$/.test(input)) return input;

  return null;
}

async function fetchYouTubeTitle(videoId) {
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    );

    if (!oembed.ok) return "YouTube Video";

    const data = await oembed.json();
    return data?.title || "YouTube Video";
  } catch {
    return "YouTube Video";
  }
}

module.exports = {
  extractYouTubeVideoId,
  fetchYouTubeTitle,
};
