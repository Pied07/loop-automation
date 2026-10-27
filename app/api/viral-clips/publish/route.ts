import { NextRequest, NextResponse } from "next/server";
import { publishClipAndCleanup } from "@/app/viral-actions";
import { readTokens } from "@/app/lib/tokens";
import { database } from "@/app/firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipPath, partNumber, totalParts, title, description, hashtags, userEmail, cloudinaryPublicId } = body;

    if (!clipPath) {
      return NextResponse.json({ error: "Clip path is required." }, { status: 400 });
    }

    const normalizePlatform = (name: string): string => {
      const s = String(name || "").trim().toLowerCase();
      if (s === "youtube") return "YouTube";
      if (s === "facebook") return "Facebook";
      if (s === "instagram") return "Instagram";
      if (s === "gmail") return "Gmail";
      return String(name || "").trim();
    };

    const tokens: any = await readTokens();
    const serverPlatforms: string[] = [];
    if (tokens.youtube?.access_token || tokens.youtube?.refresh_token) serverPlatforms.push("YouTube");
    if (tokens.facebook?.page_id && tokens.facebook?.page_access_token) serverPlatforms.push("Facebook");
    if (tokens.facebook?.instagram_user_id || tokens.instagram?.access_token) serverPlatforms.push("Instagram");

    const requestedPlatforms = (Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : [])
      .map(normalizePlatform)
      .filter(Boolean);

    const detectedPlatforms = requestedPlatforms.length > 0
      ? requestedPlatforms.filter((p: string) => serverPlatforms.includes(p))
      : serverPlatforms;

    const serverConnections = [...serverPlatforms, ...(tokens.gmail?.access_token || tokens.gmail?.refresh_token ? ["Gmail"] : [])];
    const incomingConnections = (Array.isArray(body.connections) ? body.connections : []).map(normalizePlatform);
    const detectedConnections = Array.from(new Set([...incomingConnections, ...serverConnections]));

    if (!detectedPlatforms.length) {
      const missingName = requestedPlatforms.length > 0 ? requestedPlatforms.join(", ") : "social platform";
      return NextResponse.json({ error: `Selected platform (${missingName}) is not connected in Settings.` }, { status: 400 });
    }

    let effectiveEmail = userEmail || tokens.gmail?.email || "";
    if (!effectiveEmail && tokens.gmail?.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokens.gmail.id_token.split('.')[1], 'base64').toString());
        if (payload?.email) effectiveEmail = payload.email;
      } catch {}
    }
    if (!effectiveEmail && database) {
      try {
        const autoSnap = await getDoc(doc(database, "app_config", "auto_pilot"));
        if (autoSnap.exists() && autoSnap.data()?.ownerEmail) {
          effectiveEmail = autoSnap.data().ownerEmail;
        }
      } catch {}
    }

    const result = await publishClipAndCleanup({
      clipPath,
      partNumber: Number(partNumber) || 1,
      totalParts: Number(totalParts) || 1,
      title: title || "Viral Clip",
      description: description || "",
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      platforms: detectedPlatforms,
      userEmail: effectiveEmail,
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

        const ytVal: 0 | 1 = (result.youtubeUrl || result.youtubeVideoId) ? 1 : (body.youtube === 1 ? 1 : 0);
        const fbVal: 0 | 1 = (result.facebookUrl || result.facebookVideoId) ? 1 : (body.facebook === 1 ? 1 : 0);
        const igVal: 0 | 1 = (result.instagramUrl || result.instagramVideoId) ? 1 : (body.instagram === 1 ? 1 : 0);

        // Use existing document ID if provided (prevents duplicate records), or generate platform ID
        const cleanDocId = result.youtubeVideoId
          ? `yt-${result.youtubeVideoId}`
          : (result.facebookVideoId
              ? `fb-${result.facebookVideoId}`
              : (result.instagramVideoId
                  ? `ig-${result.instagramVideoId}`
                  : `clip-${partNumber}-${Date.now()}`));

        const finalDocId = body.clipId || body.id || cleanDocId;

        const srcUrl = body.sourceUrl || body.sourceLink || "";
        const isCronJob = Boolean(body.isCron || targetUserId === "auto-pilot" || String(body.jobId || "").startsWith("cron-") || cleanDocId.includes("cron"));
        const isAi = Boolean(body.isAiVideo);
        const resolvedFormat = body.format || body.category || body.contentCategory || (isAi ? "AI Video" : "Viral");

        const record: any = {
          id: finalDocId,
          userId: targetUserId,
          title: title || "Viral Clip",
          description: description || "",
          hashtags: Array.isArray(hashtags) ? hashtags.map((h: string) => h.startsWith("#") ? h : `#${h}`) : [],
          format: resolvedFormat,
          isAiVideo: isAi,
          createdAt: body.createdAt || new Date().toISOString(),
          status: "completed",
          sourceUrl: srcUrl,
          sourceLink: srcUrl,
          videoUrl: body.videoUrl || body.clipPath || "",
          cloudinaryUrl: body.cloudinaryUrl || (body.clipPath?.includes("cloudinary") ? body.clipPath : ""),
          isCron: isCronJob,
          youtube: ytVal,
          youtubeVideoId: result.youtubeVideoId || body.youtubeVideoId || "",
          youtubeUrl: result.youtubeUrl || (result.youtubeVideoId ? `https://www.youtube.com/shorts/${result.youtubeVideoId}` : (body.youtubeUrl || "")),
          facebook: fbVal,
          facebookVideoId: result.facebookVideoId || body.facebookVideoId || "",
          facebookUrl: result.facebookUrl || (result.facebookVideoId ? `https://www.facebook.com/reel/${result.facebookVideoId}` : (body.facebookUrl || "")),
          facebookStoryId: result.facebookStoryId || body.facebookStoryId || "",
          facebookPostId: result.facebookPostId || body.facebookPostId || "",
          instagram: igVal,
          instagramVideoId: result.instagramVideoId || body.instagramVideoId || "",
          instagramUrl: result.instagramUrl || (result.instagramVideoId ? `https://www.instagram.com/reel/${result.instagramVideoId}` : (body.instagramUrl || "")),
          instagramStoryId: result.instagramStoryId || body.instagramStoryId || "",
          thumbnailUrl: result.thumbnailUrl || body.thumbnailUrl || (result.youtubeVideoId ? `https://i.ytimg.com/vi/${result.youtubeVideoId}/hqdefault.jpg` : (result.facebookVideoId ? `/api/viral-clips/thumbnail?facebookId=${result.facebookVideoId}` : "")),
        };
        if (body.duration) {
          record.duration = Number(body.duration);
        }

        if (database) {
          // Write to top-level 'videos' collection using finalDocId
          try {
            await setDoc(doc(database, "videos", finalDocId), record, { merge: true });
          } catch (e: any) {
            console.warn("Top-level videos save notice:", e.message);
          }
          // Also write to user subcollection so active realtime listeners update immediately
          try {
            await setDoc(doc(database, "users", targetUserId, "videos", finalDocId), record, { merge: true });
          } catch (e: any) {
            console.warn("User subcollection save notice:", e.message);
          }
          // If a separate cleanDocId was generated, delete it to ensure zero duplicate documents
          if (finalDocId !== cleanDocId) {
            deleteDoc(doc(database, "videos", cleanDocId)).catch(() => {});
            deleteDoc(doc(database, "users", targetUserId, "videos", cleanDocId)).catch(() => {});
          }
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
