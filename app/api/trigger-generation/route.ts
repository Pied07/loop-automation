import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    data.videoDuration = Math.max(1, Math.min(60, Math.floor(Number(data.videoDuration) || 15)));
    data.numImages = Math.max(1, Math.min(10, Math.floor(Number(data.numImages) || 3)));
    if (typeof data.prompt !== "string" || !data.prompt.trim()) {
      return NextResponse.json({ success: false, error: "Enter a prompt before generating a video." }, { status: 400 });
    }
    if (data.script && (!Array.isArray(data.script.scenes) || data.script.scenes.length !== data.numImages || data.script.scenes.some((scene: { caption?: unknown; imagePrompt?: unknown } | null) => !scene || typeof scene.caption !== "string" || typeof scene.imagePrompt !== "string"))) {
      return NextResponse.json({ success: false, error: "The generated script does not match the selected image count." }, { status: 400 });
    }
    
    // Dispatch the event to Inngest
    const { ids } = await inngest.send({
      name: "video/generate",
      data: data,
    });

    return NextResponse.json({ success: true, eventId: ids?.[0], message: "Job started" });
  } catch (error: unknown) {
    console.error("Failed to dispatch to Inngest:", error);
    const message = error instanceof Error ? error.message : "Failed to start video generation.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
