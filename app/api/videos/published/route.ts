import { NextResponse } from "next/server";
import { readTokens } from "@/app/lib/tokens";
import type { VideoRecord } from "@/app/firebase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ensureRelevantHashtags(tags?: string[], context?: string): string[] {
  const existing = Array.isArray(tags) ? tags.map((t) => `#${t.replace(/^#/, "")}`) : [];
  if (existing.length >= 5) return existing.slice(0, 10);
  const words = (context || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  const fallbacks = ["viral", "trending", "shorts", "reels", "fyp", "story", "explore", "creator"];
  const combined = Array.from(new Set([...existing, ...words.filter((w) => w.length > 4).map((w) => `#${w}`), ...fallbacks.map((f) => `#${f}`)]));
  return combined.slice(0, 10);
}

export async function GET() {
  try {
    const tokens: any = await readTokens().catch(() => ({}));
    const recoveredVideos: VideoRecord[] = [];
    const knownFormats = ["Trending", "Horror", "Historical", "Motivational", "Sci-Fi", "Mystery", "Philosophy", "Adventure", "Romance", "Anime", "ASMR", "Music", "Food"];

    // 1. YouTube uploads
    if (tokens?.youtube?.access_token || tokens?.youtube?.refresh_token) {
      try {
        const { google } = require("googleapis");
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.youtube);
        const youtube = google.youtube({ version: "v3", auth: oauth2Client });
        const channels = await youtube.channels.list({ part: ["contentDetails"], mine: true });
        const uploadsId = channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (uploadsId) {
          const uploads = await youtube.playlistItems.list({
            part: ["snippet", "contentDetails"],
            playlistId: uploadsId,
            maxResults: 50,
          });
          const items = uploads.data.items || [];
          const videoIds = items.map((item: any) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter(Boolean);
          let snippetsById = new Map<string, any>();
          if (videoIds.length) {
            try {
              const metadata = await youtube.videos.list({ part: ["snippet"], id: videoIds.join(",") });
              snippetsById = new Map((metadata.data.items || []).map((v: any) => [v.id, v.snippet]));
            } catch {}
          }
          for (const item of items) {
            const snippet = item.snippet;
            const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
            if (!videoId) continue;
            const details = snippetsById.get(videoId) || snippet;
            const title = String(details.title || snippet?.title || "YouTube Short");
            const prefix = title.match(/^([^:]{2,24}):/)?.[1]?.trim();
            const format = knownFormats.find((k) => k.toLowerCase() === (prefix || "").toLowerCase()) || "Trending";
            recoveredVideos.push({
              id: `youtube-${videoId}`,
              title,
              description: details.description || "Recovered from your YouTube uploads.",
              captions: "",
              hashtags: ensureRelevantHashtags(details.tags, `${title} ${details.description || ""}`),
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              youtubeVideoId: videoId,
              youtube: 1,
              thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              format,
              createdAt: details.publishedAt ? new Date(details.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
              status: "completed",
            });
          }
        }
      } catch (ytErr: any) {
        console.warn("Could not recover YouTube videos:", ytErr?.message);
      }
    }

    // 2. Facebook Page Reels & Videos
    const pageId = tokens?.facebook?.page_id;
    const pageToken = tokens?.facebook?.page_access_token;
    if (pageId && pageToken) {
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v26.0/${pageId}/videos?fields=id,title,description,created_time,thumbnails,permalink_url&limit=50&access_token=${pageToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          for (const item of fbData.data || []) {
            const title = item.title || item.description?.split("\n")[0]?.slice(0, 70) || "Facebook Reel";
            const thumb = item.thumbnails?.data?.[0]?.uri || `/api/viral-clips/thumbnail?facebookId=${item.id}`;
            recoveredVideos.push({
              id: `facebook-${item.id}`,
              title,
              description: item.description || "",
              captions: "",
              hashtags: ensureRelevantHashtags([], `${title} ${item.description || ""}`),
              videoUrl: item.permalink_url || `https://www.facebook.com/reel/${item.id}`,
              facebookVideoId: item.id,
              facebook: 1,
              instagram: 1, // Meta Page Reels cross-post to Instagram
              thumbnailUrl: thumb,
              format: "Trending",
              createdAt: item.created_time ? item.created_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
              status: "completed",
            });
          }
        }
      } catch (fbErr: any) {
        console.warn("Could not recover Facebook videos:", fbErr?.message);
      }
    }

    // 3. Instagram Reels
    const igUserId = tokens?.instagram?.user_id || tokens?.facebook?.instagram_user_id;
    const igToken = tokens?.instagram?.access_token || tokens?.facebook?.instagram_page_access_token || pageToken;
    if (igUserId && igToken) {
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v26.0/${igUserId}/media?fields=id,caption,media_type,permalink,timestamp,thumbnail_url,media_url&limit=50&access_token=${igToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          for (const item of igData.data || []) {
            const title = item.caption?.split("\n")[0]?.slice(0, 70) || "Instagram Reel";
            recoveredVideos.push({
              id: `instagram-${item.id}`,
              title,
              description: item.caption || "",
              captions: "",
              hashtags: ensureRelevantHashtags([], `${title} ${item.caption || ""}`),
              videoUrl: item.permalink || `https://www.instagram.com/reel/${item.id}`,
              instagramVideoId: item.id,
              instagram: 1,
              thumbnailUrl: item.thumbnail_url || item.media_url,
              format: "Trending",
              createdAt: item.timestamp ? item.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10),
              status: "completed",
            });
          }
        }
      } catch (igErr: any) {
        console.warn("Could not recover Instagram videos:", igErr?.message);
      }
    }

    return NextResponse.json({ success: true, count: recoveredVideos.length, videos: recoveredVideos });
  } catch (err: any) {
    console.error("Recover published videos error:", err);
    return NextResponse.json({ success: false, videos: [] }, { status: 500 });
  }
}
