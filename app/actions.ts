"use server";

// ─── actions.ts ───────────────────────────────────────────────────────────────
// Trimmed to only the functions actively used by the app.
// All AI generation, video rendering, and Inngest functions have been removed.
// ─────────────────────────────────────────────────────────────────────────────

function ensureRelevantHashtags(hashtags: unknown, context: string) {
  const stopWords = new Set(["about", "after", "again", "against", "also", "and", "are", "before", "being", "between", "could", "during", "from", "have", "into", "just", "more", "most", "over", "should", "that", "their", "there", "these", "they", "this", "through", "under", "very", "video", "with", "would", "your"]);
  const clean = (value: string) => value.replace(/^#+/, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const selected = Array.isArray(hashtags) ? hashtags.filter((tag): tag is string => typeof tag === "string").map(clean).filter(Boolean) : [];
  const words = context.match(/[\p{L}\p{N}]{3,}/gu) || [];
  const relevant = words.map(clean).filter((word) => word.length >= 3 && !stopWords.has(word));
  const defaults = ["shorts", "shortstory", "storytelling", "viralclips", "trending", "cinematic", "storytime", "viralshorts", "creativevideo", "reels"];
  for (const tag of [...relevant, ...defaults]) {
    if (!selected.includes(tag)) selected.push(tag);
    if (selected.length >= 10) break;
  }
  return selected.slice(0, 15).map((tag) => `#${tag}`);
}

// ─── Get published videos from YouTube ───────────────────────────────────────
export async function getPublishedAutomationVideos() {
  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();
  if (!tokens || Object.keys(tokens).length === 0) {
    throw new Error("YouTube is not connected on this server.");
  }
  if (!tokens.youtube?.access_token) throw new Error("YouTube is not connected. Reconnect YouTube to recover published videos.");

  const { google } = require("googleapis");
  const oauth2Client = new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials(tokens.youtube);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channels = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const uploadsId = channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return [];
  const uploads = await youtube.playlistItems.list({ part: ["snippet", "contentDetails"], playlistId: uploadsId, maxResults: 50 });
  const items = uploads.data.items || [];
  const videoIds = items.map((item: any) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter(Boolean);
  const metadata = videoIds.length ? await youtube.videos.list({ part: ["snippet"], id: videoIds.join(",") }) : { data: { items: [] } };
  const snippetsById = new Map((metadata.data.items || []).map((video: any) => [video.id, video.snippet]));
  const knownFormats = ["Motivational", "Funny", "Educational", "Nature", "Sports", "Music", "Gaming", "Travel", "Food", "Fashion"];
  const normalizeFormat = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return items.flatMap((item: any) => {
    const snippet = item.snippet;
    const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
    if (!videoId) return [];
    const details = snippetsById.get(videoId) || snippet;
    const title = String(details.title || snippet.title || "Viral Clip");
    const prefix = title.match(/^([^:]{2,24}):/)?.[1]?.trim();
    const format = knownFormats.find((candidate) => normalizeFormat(candidate) === normalizeFormat(prefix || "") || (details.tags || []).some((tag: string) => normalizeFormat(tag) === normalizeFormat(candidate))) || "Viral Clip";
    return [{
      id: `youtube-${videoId}`,
      title,
      description: "Recovered from your YouTube uploads.",
      captions: "",
      hashtags: ensureRelevantHashtags(details.tags, `${title} ${details.description || ""}`),
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      youtubeVideoId: videoId,
      format,
      createdAt: details.publishedAt ? new Date(details.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: "completed" as const,
    }];
  });
}

// ─── Delete from YouTube ──────────────────────────────────────────────────────
export async function deleteFromYouTube(videoId: string) {
  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();
  if (!tokens?.youtube?.access_token) throw new Error("YouTube not connected. Cannot delete from YouTube.");
  try {
    const { google } = require("googleapis");
    const oauth2Client = new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2Client.setCredentials(tokens.youtube);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    await youtube.videos.delete({ id: videoId });
    return { success: true };
  } catch (error: any) {
    if (error?.code === 404 || error?.response?.status === 404) return { success: true, alreadyAbsent: true };
    throw new Error(error.message || "Failed to delete from YouTube API");
  }
}

// ─── Delete from Facebook ─────────────────────────────────────────────────────
export async function deleteFromFacebook(videoId: string) {
  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();
  if (!tokens?.facebook?.page_id || !tokens?.facebook?.page_access_token) {
    throw new Error("Facebook Page access is not verified. Reconnect Facebook in Settings.");
  }
  try {
    const delRes = await fetch(`https://graph.facebook.com/v26.0/${videoId}?access_token=${tokens.facebook.page_access_token}`, { method: "DELETE" });
    const delData = await delRes.json();
    if (delData.error) {
      if (delData.error.code === 100) return { success: true, alreadyAbsent: true };
      throw new Error(delData.error.message);
    }
    return { success: true };
  } catch (error: any) {
    throw new Error(error.message || "Failed to delete from Facebook API");
  }
}
