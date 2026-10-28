import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface CachedJob {
  status: string;
  progress: number;
  step: string;
  clips?: any[];
  imageUrl?: string;
  sourceTitle?: string;
  totalDuration?: number;
  error?: string;
  userId?: string;
  partNumber?: number;
  totalParts?: number;
  updatedAt: number;
}

// In-memory job state cache (with 1 hour TTL)
const jobCache = new Map<string, CachedJob>();

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const userId = searchParams.get("userId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = jobCache.get(jobId);
  if (job && (job.status === "done" || job.status === "failed")) {
    return NextResponse.json(job);
  }

  // Check persistent Firestore state
  if (database) {
    try {
      const snap = await getDoc(doc(database, "jobs", jobId));
      if (snap.exists()) {
        const firestoreJob = snap.data() as any;
        jobCache.set(jobId, { ...firestoreJob, updatedAt: Date.now() });
        if (firestoreJob.status === "done" || firestoreJob.status === "failed") {
          return NextResponse.json(firestoreJob);
        }
      }
    } catch (err: any) {
      console.warn("Firestore status check notice:", err.message);
    }
  }

  // Direct Cloudinary asset probe for AI image jobs
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dbgvwyhdr";
  if (cloudName && jobId.startsWith("img_")) {
    const candidateUserIds = Array.from(new Set([
      userId,
      job?.userId,
      "okWQqztlltfKTzJ2ATYDwnqCdo52",
      "creator",
    ].filter(Boolean) as string[]));

    for (const candidateUid of candidateUserIds) {
      const safeUid = candidateUid.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "creator";
      const safeJid = jobId.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "job";
      const candidateImageUrl = `https://res.cloudinary.com/${cloudName}/image/upload/ai_images/${safeUid}/${safeJid}.png`;

      try {
        const headRes = await fetch(candidateImageUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });
        if (headRes.ok) {
          const resolvedPayload: CachedJob = {
            status: "done",
            progress: 100,
            step: "✅ Image generated successfully by your native ML model!",
            imageUrl: candidateImageUrl,
            clips: [{ id: jobId, url: candidateImageUrl, imageUrl: candidateImageUrl }],
            sourceTitle: job?.sourceTitle || "AI Generated Image",
            userId: safeUid,
            updatedAt: Date.now(),
          };
          jobCache.set(jobId, resolvedPayload);
          if (database) {
            try {
              await setDoc(doc(database, "jobs", jobId), resolvedPayload, { merge: true });
            } catch {}
          }
          return NextResponse.json(resolvedPayload);
        }
      } catch {}
    }
  }

  // Direct Cloudinary asset probe for AI video jobs (or any job with uploaded video)
  if (cloudName && (jobId.startsWith("ai_") || job?.step?.toLowerCase().includes("cloudinary"))) {
    const candidateUserIds = Array.from(new Set([
      userId,
      job?.userId,
      "okWQqztlltfKTzJ2ATYDwnqCdo52",
      "creator",
    ].filter(Boolean) as string[]));

    for (const candidateUid of candidateUserIds) {
      const safeUid = candidateUid.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "creator";
      const safeJid = jobId.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "job";
      const candidateVideoUrl = `https://res.cloudinary.com/${cloudName}/video/upload/ai_videos/${safeUid}/${safeJid}.mp4`;
      const candidateThumbUrl = `https://res.cloudinary.com/${cloudName}/image/upload/ai_thumbs/${safeUid}/${safeJid}.jpg`;

      try {
        const headRes = await fetch(candidateVideoUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });
        if (headRes.ok) {
          const completedClip = {
            id: jobId,
            partNumber: job?.partNumber || 1,
            totalParts: job?.totalParts || 1,
            title: job?.sourceTitle || "AI Generated Video",
            description: job?.sourceTitle ? `✨ ${job.sourceTitle}` : "✨ AI Generated Video",
            hashtags: ["viral", "ai", "shorts", "reels"],
            duration: job?.totalDuration || 20,
            url: candidateVideoUrl,
            clipPath: candidateVideoUrl,
            publicUrl: candidateVideoUrl,
            videoUrl: candidateVideoUrl,
            cloudinaryUrl: candidateVideoUrl,
            thumbnailUrl: candidateThumbUrl,
            cloudinaryPublicId: `ai_videos/${safeUid}/${safeJid}`,
            format: "AI Video",
            isAiVideo: true,
            createdAt: new Date().toISOString(),
          };
          const resolvedPayload: CachedJob = {
            status: "done",
            progress: 100,
            step: `✅ Part ${job?.partNumber || 1} generated successfully!`,
            clips: [completedClip],
            sourceTitle: completedClip.title,
            userId: safeUid,
            updatedAt: Date.now(),
          };
          jobCache.set(jobId, resolvedPayload);
          if (database) {
            try {
              await setDoc(doc(database, "jobs", jobId), resolvedPayload, { merge: true });
            } catch {}
          }
          return NextResponse.json(resolvedPayload);
        }
      } catch {}
    }
  }

  // If not completed yet, check GitHub Actions status directly
  const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";

  if (githubPat) {
    try {
      // 1. Check if runner published a completed release for this job
      const relRes = await fetch(`https://api.github.com/repos/${githubRepo}/releases/tags/clips-${jobId}`, {
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "The-Viral-Desk-App",
        },
      });
      if (relRes.ok) {
        const relData = await relRes.json();
        if (relData.body) {
          try {
            const parsed = JSON.parse(relData.body);
            if (parsed.status === "done") {
              jobCache.set(jobId, { ...parsed, updatedAt: Date.now() });
              if (database) {
                try {
                  await setDoc(doc(database, "jobs", jobId), parsed, { merge: true });
                } catch {}
              }
              return NextResponse.json(parsed);
            }
          } catch {}
        }
      }
    } catch {}

    try {
      const runsRes = await fetch(`https://api.github.com/repos/${githubRepo}/actions/runs?per_page=5`, {
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "The-Viral-Desk-App",
        },
      });
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const latestRun = runsData.workflow_runs?.[0];
        if (latestRun) {
          if (latestRun.status === "in_progress" || latestRun.status === "queued") {
            return NextResponse.json({
              status: "processing",
              progress: latestRun.status === "queued" ? 20 : 50,
              step: latestRun.status === "queued" ? "Waiting for GitHub cloud runner to start..." : "Cloud runner processing media with native ML model...",
            });
          }
          if (latestRun.conclusion === "failure") {
            return NextResponse.json({
              status: "failed",
              error: "GitHub Actions workflow run failed. Check your GitHub Actions logs.",
            });
          }
          if (latestRun.status === "completed" && latestRun.conclusion === "success") {
            if (job && (job.imageUrl || (Array.isArray(job.clips) && job.clips.length > 0))) {
              const donePayload: CachedJob = { ...job, status: "done", progress: 100, step: "✅ Asset generated successfully!", updatedAt: Date.now() };
              jobCache.set(jobId, donePayload);
              return NextResponse.json(donePayload);
            }
          }
        }
      }
    } catch {}
  }

  if (job) {
    return NextResponse.json(job);
  }

  return NextResponse.json({
    status: "processing",
    progress: 25,
    step: "Processing with native ML model...",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, status, progress, step, clips, imageUrl, sourceTitle, totalDuration, error, userId, partNumber, totalParts } = body;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const resolvedImageUrl = imageUrl || (Array.isArray(clips) && (clips[0]?.imageUrl || clips[0]?.url)) || undefined;

    const payload: CachedJob = {
      status: status || "processing",
      progress: progress || 0,
      step: step || "",
      clips: clips || undefined,
      imageUrl: resolvedImageUrl,
      sourceTitle: sourceTitle || undefined,
      totalDuration: totalDuration || undefined,
      error: error || undefined,
      userId: userId || undefined,
      partNumber: partNumber || undefined,
      totalParts: totalParts || undefined,
      updatedAt: Date.now(),
    };

    jobCache.set(jobId, payload);

    if (database) {
      try {
        await setDoc(doc(database, "jobs", jobId), payload, { merge: true });
      } catch (err: any) {
        console.warn("Failed to write status to Firestore:", err.message);
      }
    }

    // Cleanup memory cache entries older than 1 hour
    const now = Date.now();
    for (const [k, v] of jobCache.entries()) {
      if (now - v.updatedAt > 3600000) jobCache.delete(k);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
