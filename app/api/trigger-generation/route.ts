import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.INNGEST_EVENT_KEY) {
      console.error("Video generation dispatch is unavailable: INNGEST_EVENT_KEY is not configured.");
      return NextResponse.json({
        success: false,
        error: "Background generation is not configured on this deployment. Connect the Inngest integration to this Vercel project, ensure INNGEST_EVENT_KEY is set for Production, then redeploy.",
      }, { status: 503 });
    }

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
    const detail = error instanceof Error ? error.message : "Unknown Inngest dispatch error";
    console.error("Failed to dispatch video generation to Inngest:", detail);
    return NextResponse.json({
      success: false,
      error: "Could not queue the video job. Check that the Inngest Vercel integration is connected, INNGEST_EVENT_KEY is set for Production, and this deployment is synced in Inngest.",
    }, { status: 502 });
  }
}
