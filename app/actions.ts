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

// ─── Delete from Facebook (Reel, Feed Post, and Story) ─────────────────────────
export async function deleteFromFacebook(
  videoId: string,
  extra?: { feedPostId?: string; storyId?: string; title?: string }
) {
  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();
  if (!tokens?.facebook?.page_id || !tokens?.facebook?.page_access_token) {
    throw new Error("Facebook Page access is not verified. Reconnect Facebook in Settings.");
  }

  const pageId = tokens.facebook.page_id;
  const pageToken = tokens.facebook.page_access_token;

  // 1. Delete the primary Reel video
  if (videoId) {
    try {
      await fetch(`https://graph.facebook.com/v26.0/${videoId}?access_token=${pageToken}`, { method: "DELETE" });
    } catch (e: any) {
      console.warn("Facebook video delete notice:", e.message);
    }
  }

  // 2. Delete explicitly tracked Story
  if (extra?.storyId) {
    try {
      await fetch(`https://graph.facebook.com/v26.0/${extra.storyId}?access_token=${pageToken}`, { method: "DELETE" });
    } catch {}
  }

  // 3. Delete explicitly tracked Feed Post
  if (extra?.feedPostId) {
    try {
      await fetch(`https://graph.facebook.com/v26.0/${extra.feedPostId}?access_token=${pageToken}`, { method: "DELETE" });
    } catch {}
  }

  // 4. Scan Page Feed to delete any post referencing this reel or title
  try {
    const feedRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/feed?limit=25&access_token=${pageToken}`);
    if (feedRes.ok) {
      const feedData = await feedRes.json();
      for (const post of (feedData.data || [])) {
        const msg = String(post.message || "");
        const matchesVideo = videoId && (post.id?.includes(videoId) || msg.includes(videoId));
        const matchesTitle = extra?.title && extra.title.length > 5 && msg.includes(extra.title.slice(0, 30));
        if (matchesVideo || matchesTitle) {
          await fetch(`https://graph.facebook.com/v26.0/${post.id}?access_token=${pageToken}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }
  } catch (feedErr: any) {
    console.warn("Facebook feed cleanup notice:", feedErr.message);
  }

  // 5. Scan Page Stories and clean up matching story
  try {
    const storiesRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/stories?access_token=${pageToken}`);
    if (storiesRes.ok) {
      const storiesData = await storiesRes.json();
      for (const story of (storiesData.data || [])) {
        if (story.id && (story.id === extra?.storyId || (videoId && story.id.includes(videoId)))) {
          await fetch(`https://graph.facebook.com/v26.0/${story.id}?access_token=${pageToken}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }
  } catch (storyErr: any) {
    console.warn("Facebook story cleanup notice:", storyErr.message);
  }

  return { success: true };
}

// ─── Delete from Instagram (Reel, Feed Post, and Story) ──────────────────────
export async function deleteFromInstagram(
  instagramVideoId?: string,
  extra?: { storyId?: string; title?: string }
) {
  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();
  const igToken =
    tokens?.instagram?.access_token ||
    tokens?.facebook?.instagram_access_token ||
    tokens?.facebook?.instagram_page_access_token ||
    tokens?.facebook?.page_access_token;
  const igUserId = tokens?.instagram?.user_id || tokens?.facebook?.instagram_user_id;

  if (!igToken) {
    throw new Error("Instagram is not connected. Reconnect Instagram in Settings.");
  }

  const idsToDelete = new Set<string>();
  if (instagramVideoId) idsToDelete.add(instagramVideoId);
  if (extra?.storyId) idsToDelete.add(extra.storyId);

  // 1. Direct deletion of known IDs
  for (const id of Array.from(idsToDelete)) {
    try {
      let delRes = await fetch(`https://graph.facebook.com/v26.0/${id}?access_token=${igToken}`, { method: "DELETE" });
      let delData = await delRes.json().catch(() => ({}));
      if (delData?.error && delData.error.code !== 100) {
        await fetch(`https://graph.instagram.com/v26.0/${id}?access_token=${igToken}`, { method: "DELETE" }).catch(() => {});
      }
    } catch (e: any) {
      console.warn(`Instagram delete error for ${id}:`, e.message);
    }
  }

  // 2. Scan Instagram account's recent media (Reels & Feed posts)
  if (igUserId) {
    try {
      const mediaRes = await fetch(`https://graph.facebook.com/v26.0/${igUserId}/media?limit=25&fields=id,caption,media_type&access_token=${igToken}`);
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        for (const item of (mediaData.data || [])) {
          const cap = String(item.caption || "");
          const matchesId = instagramVideoId && item.id === instagramVideoId;
          const matchesTitle = extra?.title && extra.title.length > 5 && cap.includes(extra.title.slice(0, 30));
          if (matchesId || matchesTitle) {
            await fetch(`https://graph.facebook.com/v26.0/${item.id}?access_token=${igToken}`, { method: "DELETE" }).catch(() => {});
            await fetch(`https://graph.instagram.com/v26.0/${item.id}?access_token=${igToken}`, { method: "DELETE" }).catch(() => {});
          }
        }
      }
    } catch (mErr: any) {
      console.warn("Instagram media scan notice:", mErr.message);
    }

    // 3. Scan Instagram Stories
    try {
      const storyRes = await fetch(`https://graph.facebook.com/v26.0/${igUserId}/stories?access_token=${igToken}`);
      if (storyRes.ok) {
        const storyData = await storyRes.json();
        for (const s of (storyData.data || [])) {
          if (s.id && (idsToDelete.has(s.id) || (instagramVideoId && s.id === instagramVideoId))) {
            await fetch(`https://graph.facebook.com/v26.0/${s.id}?access_token=${igToken}`, { method: "DELETE" }).catch(() => {});
          }
        }
      }
    } catch (sErr: any) {
      console.warn("Instagram story scan notice:", sErr.message);
    }
  }

  return { success: true };
}
