import { NextRequest, NextResponse } from "next/server";

// In-memory job state cache (with 1 hour TTL)
const jobCache = new Map<string, { status: string; progress: number; step: string; clips?: any[]; sourceTitle?: string; error?: string; updatedAt: number }>();

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = jobCache.get(jobId);
  if (job) {
    return NextResponse.json(job);
  }

  // If not in cache, check GitHub Actions status directly
  const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";

  if (githubPat) {
    try {
      // 1. Check if worker published a completed release for this job
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
            if (parsed.status === "done" && Array.isArray(parsed.clips)) {
              jobCache.set(jobId, { ...parsed, updatedAt: Date.now() });
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
              step: latestRun.status === "queued" ? "Waiting for GitHub cloud runner to start..." : "Cloud runner processing video...",
            });
          }
          if (latestRun.conclusion === "failure") {
            return NextResponse.json({
              status: "failed",
              error: "GitHub Actions workflow run failed. Check your GitHub Actions logs.",
            });
          }
        }
      }
    } catch {}
  }

  return NextResponse.json({
    status: "processing",
    progress: 25,
    step: "Processing in GitHub cloud runner...",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, status, progress, step, clips, sourceTitle, error } = body;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    jobCache.set(jobId, {
      status: status || "processing",
      progress: progress || 0,
      step: step || "",
      clips: clips || undefined,
      sourceTitle: sourceTitle || undefined,
      error: error || undefined,
      updatedAt: Date.now(),
    });

    // Cleanup jobs older than 1 hour
    const now = Date.now();
    for (const [k, v] of jobCache.entries()) {
      if (now - v.updatedAt > 3600000) jobCache.delete(k);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
