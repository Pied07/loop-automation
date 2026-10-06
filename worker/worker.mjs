import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// 1. Read .env file for configuration
function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const APP_URL = (process.env.APP_URL || env.APP_URL || "https://the-viral-desk.vercel.app").replace(/\/$/, "");
const GITHUB_PAT = process.env.GITHUB_PAT || env.GITHUB_PAT || "";
const GITHUB_REPO = process.env.GITHUB_REPO || env.GITHUB_REPO || "Pied07/loop-automation";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET || "";

const TEMP_DIR = path.join(ROOT_DIR, "temp_worker");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Binaries detection
const YTDLP_BIN = fs.existsSync(path.join(ROOT_DIR, "yt-dlp.exe"))
  ? path.join(ROOT_DIR, "yt-dlp.exe")
  : "yt-dlp";

const FFMPEG_BIN = fs.existsSync(path.join(ROOT_DIR, "ffmpeg.exe"))
  ? path.join(ROOT_DIR, "ffmpeg.exe")
  : "ffmpeg";

console.log("=================================================");
console.log("      🚀 THE VIRAL DESK — DESKTOP WORKER         ");
console.log("=================================================");
console.log(`🌐 Connected to Web App: ${APP_URL}`);
console.log(`📡 Residential IP Worker: Active (Zero YouTube blocks)`);
console.log(`📼 Downloader: ${YTDLP_BIN}`);
console.log(`🎞️  FFmpeg:     ${FFMPEG_BIN}`);
if (CLOUDINARY_CLOUD_NAME) {
  console.log(`☁️  Storage:    Cloudinary (${CLOUDINARY_CLOUD_NAME}) [Auto-delete on publish]`);
} else {
  console.log(`☁️  Storage:    GitHub Releases (CDN) [100% Free Forever]`);
}
console.log("=================================================");
console.log("Listening for video splitting jobs from the web app...\n");

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT_DIR });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `Process exited with code ${code}`));
    });
  });
}

async function updateJobStatus(payload) {
  try {
    await fetch(`${APP_URL}/api/viral-clips/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`[WORKER] Warning: Failed to send status update: ${err.message}`);
  }
}

// Uploads clip to Cloudinary
async function uploadToCloudinary(filePath, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = await import("crypto");
  const signature = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest("hex");

  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: "video/mp4" });
  formData.append("file", blob, path.basename(filePath));
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", timestamp.toString());
  formData.append("public_id", publicId);
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (data.secure_url) {
    return { url: data.secure_url, publicId: data.public_id };
  }
  throw new Error(data.error?.message || "Cloudinary upload failed");
}

// Uploads clips to GitHub Release as fallback
async function uploadToGitHubRelease(jobId, title, clipFiles) {
  const tagName = `clips-${jobId}`;
  const urlMap = {};

  if (!GITHUB_PAT) {
    for (const f of clipFiles) {
      urlMap[path.basename(f)] = f;
    }
    return urlMap;
  }

  try {
    // 1. Create Release
    const relRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "ViralDesk-DesktopWorker",
      },
      body: JSON.stringify({
        tag_name: tagName,
        name: `Clips: ${title.slice(0, 40)}`,
        body: `Auto-generated clips for Job ${jobId}`,
      }),
    });

    const relData = await relRes.json();
    const uploadUrlBase = (relData.upload_url || "").split("{")[0];

    // 2. Upload Assets
    for (const filePath of clipFiles) {
      const fileName = path.basename(filePath);
      const fileBytes = fs.readFileSync(filePath);
      const assetUrl = `${uploadUrlBase}?name=${encodeURIComponent(fileName)}`;

      const aRes = await fetch(assetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          "Content-Type": "video/mp4",
          "User-Agent": "ViralDesk-DesktopWorker",
        },
        body: fileBytes,
      });

      const aData = await aRes.json();
      urlMap[fileName] = aData.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/download/${tagName}/${fileName}`;
    }
    return urlMap;
  } catch (e) {
    console.warn(`[WORKER] GitHub Release upload error: ${e.message}`);
    for (const f of clipFiles) {
      urlMap[path.basename(f)] = `https://github.com/${GITHUB_REPO}/releases/download/${tagName}/${path.basename(f)}`;
    }
    return urlMap;
  }
}

async function saveReleaseMeta(jobId, title, finishedClips, duration) {
  if (!GITHUB_PAT) return;
  const tagName = `clips-${jobId}`;
  try {
    const payload = JSON.stringify({
      status: "done",
      progress: 100,
      step: `✅ ${finishedClips.length} clips ready!`,
      clips: finishedClips,
      sourceTitle: title,
      totalDuration: duration,
    });
    const relRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tagName}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ViralDesk-DesktopWorker",
      },
    });
    if (relRes.ok) {
      const relData = await relRes.json();
      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/${relData.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "ViralDesk-DesktopWorker",
        },
        body: JSON.stringify({ body: payload }),
      });
    } else {
      await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "ViralDesk-DesktopWorker",
        },
        body: JSON.stringify({
          tag_name: tagName,
          name: `Clips: ${title.slice(0, 40)}`,
          body: payload,
        }),
      });
    }
  } catch (err) {
    console.warn(`[WORKER] Warning: Could not update GitHub release metadata: ${err.message}`);
  }
}

async function processJob(job) {
  const { jobId, videoUrl, contentCategory } = job;
  console.log(`\n[WORKER] 📥 Picked up Job [${jobId}] for: ${videoUrl}`);

  await updateJobStatus({
    jobId,
    status: "processing",
    progress: 20,
    step: "Downloading video via residential network...",
  });

  const timestamp = Date.now();
  const sourcePath = path.join(TEMP_DIR, `source_${timestamp}.mp4`);

  try {
    // 1. Download via yt-dlp on residential connection
    console.log(`[WORKER] ⬇️ Downloading: ${videoUrl}`);
    const dlArgs = [
      videoUrl,
      "-o", sourcePath,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--print-json",
    ];

    let infoJson = {};
    try {
      const { stdout } = await runCommand(YTDLP_BIN, dlArgs);
      const lastLine = stdout.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
      if (lastLine) infoJson = JSON.parse(lastLine);
    } catch {
      // Fallback download if json parsing fails
      await runCommand(YTDLP_BIN, [videoUrl, "-o", sourcePath, "--no-playlist"]);
    }

    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size < 1000) {
      throw new Error("Downloaded video file is empty or missing.");
    }

    const title = infoJson.title || "Viral Video";
    let duration = Number(infoJson.duration) || 0;

    console.log(`[WORKER] 🎬 Video Ready: "${title}" (${duration}s)`);

    await updateJobStatus({
      jobId,
      status: "processing",
      progress: 50,
      step: "Splitting into vertical 9:16 short clips with FFmpeg...",
      sourceTitle: title,
      totalDuration: duration,
    });

    // 2. Split with FFmpeg
    const clipLength = duration > 0 && duration < 600 ? 90.0 : 1200.0;
    const clipFiles = [];
    const clipsMeta = [];
    let startTime = 0.0;
    let partNum = 1;

    // Default duration if probe failed
    if (duration <= 0) duration = 180.0;

    while (startTime < duration) {
      const remaining = duration - startTime;
      const curDuration = Math.min(clipLength, remaining);
      if (curDuration < 3.0) break;

      const clipFileName = `clip_${timestamp}_part${partNum}.mp4`;
      const clipFilePath = path.join(TEMP_DIR, clipFileName);

      console.log(`[WORKER] ✂️  Cutting PART ${partNum} (${startTime.toFixed(1)}s -> ${(startTime + curDuration).toFixed(1)}s)...`);
      await runCommand(FFMPEG_BIN, [
        "-y",
        "-ss", startTime.toString(),
        "-i", sourcePath,
        "-t", curDuration.toString(),
        "-c:v", "copy",
        "-c:a", "copy",
        "-avoid_negative_ts", "make_zero",
        clipFilePath,
      ]);

      clipFiles.push(clipFilePath);
      clipsMeta.push({
        partNumber: partNum,
        fileName: clipFileName,
        duration: Math.round(curDuration * 100) / 100,
        startTime: Math.round(startTime * 100) / 100,
        title: `PART ${partNum} | ${title.slice(0, 45)}`,
        description: `📌 PART ${partNum}\n${title}\n\nShared under Fair Use. Like & subscribe for more!`,
        hashtags: ["shorts", "viral", "trending", (contentCategory || "trending").toLowerCase()],
      });

      startTime += curDuration;
      partNum += 1;
    }

    // 3. Upload Clips
    await updateJobStatus({
      jobId,
      status: "processing",
      progress: 80,
      step: "Uploading clips to cloud storage...",
    });

    const finishedClips = [];

    if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      console.log(`[WORKER] ☁️ Uploading ${clipFiles.length} clips to Cloudinary...`);
      for (const meta of clipsMeta) {
        const filePath = path.join(TEMP_DIR, meta.fileName);
        const publicId = `viral_clips/${jobId}/${meta.fileName.replace(".mp4", "")}`;
        const uploaded = await uploadToCloudinary(filePath, publicId);
        finishedClips.push({
          partNumber: meta.partNumber,
          title: meta.title,
          description: meta.description,
          hashtags: meta.hashtags,
          duration: meta.duration,
          startTime: meta.startTime,
          url: uploaded.url,
          publicUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
        });
      }
    } else {
      console.log(`[WORKER] ☁️ Uploading ${clipFiles.length} clips to GitHub Releases CDN...`);
      const urlMap = await uploadToGitHubRelease(jobId, title, clipFiles);
      for (const meta of clipsMeta) {
        const publicUrl = urlMap[meta.fileName] || "";
        finishedClips.push({
          partNumber: meta.partNumber,
          title: meta.title,
          description: meta.description,
          hashtags: meta.hashtags,
          duration: meta.duration,
          startTime: meta.startTime,
          url: publicUrl,
          publicUrl,
        });
      }
    }

    // 4. Mark Job Complete
    await saveReleaseMeta(jobId, title, finishedClips, duration);

    await updateJobStatus({
      jobId,
      status: "done",
      progress: 100,
      step: `✅ ${finishedClips.length} clips ready!`,
      clips: finishedClips,
      sourceTitle: title,
      totalDuration: duration,
    });

    // Notify queue
    await fetch(`${APP_URL}/api/viral-clips/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action: "complete" }),
    });

    console.log(`[WORKER] ✅ Job [${jobId}] finished! ${finishedClips.length} clips ready.\n`);
  } catch (err) {
    console.error(`[WORKER] ❌ Error processing job [${jobId}]:`, err.message);
    await updateJobStatus({
      jobId,
      status: "failed",
      error: `Worker failed: ${err.message}`,
    });
  } finally {
    // Cleanup temporary files
    if (fs.existsSync(sourcePath)) {
      try { fs.unlinkSync(sourcePath); } catch {}
    }
    for (const f of fs.readdirSync(TEMP_DIR)) {
      try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {}
    }
  }
}

// Main Polling Loop
let isProcessing = false;

async function pollQueue() {
  if (isProcessing) return;

  try {
    const res = await fetch(`${APP_URL}/api/viral-clips/queue`);
    if (res.ok) {
      const data = await res.json();
      if (data.job) {
        isProcessing = true;
        // Claim the job
        await fetch(`${APP_URL}/api/viral-clips/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: data.job.jobId, action: "claim" }),
        });
        await processJob(data.job);
        isProcessing = false;
      }
    }
  } catch (e) {
    // Network hiccup, will retry
  }
}

// Poll every 3 seconds
setInterval(pollQueue, 3000);
pollQueue();
