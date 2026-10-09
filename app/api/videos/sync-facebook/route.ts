import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/app/lib/tokens";
import { database } from "@/app/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId;
    const tokens: any = await readTokens().catch(() => ({}));

    const pageId = tokens?.facebook?.page_id;
    const pageToken = tokens?.facebook?.page_access_token;
    if (!pageId || !pageToken) {
      return NextResponse.json({ success: false, error: "Facebook Page is not connected." }, { status: 400 });
    }

    // Fetch all published videos and reels using pagination cursors
    const allItemsMap = new Map<string, any>();
    let nextVideosUrl: string | null = `https://graph.facebook.com/v26.0/${pageId}/videos?fields=id,title,description,created_time,thumbnails,permalink_url&limit=50&access_token=${pageToken}`;

    let videoPages = 0;
    while (nextVideosUrl && videoPages < 6) {
      videoPages++;
      try {
        const res: Response = await fetch(nextVideosUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!res.ok) break;
        const data: any = await res.json();
        for (const item of (data.data || [])) {
          if (item?.id) allItemsMap.set(item.id, item);
        }
        nextVideosUrl = data?.paging?.next || null;
      } catch {
        break;
      }
    }



    const items = Array.from(allItemsMap.values());
    const syncedVideos: VideoRecord[] = [];
    const knownFormats = ["Trending", "Horror", "Historical", "Motivational", "Sci-Fi", "Mystery", "Philosophy", "Adventure", "Romance", "Anime", "ASMR", "Music", "Food"];

    for (const item of items) {
      if (!item.id) continue;
      const title = item.title || item.description?.split("\n")[0]?.slice(0, 70) || "Viral Clip";
      const desc = item.description || "";
      // Discard teaser posts or click-to-watch links
      if (/tap to watch/i.test(title) || /tap to watch/i.test(desc) || /^https?:\/\//i.test(title) || /facebook\.com\/reel\//i.test(title)) {
        continue;
      }
      const prefix = title.match(/^([^:]{2,24}):/)?.[1]?.trim();
      const format = knownFormats.find((k) => k.toLowerCase() === (prefix || "").toLowerCase()) || "Trending";
      const thumb = item.thumbnails?.data?.[0]?.uri || `/api/viral-clips/thumbnail?facebookId=${item.id}`;

      const record: VideoRecord = {
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
        format,
        createdAt: item.created_time ? item.created_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
        status: "completed",
      };

      syncedVideos.push(record);

      // Persist directly into Firestore if userId provided and database initialized
      if (userId && database) {
        try {
          const { id, ...data } = record;
          await setDoc(doc(database, "users", userId, "videos", id), data, { merge: true });
        } catch (dbErr) {
          console.warn("Could not save to Firestore:", dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: syncedVideos.length,
      videos: syncedVideos,
    });
  } catch (err: any) {
    console.error("Facebook sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
