import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/app/lib/tokens";
import { database } from "@/app/firebase";
import { doc, setDoc } from "firebase/firestore";
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

const KNOWN_FORMATS = [
  "Trending", "Horror", "Historical", "Motivational", "Sci-Fi", "Mystery",
  "Philosophy", "Adventure", "Romance", "Anime", "ASMR", "Music", "Food", "Comedy", "Educational"
];

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

async function handleSync(req: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const body = await req.json();
      userId = body?.userId;
    } catch {}
    if (!userId) {
      const url = new URL(req.url);
      userId = url.searchParams.get("userId") || undefined;
    }

    const tokens: any = await readTokens().catch(() => ({}));
    const rawList: VideoRecord[] = [];

    // ── 1. Fetch published Instagram Reels & Media ──
    const igToken =
      tokens.instagram?.access_token ||
      tokens.facebook?.instagram_access_token ||
      tokens.facebook?.instagram_page_access_token ||
      tokens.facebook?.page_access_token;
    const igUserId = tokens.instagram?.user_id || tokens.facebook?.instagram_user_id || "17841424354654362";

    if (igToken && igUserId) {
      try {
        let nextIgUrl: string | null = `https://graph.facebook.com/v26.0/${igUserId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp&limit=50&access_token=${igToken}`;
        let igPages = 0;
        while (nextIgUrl && igPages < 3) {
          igPages++;
          const igRes = await fetch(nextIgUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
          if (!igRes.ok) break;
          const igData: any = await igRes.json();
          for (const item of (igData.data || [])) {
            if (!item?.id) continue;
            const caption = item.caption || "";
            const title = caption.split("\n")[0]?.slice(0, 75) || "Instagram Reel";
            const permalink = item.permalink || `https://www.instagram.com/reel/${item.id}`;
            rawList.push({
              id: `ig-${item.id}`,
              title,
              description: caption,
              captions: "",
              hashtags: ensureRelevantHashtags([], caption),
              videoUrl: permalink,
              instagramVideoId: item.id,
              instagram: 1,
              youtube: 0,
              facebook: 0,
              thumbnailUrl: item.thumbnail_url,
              format: detectFormat(caption),
              createdAt: item.timestamp || new Date().toISOString(),
              status: "completed",
            });
          }
          nextIgUrl = igData?.paging?.next || null;
        }
      } catch (igErr: any) {
        console.warn("Instagram sync notice:", igErr.message);
      }
    }

    // ── 2. Fetch published Facebook Reels & Videos ──
    const fbPageId = tokens?.facebook?.page_id;
    const fbToken = tokens?.facebook?.page_access_token;

    if (fbPageId && fbToken) {
      try {
        let nextFbUrl: string | null = `https://graph.facebook.com/v26.0/${fbPageId}/videos?fields=id,title,description,created_time,thumbnails,permalink_url&limit=50&access_token=${fbToken}`;
        let fbPages = 0;
        while (nextFbUrl && fbPages < 4) {
          fbPages++;
          const fbRes = await fetch(nextFbUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
          if (!fbRes.ok) break;
          const fbData: any = await fbRes.json();
          for (const item of (fbData.data || [])) {
            if (!item?.id) continue;
            const title = item.title || item.description?.split("\n")[0]?.slice(0, 75) || "Facebook Reel";
            const desc = item.description || "";
            if (/tap to watch/i.test(title) || /tap to watch/i.test(desc) || /^https?:\/\//i.test(title)) {
              continue;
            }
            const thumb = item.thumbnails?.data?.[0]?.uri || `/api/viral-clips/thumbnail?facebookId=${item.id}`;
            const permalink = item.permalink_url?.startsWith("http") ? item.permalink_url : `https://www.facebook.com/reel/${item.id}`;
            rawList.push({
              id: `fb-${item.id}`,
              title,
              description: desc,
              captions: "",
              hashtags: ensureRelevantHashtags([], `${title} ${desc}`),
              videoUrl: permalink,
              facebookVideoId: item.id,
              facebook: 1,
              instagram: 0,
              youtube: 0,
              thumbnailUrl: thumb,
              format: detectFormat(`${title} ${desc}`),
              createdAt: item.created_time || new Date().toISOString(),
              status: "completed",
            });
          }
          nextFbUrl = fbData?.paging?.next || null;
        }
      } catch (fbErr: any) {
        console.warn("Facebook sync notice:", fbErr.message);
      }
    }

    // ── 3. Fetch published YouTube Shorts & Videos ──
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

            rawList.push({
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
      count: rawList.length,
      videos: rawList,
    });
  } catch (err: any) {
    console.error("Videos sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
