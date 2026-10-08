import { NextRequest, NextResponse } from "next/server";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "path";
import { randomUUID } from "node:crypto";
import { downloadAndSplitVideo, generateClipMetadata, cleanViralTitle } from "@/app/viral-actions";
import { assertCloudinaryConfigured, deleteCloudinaryVideo, uploadVideoToCloudinary } from "@/app/cloudinary-upload";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ProcessingMode = "local" | "cloud" | "queue";

async function readJsonBody(req: NextRequest) {
  try {
    return await req.json() as { videoUrl?: unknown; contentCategory?: unknown; userId?: unknown; mode?: unknown; sourceTitle?: unknown };
  } catch {
    return null;
  }
}

function getProcessingMode(req: NextRequest, clientMode?: unknown): ProcessingMode {
  if (clientMode === "local" || clientMode === "cloud" || clientMode === "queue") {
    return clientMode;
  }

  const configuredMode = process.env.VIRAL_CLIPS_PROCESSOR?.toLowerCase();
  if (configuredMode === "local" || configuredMode === "cloud" || configuredMode === "queue") {
    return configuredMode;
  }

  const hostname = new URL(req.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "local";
  }

  return "cloud";
}

async function registerQueuedJob(req: NextRequest, params: { jobId: string; videoUrl: string; contentCategory: string }) {
  try {
    const queueUrl = new URL("/api/viral-clips/queue", req.url).toString();
    const response = await fetch(queueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, status: "pending" }),
    });
    if (!response.ok) {
      console.warn("Queue registration failed:", await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Queue registration error:", error);
    return false;
  }
}

async function updateJobStatus(req: NextRequest, data: Record<string, unknown>) {
  try {
    const statusUrl = new URL("/api/viral-clips/status", req.url).toString();
    await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.warn("Status update notice:", error);
  }
}

export async function POST(req: NextRequest) {
  const jobId = randomUUID();
  const clipsDir = path.join(tmpdir(), "viral-clips", jobId);
  const uploadedPublicIds: string[] = [];

  try {
    const body = await readJsonBody(req);
    if (!body) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const { videoUrl, contentCategory } = body;

    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json({ error: "Video URL is required." }, { status: 400 });
    }
    try {
      new URL(videoUrl);
    } catch {
      return NextResponse.json({ error: "Enter a valid video URL." }, { status: 400 });
    }

    const normalizedCategory = typeof contentCategory === "string" && contentCategory.trim() ? contentCategory.trim() : "Trending";
    const processingMode = getProcessingMode(req, body.mode);

    // Register job in worker queue so desktop worker or cloud runner can track it
    await registerQueuedJob(req, { jobId, videoUrl, contentCategory: normalizedCategory });

    if (processingMode === "queue") {
      await updateJobStatus(req, {
        jobId,
        status: "processing",
        progress: 12,
        step: "Queued for residential desktop worker...",
      });
      return NextResponse.json({
        success: true,
        cloudMode: "desktop-worker",
        jobId,
        message: "Video splitting job queued for the desktop worker.",
      });
    }

    // 1. Check if GitHub Actions Cloud Runner is configured (Ubuntu VM, preinstalled FFmpeg, 100% free)
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";

    if (githubPat && processingMode !== "local") {
      const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/split-video.yml/dispatches`;
      try {
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
              contentCategory: normalizedCategory,
              sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle : "",
              jobId,
              userId: typeof body.userId === "string" ? body.userId : "creator",
              cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
              cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
              cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
              appUrl: process.env.APP_URL || "https://the-viral-desk.vercel.app",
            },
          }),
        });

        if (ghRes.ok) {
          await updateJobStatus(req, {
            jobId,
            status: "processing",
            progress: 15,
            step: "Cloud video processor started on GitHub Actions...",
          });
          return NextResponse.json({
            success: true,
            cloudMode: "github",
            jobId,
            message: "Video splitting job queued for cloud processor!",
          });
        } else {
          console.warn("GitHub Actions dispatch non-ok:", await ghRes.text());
        }
      } catch (ghErr) {
        console.warn("GitHub dispatch notice:", ghErr);
      }
    }

    // 2. Direct / Local Processing (when running on localhost with FFmpeg installed)
    await updateJobStatus(req, {
      jobId,
      status: "processing",
      progress: 25,
      step: "Downloading video stream...",
    });

    assertCloudinaryConfigured();
    await mkdir(clipsDir, { recursive: true, mode: 0o700 });

    const splitResult = await downloadAndSplitVideo(videoUrl, clipsDir);
    if ("error" in splitResult) {
      await updateJobStatus(req, { jobId, status: "failed", error: splitResult.error });
      return NextResponse.json({ error: splitResult.error }, { status: 400 });
    }

    const { clips, sourceTitle, totalDuration } = splitResult;
    const cleanTitle = await cleanViralTitle(sourceTitle, normalizedCategory);

    await updateJobStatus(req, {
      jobId,
      status: "processing",
      progress: 60,
      step: "Cropping 9:16 vertical clips with FFmpeg & generating viral hooks...",
      sourceTitle: cleanTitle,
      totalDuration,
    });

    const clipsWithMetadata = await Promise.all(
      clips.map(async (clip, index) => {
        const meta = await generateClipMetadata({
          partNumber: index + 1,
          totalParts: clips.length,
          sourceTitle: cleanTitle,
          totalDuration,
          contentCategory: normalizedCategory,
          clipDuration: clip.duration,
        });

        return {
          clipPath: clip.clipPath,
          partNumber: index + 1,
          title: clips.length === 1 ? cleanTitle : `PART ${index + 1} | ${cleanTitle.slice(0, 45)}`,
          description: meta.description,
          hashtags: meta.hashtags,
          duration: clip.duration,
          startTime: clip.startTime,
        };
      })
    );

    await updateJobStatus(req, {
      jobId,
      status: "processing",
      progress: 85,
      step: "Uploading clips to Cloudinary cloud storage...",
      sourceTitle,
      totalDuration,
    });

    const clipsWithMeta: Array<{
      clipPath: string;
      publicUrl: string;
      partNumber: number;
      title: string;
      description: string;
      hashtags: string[];
      duration: number;
      startTime: number;
      storagePath: string;
      cloudinaryPublicId: string;
    }> = [];
    try {
      for (const clip of clipsWithMetadata) {
        const filename = path.basename(clip.clipPath);
        const publicId = `viral_clips/${jobId}/${path.parse(filename).name}`;
        uploadedPublicIds.push(publicId);
        const uploaded = await uploadVideoToCloudinary(clip.clipPath, publicId);
        clipsWithMeta.push({
          ...clip,
          clipPath: uploaded.secureUrl,
          publicUrl: uploaded.secureUrl,
          storagePath: uploaded.publicId,
          cloudinaryPublicId: uploaded.publicId,
        });
      }
    } catch (uploadError) {
      await Promise.all(uploadedPublicIds.map(deleteCloudinaryVideo));
      throw uploadError;
    }

    await updateJobStatus(req, {
      jobId,
      status: "done",
      progress: 100,
      step: `✅ All ${clipsWithMeta.length} clips ready in cloud storage!`,
      sourceTitle,
      totalDuration,
      clips: clipsWithMeta,
    });

    return NextResponse.json({
      success: true,
      jobId,
      sourceTitle,
      totalDuration,
      clips: clipsWithMeta,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process video.";
    console.error("Viral clips error:", err);
    await updateJobStatus(req, { jobId, status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(clipsDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.warn("Could not clean temporary clip directory:", cleanupError);
    });
  }
}
