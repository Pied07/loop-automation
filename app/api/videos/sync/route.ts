import { NextRequest, NextResponse } from "next/server";
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

const KNOWN_FORMATS = ["Trending", "Horror", "Historical", "Motivational", "Sci-Fi", "Mystery", "Philosophy", "Adventure", "Romance", "Anime", "ASMR", "Music", "Food", "Comedy", "Educational"];

function detectFormat(text?: string): string {
  if (!text) return "Trending";
  const prefix = text.match(/^([^:]{2,24}):/)?.[1]?.trim();
  if (prefix) {
    const match = KNOWN_FORMATS.find((k) => k.toLowerCase() === prefix.toLowerCase());
    if (match) return match;
  }
  for (const k of KNOWN_FORMATS) {
    if (new RegExp(`\\b${k}\\b`, "i").test(text)) return k;
  }
  return "Trending";
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(_req: NextRequest) {
  try {
    const tokens: any = await readTokens().catch(() => ({}));
    const syncedVideos: VideoRecord[] = [];

    // ── 1. Fetch published Facebook Reels & Videos ──
    const pageId = tokens?.facebook?.page_id;
    const pageToken = tokens?.facebook?.page_access_token;

    if (pageId && pageToken) {
      try {
        let nextUrl: string | null = `https://graph.facebook.com/v26.0/${pageId}/videos?fields=id,title,description,created_time,thumbnails,permalink_url&limit=50&access_token=${pageToken}`;
        let pageCount = 0;

        while (nextUrl && pageCount < 4) {
          pageCount++;
          const res = await fetch(nextUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!res.ok) break;
          const data: any = await res.json();
          for (const item of (data.data || [])) {
            if (!item?.id) continue;
            const title = item.title || item.description?.split("\n")[0]?.slice(0, 70) || "Viral Clip";
            const desc = item.description || "";
            // Discard teaser posts
            if (/tap to watch/i.test(title) || /tap to watch/i.test(desc) || /^https?:\/\//i.test(title) || /facebook\.com\/reel\//i.test(title)) {
              continue;
            }
            const thumb = item.thumbnails?.data?.[0]?.uri || `/api/viral-clips/thumbnail?facebookId=${item.id}`;

            syncedVideos.push({
              id: `fb-${item.id}`,
              title,
              description: desc,
              captions: "",
              hashtags: ensureRelevantHashtags([], `${title} ${desc}`),
              videoUrl: item.permalink_url || `https://www.facebook.com/reel/${item.id}`,
              facebookVideoId: item.id,
              facebook: 1,
              instagram: 1, // Meta Page cross-posts reels to Instagram
              thumbnailUrl: thumb,
              format: detectFormat(`${title} ${desc}`),
              createdAt: item.created_time || new Date().toISOString(),
              status: "completed",
            });
          }
          nextUrl = data?.paging?.next || null;
        }
      } catch (fbErr: any) {
        console.warn("Facebook sync notice:", fbErr.message);
      }
    }

    // ── 2. Fetch published YouTube Shorts & Videos ──
    if (tokens?.youtube?.refresh_token || tokens?.youtube?.access_token) {
      try {
        const { google } = require("googleapis");
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.youtube);
        const youtube = google.youtube({ version: "v3", auth: oauth2Client });

        const channelRes = await youtube.channels.list({ part: ["contentDetails"], mine: true });
        const uploadPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

        if (uploadPlaylistId) {
          const playlistRes = await youtube.playlistItems.list({
            part: ["snippet"],
            playlistId: uploadPlaylistId,
            maxResults: 50,
          });

          for (const item of (playlistRes.data.items || [])) {
            const vidId = item.snippet?.resourceId?.videoId;
            if (!vidId) continue;
            const title = item.snippet.title || "YouTube Short";
            const desc = item.snippet.description || "";
            const thumb =
              item.snippet.thumbnails?.maxres?.url ||
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;

            syncedVideos.push({
              id: `yt-${vidId}`,
              title,
              description: desc,
              captions: "",
              hashtags: ensureRelevantHashtags([], `${title} ${desc}`),
              videoUrl: `https://www.youtube.com/shorts/${vidId}`,
              youtubeVideoId: vidId,
              youtube: 1,
              facebook: 0,
              instagram: 0,
              thumbnailUrl: thumb,
              format: detectFormat(`${title} ${desc}`),
              createdAt: item.snippet.publishedAt || new Date().toISOString(),
              status: "completed",
            });
          }
        }
      } catch (ytErr: any) {
        console.warn("YouTube sync notice:", ytErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      count: syncedVideos.length,
      videos: syncedVideos,
    });
  } catch (err: any) {
    console.error("Videos sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
