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

    // 1. Check if GitHub Actions Cloud Runner is configured (100% free, 2000 mins/mo, preinstalled FFmpeg)
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";

    if (githubPat) {
      const jobId = `job_${Date.now()}`;
      const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/split-video.yml/dispatches`;

      const ghRes = await fetch(dispatchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "The-Viral-Desk-App",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            videoUrl,
            contentCategory: contentCategory || "Trending",
            jobId,
            userId: body.userId || "creator",
            firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
            firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
            firebaseStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
          },
        }),
      });

      if (!ghRes.ok) {
        const ghErr = await ghRes.text();
        return NextResponse.json({ error: `Failed to trigger GitHub cloud runner: ${ghErr}` }, { status: ghRes.status });
      }

      return NextResponse.json({
        success: true,
        cloudMode: "github",
        jobId,
        message: "Cloud video processor started on GitHub Actions!",
      });
    }

    // 2. Check if Hugging Face Cloud Worker is configured
    const workerUrl = process.env.HUGGINGFACE_WORKER_URL;
    if (workerUrl) {
      let cleanWorkerUrl = workerUrl.replace(/\/$/, "");
      // Auto-convert browser URL (https://huggingface.co/spaces/owner/space) to Direct API (https://owner-space.hf.space)
      const hfWebMatch = cleanWorkerUrl.match(/huggingface\.co\/spaces\/([^/]+)\/([^/]+)/);
      if (hfWebMatch) {
        cleanWorkerUrl = `https://${hfWebMatch[1].toLowerCase()}-${hfWebMatch[2].toLowerCase()}.hf.space`;
      }

      const workerRes = await fetch(`${cleanWorkerUrl}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, contentCategory }),
      });

      const resText = await workerRes.text();
      let workerData: any;
      try {
        workerData = JSON.parse(resText);
      } catch {
        if (resText.includes("<!DOCTYPE") || resText.includes("<html")) {
          return NextResponse.json(
            {
              error:
                "Cloud worker returned a webpage instead of API JSON. In your Hugging Face Space README.md, change 'sdk: static' to 'sdk: gradio' so Hugging Face starts Python instead of a static webpage.",
            },
            { status: 502 }
          );
        }
        return NextResponse.json(
          { error: `Cloud worker returned invalid response: ${resText.slice(0, 150)}` },
          { status: 502 }
        );
      }

      if (!workerRes.ok || !workerData.success) {
        return NextResponse.json(
          { error: workerData.detail || workerData.error || "Hugging Face worker failed to process video." },
          { status: 400 }
        );
      }

      const clipsWithMeta = await Promise.all(
        workerData.clips.map(async (clip: any, index: number) => {
          const meta = await generateClipMetadata({
            partNumber: index + 1,
            totalParts: workerData.clips.length,
            sourceTitle: workerData.sourceTitle,
            totalDuration: workerData.totalDuration,
            contentCategory: contentCategory || "viral",
            clipDuration: clip.duration,
          });
          return {
            partNumber: index + 1,
            title: workerData.clips.length === 1 ? workerData.sourceTitle : `PART ${index + 1} | ${workerData.sourceTitle.slice(0, 45)}`,
            description: meta.description,
            hashtags: meta.hashtags,
            duration: clip.duration,
            startTime: clip.startTime,
            clipPath: clip.url, // Full HTTPS URL hosted on Hugging Face
            publicUrl: clip.url,
            cloudFilename: clip.filename,
          };
        })
      );

      return NextResponse.json({
        success: true,
        sourceTitle: workerData.sourceTitle,
        totalDuration: workerData.totalDuration,
        clips: clipsWithMeta,
      });
    }

    // 2. Fallback: Local processing (when running on localhost)
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
