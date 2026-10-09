import { NextRequest, NextResponse } from "next/server";
import { publishClipAndCleanup } from "@/app/viral-actions";
import { readTokens } from "@/app/lib/tokens";
import { database } from "@/app/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipPath, partNumber, totalParts, title, description, hashtags, userEmail, cloudinaryPublicId } = body;

    if (!clipPath) {
      return NextResponse.json({ error: "Clip path is required." }, { status: 400 });
    }

    const tokens: any = await readTokens();
    const serverPlatforms: string[] = [];
    if (tokens.youtube?.access_token || tokens.youtube?.refresh_token) serverPlatforms.push("YouTube");
    if (tokens.facebook?.page_id && tokens.facebook?.page_access_token) serverPlatforms.push("Facebook");
    if (tokens.facebook?.instagram_user_id || tokens.instagram?.access_token) serverPlatforms.push("Instagram");

    const requestedPlatforms = Array.isArray(body.platforms) ? body.platforms : [];
    const detectedPlatforms = Array.from(new Set([...requestedPlatforms, ...serverPlatforms]));

    const serverConnections = [...detectedPlatforms, ...(tokens.gmail?.access_token || tokens.gmail?.refresh_token ? ["Gmail"] : [])];
    const detectedConnections = Array.from(new Set([...(Array.isArray(body.connections) ? body.connections : []), ...serverConnections]));

    if (!detectedPlatforms.length) {
      return NextResponse.json({ error: "No connected social platforms found to publish to." }, { status: 400 });
    }

    const result = await publishClipAndCleanup({
      clipPath,
      partNumber: Number(partNumber) || 1,
      totalParts: Number(totalParts) || 1,
      title: title || "Viral Clip",
      description: description || "",
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      platforms: detectedPlatforms,
      userEmail: userEmail || tokens.gmail?.email || "",
      connections: detectedConnections,
      cloudinaryPublicId,
    });

    if (result && (result.success || result.youtubeVideoId || result.facebookVideoId || result.instagramVideoId)) {
      try {
        let targetUserId = body.userId;
        if (!targetUserId || targetUserId === "auto-pilot" || targetUserId === "creator") {
          if (database) {
            try {
              const autoSnap = await getDoc(doc(database, "app_config", "auto_pilot"));
              if (autoSnap.exists() && autoSnap.data()?.ownerUserId) {
                targetUserId = autoSnap.data().ownerUserId;
              }
            } catch {}
          }
        }
        if (!targetUserId) targetUserId = "auto-pilot";

        const ytVal: 0 | 1 = (result.youtubeUrl || result.youtubeVideoId) ? 1 : 0;
        const fbVal: 0 | 1 = (result.facebookUrl || result.facebookVideoId) ? 1 : 0;
        const igVal: 0 | 1 = (result.instagramUrl || result.instagramVideoId) ? 1 : 0;

        const recordId = cloudinaryPublicId
          ? `clip-${cloudinaryPublicId}`
          : (result.youtubeVideoId ? `yt-${result.youtubeVideoId}` : (result.facebookVideoId ? `fb-${result.facebookVideoId}` : `clip-${partNumber}-${Date.now()}`));

        const record = {
          id: recordId,
          userId: targetUserId,
          title: title || "Viral Clip",
          description: description || "",
          hashtags: Array.isArray(hashtags) ? hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`) : [],
          format: body.category || body.contentCategory || "Trending",
          createdAt: new Date().toISOString(),
          status: "completed",
          youtube: ytVal,
          youtubeVideoId: result.youtubeVideoId || "",
          youtubeUrl: result.youtubeUrl || (result.youtubeVideoId ? `https://www.youtube.com/shorts/${result.youtubeVideoId}` : ""),
          facebook: fbVal,
          facebookVideoId: result.facebookVideoId || "",
          facebookUrl: result.facebookUrl || (result.facebookVideoId ? `https://www.facebook.com/reel/${result.facebookVideoId}` : ""),
          facebookStoryId: result.facebookStoryId || "",
          facebookPostId: result.facebookPostId || "",
          instagram: igVal,
          instagramVideoId: result.instagramVideoId || "",
          instagramUrl: result.instagramUrl || (result.instagramVideoId ? `https://www.instagram.com/reel/${result.instagramVideoId}` : ""),
          instagramStoryId: result.instagramStoryId || "",
          thumbnailUrl: result.thumbnailUrl || (result.youtubeVideoId ? `https://i.ytimg.com/vi/${result.youtubeVideoId}/hqdefault.jpg` : (result.facebookVideoId ? `/api/viral-clips/thumbnail?facebookId=${result.facebookVideoId}` : "")),
        };

        if (database) {
          await setDoc(doc(database, "videos", recordId), record, { merge: true });
        }
      } catch (saveErr: any) {
        console.warn("Auto-save published video notice:", saveErr.message);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Publish clip error:", err);
    return NextResponse.json({ error: err.message || "Failed to publish clip." }, { status: 500 });
  }
}
