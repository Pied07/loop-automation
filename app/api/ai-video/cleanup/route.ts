import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { jobId, videoUrl } = body;
    if (!jobId && !videoUrl) {
      return NextResponse.json({ success: true });
    }

    // 1. Delete GitHub Release & Tag if one was created
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";
    if (githubPat && jobId) {
      try {
        const tag = `clips-${jobId}`;
        const relRes = await fetch(`https://api.github.com/repos/${githubRepo}/releases/tags/${tag}`, {
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "The-Viral-Desk-App",
          },
        });
        if (relRes.ok) {
          const relData = await relRes.json();
          if (relData.id) {
            await fetch(`https://api.github.com/repos/${githubRepo}/releases/${relData.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${githubPat}`, "User-Agent": "The-Viral-Desk-App" },
            });
            await fetch(`https://api.github.com/repos/${githubRepo}/git/refs/tags/${tag}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${githubPat}`, "User-Agent": "The-Viral-Desk-App" },
            });
            console.log(`[Cleanup] Deleted GitHub release & tag ${tag}`);
          }
        }
      } catch (ghErr: any) {
        console.warn("Notice deleting GitHub release for discarded video:", ghErr.message);
      }
    }

    // 2. Delete local temp video/thumbnail file if it is a local path
    if (videoUrl && typeof videoUrl === "string" && !videoUrl.startsWith("http")) {
      try {
        if (fs.existsSync(videoUrl)) {
          fs.unlinkSync(videoUrl);
          console.log(`[Cleanup] Deleted local temporary video file: ${videoUrl}`);
        }
      } catch {}
    }

    return NextResponse.json({ success: true, message: `Discarded session video ${jobId || ""}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
