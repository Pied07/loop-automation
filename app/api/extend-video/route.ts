import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Validate required fields
    if (!data.videoId || !data.userId || !data.originalVideoUrl) {
      return NextResponse.json({ success: false, error: "Missing required video data" }, { status: 400 });
    }

    // Trigger Inngest background job
    const { ids } = await inngest.send({
      name: "video/extend",
      data: {
        videoId: data.videoId,
        userId: data.userId,
        idToken: data.idToken,
        extendBySeconds: data.extendBySeconds || 15,
        originalPrompt: data.originalPrompt,
        originalCaptions: data.originalCaptions,
        format: data.format,
        imageStyle: data.imageStyle || "Realistic",
        ttsLanguage: data.ttsLanguage || "en-US",
        captionStyle: data.captionStyle || "Modern",
        voiceType: data.voiceType || "Adam",
        originalVideoUrl: data.originalVideoUrl
      }
    });

    return NextResponse.json({ success: true, eventId: ids?.[0], message: "Extension job queued" });
  } catch (error: any) {
    console.error("Extend API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
