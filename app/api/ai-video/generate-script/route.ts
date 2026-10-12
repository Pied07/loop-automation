import { NextRequest, NextResponse } from "next/server";
import { generateStoryParts } from "@/app/lib/story-engine";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === "string" ? body.category.trim() : "Interesting Facts";
    const customTag = typeof body.customTag === "string" ? body.customTag.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const duration = body.duration ? Math.max(10, Math.min(120, Number(body.duration))) : 20;
    const numImages = body.numImages ? Math.max(1, Math.min(5, Number(body.numImages))) : 3;
    const numParts = body.numParts ? Math.max(1, Math.min(5, Number(body.numParts))) : 1;
    const excludeId = typeof body.excludeId === "string" ? body.excludeId.trim() : "";

    const result = await generateStoryParts({
      category,
      customTag,
      prompt,
      duration,
      numImages,
      numParts,
      excludeId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("AI Script generation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate script" },
      { status: 500 }
    );
  }
}
