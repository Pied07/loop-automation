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
    const detectedPlatforms = (Array.isArray(body.platforms) && body.platforms.length > 0)
      ? body.platforms
      : [
          ...(tokens.youtube ? ["YouTube"] : []),
          ...(tokens.facebook ? ["Facebook"] : []),
          ...(tokens.instagram ? ["Instagram"] : []),
        ];

    const detectedConnections = (Array.isArray(body.connections) && body.connections.length > 0)
      ? body.connections
      : [
          ...detectedPlatforms,
          ...(tokens.gmail ? ["Gmail"] : []),
        ];

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
