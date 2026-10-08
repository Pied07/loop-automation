import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { doc, getDoc } from "firebase/firestore";
import { scrapeOnlineViralVideo, cleanViralTitle } from "@/app/viral-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Trending",
  "Comedy",
  "Motivational",
  "Horror",
  "Educational",
  "Romance",
  "Adventure",
  "Music",
  "Food",
];

async function handleCronPublish(req: NextRequest) {
  try {
    // 1. Verify if auto-pilot is enabled in Firestore app settings
    if (database) {
      try {
        const autoSnap = await getDoc(doc(database, "app_config", "auto_pilot"));
        if (autoSnap.exists()) {
          const autoData = autoSnap.data();
          if (autoData.enabled === false) {
            return NextResponse.json({
              success: false,
              message: "Auto-Pilot is currently toggled OFF in workspace settings.",
            });
          }
        }
      } catch (err: any) {
        console.warn("Notice: Firestore auto_pilot check fallback:", err.message);
      }
    }

    // 2. Select a random viral category
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

    // 3. Scrape a viral video online (zero bot blocks, direct MP4)
    let scraped = await scrapeOnlineViralVideo(randomCategory);
    if (!scraped || !scraped.url) {
      scraped = await scrapeOnlineViralVideo("Trending");
    }

    if (!scraped || !scraped.url) {
      return NextResponse.json({
        success: false,
        error: "Could not find a viral video for auto-publishing today.",
      }, { status: 500 });
    }

    const cleanTitle = await cleanViralTitle(scraped.title || "", randomCategory);
    const jobId = `cron-${Date.now()}`;

    // 4. Trigger cloud video runner with autoPublish=true
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";
    const appUrl = process.env.APP_URL || "https://the-viral-desk.vercel.app";

    if (githubPat) {
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
            videoUrl: scraped.url,
            contentCategory: randomCategory,
            sourceTitle: cleanTitle,
            jobId,
            userId: "auto-pilot",
            cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
            cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
            cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
            appUrl,
            autoPublish: "true",
          },
        }),
      });

      if (ghRes.ok) {
        return NextResponse.json({
          success: true,
          mode: "cloud-github-actions",
          category: randomCategory,
          title: cleanTitle,
          videoUrl: scraped.url,
          jobId,
          autoPublish: true,
          message: `Auto-pilot started successfully for category "${randomCategory}". Video will be split and published to connected platforms automatically!`,
        });
      } else {
        console.warn("GitHub Actions dispatch warning:", await ghRes.text());
      }
    }

    // Fallback: Queue job for desktop worker if GitHub PAT is not set
    const queueUrl = new URL("/api/viral-clips/queue", req.url).toString();
    await fetch(queueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        videoUrl: scraped.url,
        contentCategory: randomCategory,
        sourceTitle: cleanTitle,
        autoPublish: true,
        status: "pending",
      }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      mode: "queued-worker",
      category: randomCategory,
      title: cleanTitle,
      videoUrl: scraped.url,
      jobId,
      autoPublish: true,
      message: `Auto-pilot queued for category "${randomCategory}". Worker will split and publish all clips.`,
    });
  } catch (err: any) {
    console.error("Cron auto-pilot error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCronPublish(req);
}

export async function POST(req: NextRequest) {
  return handleCronPublish(req);
}
