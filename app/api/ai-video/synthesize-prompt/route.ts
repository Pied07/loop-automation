import { NextRequest, NextResponse } from "next/server";
import { synthesizeScenePrompt } from "@/app/lib/prompt-synthesizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ success: false, error: "Text is required to synthesize prompt" }, { status: 400 });
    }

    const stylePreset = typeof body.style === "string" ? body.style : "Cinematic Film";
    const aspectRatio = typeof body.aspect === "string" ? body.aspect : "9:16 (Shorts / Reels)";
    const category = typeof body.category === "string" ? body.category : "Custom";

    const synthesizedPrompt = synthesizeScenePrompt(text, {
      stylePreset,
      aspectRatio,
      category,
    });

    return NextResponse.json({
      success: true,
      originalText: text,
      synthesizedPrompt,
      style: stylePreset,
      aspect: aspectRatio,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to synthesize prompt" },
      { status: 500 }
    );
  }
}
