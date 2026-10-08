import { NextRequest, NextResponse } from "next/server";
import { publishClipAndCleanup } from "@/app/viral-actions";
import { readTokens } from "@/app/lib/tokens";

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

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Publish clip error:", err);
    return NextResponse.json({ error: err.message || "Failed to publish clip." }, { status: 500 });
  }
}
