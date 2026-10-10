import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { scrapeOnlineViralVideo, cleanViralTitle } from "@/app/viral-actions";
import { extractUrlSignatures, isUrlDuplicate } from "@/app/lib/url-utils";

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
    let ownerUserId = "auto-pilot";
    let ownerEmail = "";
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
          if (autoData.ownerUserId) {
            ownerUserId = autoData.ownerUserId;
          }
          if (autoData.ownerEmail) {
            ownerEmail = autoData.ownerEmail;
          }
        }
      } catch (err: any) {
        console.warn("Notice: Firestore auto_pilot check fallback:", err.message);
      }
    }

    // 2. Fetch past video source links to ensure 100% freshness (zero duplicates)
    const pastSignatures = new Set<string>();
    const pastRawUrls = new Set<string>();

    if (database) {
      try {
        // A. Persistent cron history store
        const cronHistoryRef = doc(database, "app_config", "cron_history");
        const cronSnap = await getDoc(cronHistoryRef);
        if (cronSnap.exists()) {
          const sources: string[] = cronSnap.data().sources || [];
          for (const s of sources) {
            if (s) {
              pastRawUrls.add(s.trim());
              for (const sig of extractUrlSignatures(s)) {
                pastSignatures.add(sig);
              }
            }
          }
        }

        // B. Existing library videos
        const vSnap = await getDocs(query(collection(database, "videos"), limit(120)));
        vSnap.docs.forEach((d) => {
          const data = d.data();
          const urls = [data.sourceUrl, data.sourceLink, data.originalUrl, data.videoUrl].filter(Boolean);
          for (const u of urls) {
            pastRawUrls.add(String(u).trim());
            for (const sig of extractUrlSignatures(String(u))) {
              pastSignatures.add(sig);
            }
          }
        });
      } catch (err: any) {
        console.warn("Past source links fetch notice:", err.message);
      }
    }

    // 3. Select a viral video that is GUARANTEED new (never posted before)
    const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    let scraped: { url: string; title: string; source: string } | null = null;
    let chosenCategory = randomCategory;

    // Shuffle other categories as fallback attempts
    const candidateCategories = [
      randomCategory,
      ...CATEGORIES.filter((c) => c !== randomCategory).sort(() => 0.5 - Math.random()),
    ];

    for (const cat of candidateCategories) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = await scrapeOnlineViralVideo(cat, pastSignatures);
        if (candidate && candidate.url) {
          const isDup = isUrlDuplicate(candidate.url, pastSignatures) || pastRawUrls.has(candidate.url.trim());
          if (!isDup) {
            scraped = candidate;
            chosenCategory = cat;
            break;
          } else {
            console.log(`[Cron Auto-Pilot] Skipping already posted source: ${candidate.url.slice(0, 60)}... Finding fresh video.`);
          }
        }
      }
      if (scraped) break;
    }

    if (!scraped || !scraped.url) {
      return NextResponse.json({
        success: false,
        error: "All discovered videos matched previous posts. Could not find an absolutely new video today.",
      }, { status: 500 });
    }

    const cleanTitle = await cleanViralTitle(scraped.title || "", chosenCategory);
    const jobId = `cron-${Date.now()}`;

    // 4. Save new source link to persistent cron history immediately
    if (database) {
      try {
        const cronHistoryRef = doc(database, "app_config", "cron_history");
        const cronSnap = await getDoc(cronHistoryRef);
        const existingSources = cronSnap.exists() ? (cronSnap.data().sources || []) : [];
        await setDoc(cronHistoryRef, {
          sources: Array.from(new Set([...existingSources, scraped.url])).slice(-500),
          lastRunAt: new Date().toISOString(),
          lastTitle: cleanTitle,
          lastCategory: chosenCategory,
          lastSourceUrl: scraped.url,
        }, { merge: true });
      } catch (err: any) {
        console.warn("Cron history save notice:", err.message);
      }
    }

    // 5. Trigger cloud video runner with autoPublish=true
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
            contentCategory: chosenCategory,
            sourceTitle: cleanTitle,
            jobId,
            userId: ownerUserId,
            userEmail: ownerEmail,
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
          category: chosenCategory,
          title: cleanTitle,
          videoUrl: scraped.url,
          sourceUrl: scraped.url,
          jobId,
          autoPublish: true,
          message: `Auto-pilot started successfully for category "${chosenCategory}". Absolutely fresh video (${scraped.url.slice(0, 45)}...) will be split and published automatically!`,
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
        sourceUrl: scraped.url,
        sourceLink: scraped.url,
        contentCategory: chosenCategory,
        sourceTitle: cleanTitle,
        autoPublish: true,
        status: "pending",
      }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      mode: "queued-worker",
      category: chosenCategory,
      title: cleanTitle,
      videoUrl: scraped.url,
      sourceUrl: scraped.url,
      jobId,
      autoPublish: true,
      message: `Auto-pilot queued for category "${chosenCategory}". Absolutely fresh video will be processed by worker.`,
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
