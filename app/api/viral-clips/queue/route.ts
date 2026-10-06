import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// In-memory queue for video jobs
interface QueueJob {
  jobId: string;
  videoUrl: string;
  contentCategory: string;
  status: "pending" | "processing" | "done" | "failed";
  worker?: string;
  createdAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __viralJobQueue: Map<string, QueueJob> | undefined;
}

const queue = globalThis.__viralJobQueue || new Map<string, QueueJob>();
globalThis.__viralJobQueue = queue;

// GET: Worker polls this endpoint for pending jobs
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const claimJobId = searchParams.get("claim");

  // If worker wants to claim a specific job
  if (claimJobId) {
    const job = queue.get(claimJobId);
    if (job) {
      job.status = "processing";
      job.worker = "desktop-worker";
      queue.set(claimJobId, job);
      return NextResponse.json({ success: true, job });
    }
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Find oldest pending job
  for (const [id, job] of queue.entries()) {
    // If pending and less than 15 minutes old
    if (job.status === "pending" && Date.now() - job.createdAt < 15 * 60 * 1000) {
      return NextResponse.json({ job });
    }
  }

  return NextResponse.json({ job: null });
}

// POST: Add a new job or update existing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, videoUrl, contentCategory, status, action } = body;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (action === "claim") {
      const job = queue.get(jobId);
      if (job) {
        job.status = "processing";
        queue.set(jobId, job);
        return NextResponse.json({ success: true, job });
      }
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (action === "complete" || action === "remove") {
      queue.delete(jobId);
      return NextResponse.json({ success: true });
    }

    // Add or update
    const job: QueueJob = {
      jobId,
      videoUrl: videoUrl || "",
      contentCategory: contentCategory || "Trending",
      status: status || "pending",
      createdAt: Date.now(),
    };

    queue.set(jobId, job);

    // Auto-cleanup jobs older than 1 hour
    const now = Date.now();
    for (const [id, j] of queue.entries()) {
      if (now - j.createdAt > 3600000) {
        queue.delete(id);
      }
    }

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
