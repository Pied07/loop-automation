import { NextRequest, NextResponse } from "next/server";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "path";
import { randomUUID } from "node:crypto";
import { downloadAndSplitVideo, generateClipMetadata } from "@/app/viral-actions";
import { assertCloudinaryConfigured, deleteCloudinaryVideo, uploadVideoToCloudinary } from "@/app/cloudinary-upload";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ProcessingMode = "local" | "cloud" | "queue";

async function readJsonBody(req: NextRequest) {
  try {
    return await req.json() as { videoUrl?: unknown; contentCategory?: unknown; userId?: unknown };
  } catch {
    return null;
  }
}

function getProcessingMode(req: NextRequest): ProcessingMode {
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

async function initializeJobStatus(req: NextRequest, jobId: string) {
  try {
    const statusUrl = new URL("/api/viral-clips/status", req.url).toString();
    await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        status: "processing",
        progress: 12,
        step: "Queued for video processing...",
      }),
    });
  } catch (error) {
    console.warn("Initial status update failed:", error);
  }
}

async function dispatchGitHubWorkflow(params: {
  videoUrl: string;
  contentCategory: string;
  jobId: string;
  userId: string;
}) {
  const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!githubPat) return false;

  const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";
  const response = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/split-video.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "The-Viral-Desk-App",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: params,
    }),
  });

  if (!response.ok) {
    console.warn("GitHub workflow dispatch failed:", response.status, await response.text());
    return false;
  }

  return true;
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
    const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "creator";
    const processingMode = getProcessingMode(req);

    if (processingMode === "queue") {
      const queueRegistered = await registerQueuedJob(req, { jobId, videoUrl, contentCategory: normalizedCategory });
      if (!queueRegistered) {
        return NextResponse.json({ error: "Could not queue the job for the desktop worker." }, { status: 500 });
      }

      await initializeJobStatus(req, jobId);
      return NextResponse.json({
        success: true,
        cloudMode: "desktop-worker",
        jobId,
        message: "Video splitting job queued for the desktop worker.",
      });
    }

    if (processingMode === "cloud") {
      await initializeJobStatus(req, jobId);
      const githubDispatched = await dispatchGitHubWorkflow({ videoUrl, contentCategory: normalizedCategory, jobId, userId });
      if (!githubDispatched) {
        return NextResponse.json({ error: "Could not start the GitHub cloud runner. Set VIRAL_CLIPS_PROCESSOR=local to process on this machine." }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        cloudMode: "github",
        jobId,
        message: "Video splitting job started in GitHub Actions.",
      });
    }

    assertCloudinaryConfigured();
    await mkdir(clipsDir, { recursive: true, mode: 0o700 });

    const splitResult = await downloadAndSplitVideo(videoUrl, clipsDir);
    if ("error" in splitResult) {
      return NextResponse.json({ error: splitResult.error }, { status: 400 });
    }

    const { clips, sourceTitle, totalDuration } = splitResult;
    const clipsWithMetadata = await Promise.all(
      clips.map(async (clip, index) => {
        const meta = await generateClipMetadata({
          partNumber: index + 1,
          totalParts: clips.length,
          sourceTitle,
          totalDuration,
          contentCategory: normalizedCategory,
          clipDuration: clip.duration,
        });

        return {
          clipPath: clip.clipPath,
          partNumber: index + 1,
          title: clips.length === 1 ? sourceTitle : `PART ${index + 1} | ${sourceTitle.slice(0, 45)}`,
          description: meta.description,
          hashtags: meta.hashtags,
          duration: clip.duration,
          startTime: clip.startTime,
        };
      })
    );

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

    return NextResponse.json({
      success: true,
      sourceTitle,
      totalDuration,
      clips: clipsWithMeta,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process video.";
    console.error("Viral clips error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(clipsDir, { recursive: true, force: true }).catch((cleanupError) => {
      console.warn("Could not clean temporary clip directory:", cleanupError);
    });
  }
}
