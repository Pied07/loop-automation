import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { scrapeOnlineViralVideo, cleanViralTitle, generateAiVideoAction } from "@/app/viral-actions";
import { extractUrlSignatures, isUrlDuplicate, isAudioOnlyUrl } from "@/app/lib/url-utils";

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
    let selectedContentType = "viral";

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
          if (autoData.contentType) {
            selectedContentType = autoData.contentType;
          }
        }
      } catch (err: any) {
        console.warn("Notice: Firestore auto_pilot check fallback:", err.message);
      }
    }

    // Determine execution mode: 'viral', 'ai', or alternating 'both'
    let cronMode: "viral" | "ai" = "viral";
    if (selectedContentType === "ai") {
      cronMode = "ai";
    } else if (selectedContentType === "both") {
      let lastType = "viral";
      if (database) {
        try {
          const cronSnap = await getDoc(doc(database, "app_config", "cron_history"));
          if (cronSnap.exists() && cronSnap.data()?.lastCronType) {
            lastType = cronSnap.data().lastCronType;
          }
        } catch {}
      }
      cronMode = lastType === "viral" ? "ai" : "viral";
    }

    // If AI Story mode is triggered: generate and auto-publish an AI video
    if (cronMode === "ai") {
      console.log("[Cron Auto-Pilot] Generating and auto-publishing fresh AI Story Video...");
      let cronSelectionMode = "random";
      let chosenCategory = "Interesting Facts";
      let chosenVoice = "en-US-ChristopherNeural";
      let chosenParts = 1;
      let chosenDuration = 60;
      let chosenCaption = "viral_yellow";
      let chosenSceneStyle = "Realism";

      if (database) {
        try {
          const autoSnap = await getDoc(doc(database, "app_config", "auto_pilot"));
          if (autoSnap.exists()) {
            const d = autoSnap.data();
            if (d.cronSelectionMode) cronSelectionMode = d.cronSelectionMode;
            if (d.chosenCategory) chosenCategory = d.chosenCategory;
            if (d.chosenVoice) chosenVoice = d.chosenVoice;
            if (d.chosenParts) chosenParts = Number(d.chosenParts) || 1;
            if (d.chosenDuration) chosenDuration = Number(d.chosenDuration) || 60;
            if (d.chosenCaption) chosenCaption = d.chosenCaption;
            if (d.chosenSceneStyle) chosenSceneStyle = d.chosenSceneStyle;
          }
        } catch {}
      }

      // If random mode: select a completely random category, voice, caption style, and scene picture style
      const ALL_CATEGORIES = ["Interesting Facts", "Horror", "Motivational", "Romance", "Adventure", "Educational", "Comedy", "Music", "Others"];
      const ALL_VOICES = ["en-US-ChristopherNeural", "en-US-JennyNeural", "en-US-GuyNeural", "en-US-AriaNeural", "en-US-BrianNeural", "en-US-EmmaNeural"];
      const ALL_CAPTIONS = ["viral_yellow", "clean_pill", "cinematic", "neon_glow", "soft_shadow_bar"];
      const ALL_STYLES = ["Realism", "Anime", "Disney 3D", "Mecha", "Dark Fantasy", "Retro Comic"];

      let effectiveCategory = chosenCategory;
      let effectiveVoice = chosenVoice;
      let effectiveCaption = chosenCaption;
      let effectiveStyle = chosenSceneStyle;
      let effectiveParts = chosenParts;

      if (cronSelectionMode === "random") {
        effectiveCategory = ALL_CATEGORIES[Math.floor(Math.random() * ALL_CATEGORIES.length)];
        effectiveVoice = ALL_VOICES[Math.floor(Math.random() * ALL_VOICES.length)];
        effectiveCaption = ALL_CAPTIONS[Math.floor(Math.random() * ALL_CAPTIONS.length)];
        effectiveStyle = ALL_STYLES[Math.floor(Math.random() * ALL_STYLES.length)];
        effectiveParts = Math.floor(Math.random() * 3) + 1; // 1 to 3 parts randomly
      }

      const aiResult = await generateAiVideoAction({
        category: effectiveCategory,
        voice: effectiveVoice,
        captionStyle: effectiveCaption,
        stylePreset: effectiveStyle,
        numImages: 3,
        duration: chosenDuration,
        numParts: effectiveParts,
        userId: ownerUserId,
        userEmail: ownerEmail,
        autoPublish: true,
        platforms: { youtube: true, facebook: true, instagram: true },
      });

      if (database) {
        try {
          const cronHistoryRef = doc(database, "app_config", "cron_history");
          await setDoc(cronHistoryRef, {
            lastRunAt: new Date().toISOString(),
            lastTitle: aiResult.title || "AI Story Video",
            lastCategory: "Interesting Facts",
            lastCronType: "ai",
          }, { merge: true });
        } catch {}
      }

      return NextResponse.json({
        success: true,
        mode: "ai-story",
        category: "Interesting Facts",
        title: aiResult.title,
        videoUrl: aiResult.videoUrl,
        message: `[Cron Auto-Pilot] AI Story "${aiResult.title}" synthesized and published across socials!`,
        result: aiResult,
      });
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
          if (isAudioOnlyUrl(candidate.url)) {
            console.log(`[Cron Auto-Pilot] Skipping audio-only source: ${candidate.url.slice(0, 60)}... Finding actual video.`);
            continue;
          }
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
          lastCronType: "viral",
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
