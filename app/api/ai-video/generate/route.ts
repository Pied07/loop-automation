import { NextRequest, NextResponse } from "next/server";
import { generateAiVideoAction } from "@/app/viral-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === "string" ? body.category.trim() : "Interesting Facts";
    const customTag = typeof body.customTag === "string" ? body.customTag.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const script = typeof body.script === "string" ? body.script.trim() : "";
    const voice = typeof body.voice === "string" ? body.voice.trim() : "en-US-ChristopherNeural";
    const numImages = typeof body.numImages === "number" ? body.numImages : 3;
    const duration = typeof body.duration === "number" ? body.duration : 20;
    const numParts = typeof body.numParts === "number" ? body.numParts : 1;
    const partNumber = typeof body.partNumber === "number" ? body.partNumber : 1;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "creator";
    const userEmail = typeof body.userEmail === "string" ? body.userEmail.trim() : "";
    const autoPublish = Boolean(body.autoPublish);
    const platforms = body.platforms || { youtube: false, facebook: false, instagram: false };
    const sceneImages = Array.isArray(body.sceneImages) ? body.sceneImages : [];
    const colabGpuUrl = typeof body.colabGpuUrl === "string" ? body.colabGpuUrl.trim() : "";
    const stylePreset = typeof body.stylePreset === "string" ? body.stylePreset.trim() : "Realism";
    const captionStyle = typeof body.captionStyle === "string" ? body.captionStyle.trim() : "viral_yellow";
    const animationStyle = typeof body.animationStyle === "string" ? body.animationStyle.trim() : "ken_burns";

    const result = await generateAiVideoAction({
      category,
      customTag,
      prompt,
      script,
      voice,
      numImages,
      duration,
      numParts,
      partNumber,
      userId,
      userEmail,
      autoPublish,
      platforms,
      sceneImages,
      colabGpuUrl,
      stylePreset,
      captionStyle,
      animationStyle,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("AI Video Generation API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate AI video." },
      { status: 500 }
    );
  }
}
