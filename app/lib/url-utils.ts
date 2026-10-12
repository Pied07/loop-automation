export function extractUrlSignatures(url: string): string[] {
  if (!url) return [];
  const trimmed = url.trim().toLowerCase();
  const sigs = new Set<string>([trimmed]);

  try {
    const parsed = new URL(trimmed);
    // Base path without query params or hash
    const basePath = parsed.origin + parsed.pathname.replace(/\/+$/, "");
    sigs.add(basePath);

    // Path segments: the last non-empty segment is the video unique hash or filename
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment.length >= 8 && !["video", "mp4", "feed", "play"].includes(lastSegment)) {
        sigs.add(lastSegment);
      }
    }
    // Also check for numeric ID in query or path (e.g. video_id or /video/123456789)
    const numId = trimmed.match(/\/(\d{15,22})(?:\/|$|\?)/);
    if (numId) sigs.add(numId[1]);
  } catch {
    sigs.add(trimmed.split("?")[0]);
  }

  return Array.from(sigs);
}

export function isUrlDuplicate(url: string, excludedSignatures?: Set<string>): boolean {
  if (!url || !excludedSignatures || excludedSignatures.size === 0) return false;
  const sigs = extractUrlSignatures(url);
  return sigs.some((s) => excludedSignatures.has(s));
}

/**
 * Checks whether a URL is strictly an audio file or music stream (not a video).
 */
export function isAudioOnlyUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();

  // 1. Explicit audio MIME types in query parameters or URL string
  if (
    trimmed.includes("mime_type=audio_mpeg") ||
    trimmed.includes("mime_type=audio") ||
    trimmed.includes("mime_type=audio%2fmpeg") ||
    trimmed.includes("mime_type=audio%2fmp4") ||
    trimmed.includes("mime_type=audio%2faac") ||
    trimmed.includes("mime_type=audio%2fogg") ||
    trimmed.includes("mime_type=audio_mp4") ||
    trimmed.includes("mime_type=audio_aac")
  ) {
    return true;
  }

  // 2. Audio/Music CDN domains or URL path keywords
  if (
    trimmed.includes("music.tiktokcdn") ||
    trimmed.includes("ies-music") ||
    trimmed.includes("-music.tiktokcdn") ||
    trimmed.includes("/ies-music/") ||
    trimmed.includes("/music/original/")
  ) {
    return true;
  }

  // 3. Audio file extensions in URL or path
  const pathWithoutQuery = trimmed.split("?")[0].split("#")[0];
  if (
    /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba|aiff|wma)($|\/)/i.test(pathWithoutQuery) ||
    /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba|aiff|wma)$/i.test(pathWithoutQuery)
  ) {
    return true;
  }

  return false;
}

/**
 * Verifies whether a candidate URL points to a real playable video stream (rejects audio/empty streams).
 */
export async function isVerifiedVideoUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (isAudioOnlyUrl(url)) return false;

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3500),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Range: "bytes=0-1024",
      },
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    // If the server explicitly says it's audio, reject immediately
    if (contentType.startsWith("audio/")) {
      return false;
    }

    // If it's video or binary octet stream, it's accepted
    if (
      contentType.startsWith("video/") ||
      contentType.includes("mp4") ||
      contentType.includes("octet-stream") ||
      res.ok
    ) {
      return true;
    }
  } catch {
    // If HEAD request timed out or was blocked by CDN CORS, fall back to pattern check
  }

  return !isAudioOnlyUrl(url);
}

