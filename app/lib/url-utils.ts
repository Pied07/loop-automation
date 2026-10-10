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
