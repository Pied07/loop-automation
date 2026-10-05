import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { downloadAndSplitVideo, generateClipMetadata } from "@/app/viral-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { videoUrl, contentCategory } = body;

    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json({ error: "Video URL is required." }, { status: 400 });
    }

    // Ensure clips directory exists
    const clipsDir = path.join(process.cwd(), "public", "clips");
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

    // Download and split the video
    const splitResult = await downloadAndSplitVideo(videoUrl, clipsDir);
    if ("error" in splitResult) {
      return NextResponse.json({ error: splitResult.error }, { status: 400 });
    }

    const { clips, sourceTitle, totalDuration } = splitResult;

    // Generate metadata for each clip
    const clipsWithMeta = await Promise.all(
      clips.map(async (clip, index) => {
        const meta = await generateClipMetadata({
          partNumber: index + 1,
          totalParts: clips.length,
          sourceTitle,
          totalDuration,
          contentCategory: contentCategory || "viral",
          clipDuration: clip.duration,
        });
        return {
          ...clip,
          partNumber: index + 1,
          title: clips.length === 1 ? sourceTitle : `PART ${index + 1} | ${sourceTitle.slice(0, 45)}`,
          description: meta.description,
          hashtags: meta.hashtags,
          publicUrl: `/clips/${path.basename(clip.clipPath)}`,
        };
      })
    );

    return NextResponse.json({
      success: true,
      sourceTitle,
      totalDuration,
      clips: clipsWithMeta,
    });
  } catch (err: any) {
    console.error("Viral clips error:", err);
    return NextResponse.json({ error: err.message || "Failed to process video." }, { status: 500 });
  }
}
