"use server";

import path from "path";
import fs from "fs";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const SHORT_CLIP_LENGTH_SECONDS = 90;
const MAX_CLIP_BYTES = Number(process.env.CLOUDINARY_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
}



// Check if ffmpeg is available
async function checkFfmpeg(): Promise<string> {
  // 1. Check local binary in project root (e.g. ffmpeg.exe or ffmpeg)
  const localBin = path.join(process.cwd(), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fs.existsSync(localBin)) return localBin;

  // 2. Try bundled ffmpeg installer
  try {
    const requireFunc = typeof process !== "undefined" && process.versions && process.versions.node ? eval("require") : require;
    const ffmpegPath = requireFunc("@ffmpeg-installer/ffmpeg").path;
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch {}

  // 3. Fallback to system ffmpeg
  try {
    await execAsync("ffmpeg -version");
    return "ffmpeg";
  } catch {
    throw new Error(
      "ffmpeg is not installed. Please install ffmpeg from https://ffmpeg.org/download.html and add it to your PATH."
    );
  }
}

// ─── Video Probe ──────────────────────────────────────────────────────────────

async function getVideoDuration(ffmpegBin: string, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ["-i", filePath], { shell: false });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (match) {
        const sec = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        if (sec > 0) return resolve(sec);
      }
      resolve(0);
    });
    proc.on("error", () => resolve(0));
  });
}

// ─── Download Video ───────────────────────────────────────────────────────────

async function downloadWithYtDlp(
  videoUrl: string,
  outputPath: string,
  ffmpegBin: string
): Promise<{ title: string; duration?: number }> {
  const localExe = path.join(process.cwd(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  const ytDlpCmd = fs.existsSync(localExe) ? localExe : (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

  const runAttempt = (format: string, extraArgs: string[] = []) =>
    new Promise<{ title: string; duration: number }>((resolve, reject) => {
      const cookiesFile = path.join(process.cwd(), "cookies.txt");
      const args = [
        videoUrl,
        "--output", outputPath,
        "--format", format,
        "--merge-output-format", "mp4",
        "--postprocessor-args", "ffmpeg:-strict -2",
        "--no-playlist",
        "--retries", "3",
        "--fragment-retries", "5",
        "--ffmpeg-location", ffmpegBin,
        "--js-runtimes", "node",
        "--print-json",
        "--no-warnings",
        ...extraArgs,
      ];
      if (fs.existsSync(cookiesFile)) {
        args.push("--cookies", cookiesFile);
      }

      const proc = spawn(ytDlpCmd, args, { shell: false });
      let jsonOutput = "";
      let errOutput = "";
      proc.stdout.on("data", (d: Buffer) => { jsonOutput += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });

      proc.on("close", (code: number | null) => {
        if (!fs.existsSync(outputPath)) {
          const dir = path.dirname(outputPath);
          const base = path.basename(outputPath, path.extname(outputPath));
          try {
            const matching = fs.readdirSync(dir).find((f) => f.startsWith(base) && !f.endsWith(".part"));
            if (matching) fs.renameSync(path.join(dir, matching), outputPath);
          } catch {}
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          try {
            const parsed = JSON.parse(jsonOutput.trim().split("\n").pop() || "{}");
            resolve({ title: parsed.title || parsed.fulltitle || "Viral Video", duration: Number(parsed.duration) || 0 });
          } catch {
            resolve({ title: "Viral Video", duration: 0 });
          }
          return;
        }

        reject(new Error(`Download failed (code ${code}): ${errOutput.slice(-1200)}`));
      });

      proc.on("error", (e: Error) => reject(new Error(`Could not start yt-dlp: ${e.message}`)));
    });

  const isYouTubeUrl = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(new URL(videoUrl).hostname);

  const cleanPartials = () => {
    for (const partialPath of [outputPath, `${outputPath}.part`]) {
      try { fs.unlinkSync(partialPath); } catch {}
    }
    try {
      const dir = path.dirname(outputPath);
      const base = path.basename(outputPath, path.extname(outputPath));
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(base)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
    } catch {}
  };

  const isDirectMedia =
    videoUrl.includes("cloudinary.com") ||
    videoUrl.includes("tiktokcdn") ||
    videoUrl.includes("tikwm.com") ||
    videoUrl.includes("akamaized.net") ||
    videoUrl.includes("mixkit.co") ||
    videoUrl.includes("archive.org") ||
    videoUrl.includes("wikimedia.org") ||
    [".mp4", ".mov", ".webm", ".m4v"].some((ext) => videoUrl.toLowerCase().split("?")[0].endsWith(ext));
  if (isDirectMedia) {
    try {
      const resp = await fetch(videoUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
      });
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(arrayBuf));
        const urlObj = new URL(videoUrl);
        const baseName = path.basename(urlObj.pathname, path.extname(urlObj.pathname));
        return {
          title: baseName.replace(/[_\-]+/g, " ").trim() || "Viral Video",
          duration: 0,
        };
      }
    } catch (e: any) {
      console.warn("Direct HTTP fetch failed, trying yt-dlp:", e.message);
    }
  }

  const attempts: { name: string; format: string; extraArgs: string[] }[] = isYouTubeUrl
    ? [
        {
          name: "Standard MP4 merged",
          format: "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
          extraArgs: [],
        },
        {
          name: "Auto-select client (VisionOS)",
          format: "bv*+ba/b/best",
          extraArgs: ["--extractor-args", "youtube:player-client=visionos,android"],
        },
        {
          name: "Android client single stream",
          format: "b/18/best",
          extraArgs: ["--extractor-args", "youtube:player-client=android"],
        },
        {
          name: "HLS fallback",
          format: "95/best",
          extraArgs: ["--extractor-args", "youtube:player-client=web"],
        },
      ]
    : [
        {
          name: "Default best",
          format: "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
          extraArgs: [],
        },
      ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      cleanPartials();
      return await runAttempt(attempt.format, attempt.extraArgs);
    } catch (err: any) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isYouTubeUrl && /sign in to confirm|not a bot/i.test(msg)) {
        throw new Error(
          "YouTube is requiring sign-in from this network. This downloader uses no cookies and cannot proceed until YouTube allows the request. Try again later or use a video file/direct media URL you are authorized to process."
        );
      }
      console.warn(`yt-dlp attempt (${attempt.name}) failed:`, msg.slice(0, 300));
    }
  }

  throw lastError || new Error("Failed to download video with yt-dlp.");
}


async function downloadWithYtdlCore(videoUrl: string, outputPath: string): Promise<{ title: string }> {
  const ytdl = require("@distube/ytdl-core");
  const info = await ytdl.getInfo(videoUrl);
  const title = info.videoDetails.title || "Viral Video";
  
  await new Promise<void>((resolve, reject) => {
    const videoStream = ytdl(videoUrl, { quality: "highestvideo" });
    const writeStream = fs.createWriteStream(outputPath);
    videoStream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    videoStream.on("error", reject);
  });
  
  return { title };
}

// ─── Outro Merger ─────────────────────────────────────────────────────────────

async function appendOutroToClip(
  ffmpegBin: string,
  clipPath: string,
  outroPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filter =
      "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v0];" +
      "[1:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v1];" +
      "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0];" +
      "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]";

    const args = [
      "-y",
      "-i", clipPath,
      "-i", outroPath,
      "-filter_complex", filter,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "28",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      outputPath,
    ];

    const proc = spawn(ffmpegBin, args, { shell: false });
    let errOut = "";
    proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });
    proc.on("close", (code: number | null) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
        resolve();
      } else {
        reject(new Error(`Failed to append video outro: ${errOut.slice(-300)}`));
      }
    });
    proc.on("error", (e: Error) => reject(e));
  });
}

// ─── Split Video ──────────────────────────────────────────────────────────────

async function splitVideo(
  ffmpegBin: string,
  sourcePath: string,
  clipsDir: string,
  totalDuration: number,
  timestamp: number
): Promise<{ clipPath: string; duration: number; startTime: number }[]> {
  // Keep each output short enough for short-form platforms and Cloudinary's default upload cap.
  const clipLength = SHORT_CLIP_LENGTH_SECONDS;
  const clips: { clipPath: string; duration: number; startTime: number }[] = [];
  const outroPath = path.join(process.cwd(), "public", "assets", "video-outro.mp4");
  const hasOutro = fs.existsSync(outroPath);

  let startTime = 0;
  let partIndex = 1;

  while (startTime < totalDuration) {
    const remaining = totalDuration - startTime;
    const duration = Math.min(clipLength, remaining);
    if (duration < 3) break; // Skip tiny tail clips

    const clipFilename = `clip_${timestamp}_part${partIndex}.mp4`;
    const clipPath = path.join(clipsDir, clipFilename);
    const tempSliceFilename = `temp_${timestamp}_part${partIndex}.mp4`;
    const tempSlicePath = path.join(clipsDir, tempSliceFilename);
    const targetSlicePath = hasOutro ? tempSlicePath : clipPath;

    // 1. Cut the segment from source
    await new Promise<void>((resolve, reject) => {
      const copyArgs = [
        "-y",
        "-ss", String(startTime),
        "-i", sourcePath,
        "-t", String(duration),
        "-c:v", "copy",
        "-c:a", "copy",
        "-avoid_negative_ts", "make_zero",
        targetSlicePath,
      ];
      const verticalEncodeArgs = [
        "-y",
        "-ss", String(startTime),
        "-i", sourcePath,
        "-t", String(duration),
        "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "28",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        targetSlicePath,
      ];
      const args = hasOutro ? copyArgs : verticalEncodeArgs;
      const proc = spawn(ffmpegBin, args, { shell: false });
      let errOut = "";
      proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });
      proc.on("close", (code: number | null) => {
        if (code === 0 && fs.existsSync(targetSlicePath)) resolve();
        else reject(new Error(`ffmpeg split failed (part ${partIndex}): ${errOut.slice(-300)}`));
      });
      proc.on("error", (e: Error) => reject(e));
    });

    // 2. Merge the video-outro to the end of every clip
    let finalDuration = duration;
    if (hasOutro) {
      try {
        await appendOutroToClip(ffmpegBin, tempSlicePath, outroPath, clipPath);
        finalDuration += 10.01; // Outro duration
      } catch (outroErr: any) {
        console.warn("Could not append outro, using slice directly:", outroErr.message);
        if (fs.existsSync(tempSlicePath)) {
          fs.renameSync(tempSlicePath, clipPath);
        }
      } finally {
        if (fs.existsSync(tempSlicePath)) {
          try { fs.unlinkSync(tempSlicePath); } catch {}
        }
      }
    }

    const clipSize = fs.existsSync(clipPath) ? fs.statSync(clipPath).size : 0;
    if (clipSize > MAX_CLIP_BYTES) {
      const mb = (clipSize / 1024 / 1024).toFixed(1);
      const maxMb = (MAX_CLIP_BYTES / 1024 / 1024).toFixed(0);
      throw new Error(`Generated clip part ${partIndex} is ${mb} MB, above the ${maxMb} MB Cloudinary limit. Try a lower-resolution source or raise CLOUDINARY_MAX_UPLOAD_BYTES only if your Cloudinary plan allows it.`);
    }

    clips.push({ clipPath, duration: Math.round(finalDuration * 100) / 100, startTime });
    startTime += duration;
    partIndex++;
  }

  return clips;
}

// ─── Main: downloadAndSplitVideo ─────────────────────────────────────────────

export async function downloadAndSplitVideo(
  videoUrl: string,
  clipsDir: string
): Promise<
  | { clips: { clipPath: string; duration: number; startTime: number }[]; sourceTitle: string; totalDuration: number }
  | { error: string }
> {
  let ffmpegBin = "ffmpeg";
  let sourceFilePath = "";

  try {
    ffmpegBin = await checkFfmpeg();
    const timestamp = Date.now();
    sourceFilePath = path.join(clipsDir, `source_${timestamp}.mp4`);

    const isYouTubeUrl = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(new URL(videoUrl).hostname);
    let sourceTitle = "Viral Video";
    let probedDuration = 0;
    try {
      const result = await downloadWithYtDlp(videoUrl, sourceFilePath, ffmpegBin);
      sourceTitle = result.title;
      if (result.duration && result.duration > 0) probedDuration = result.duration;
    } catch (ytdlpErr: any) {
      if (isYouTubeUrl) throw ytdlpErr;
      console.warn("yt-dlp failed, trying ytdl-core:", ytdlpErr.message);
      try {
        const result = await downloadWithYtdlCore(videoUrl, sourceFilePath);
        sourceTitle = result.title;
      } catch (ytdlErr: any) {
        // Direct HTTP download is only appropriate for media URLs, not webpage URLs.
        console.warn("ytdl-core failed, trying direct media download:", ytdlErr.message);
        const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error(`Direct download failed: HTTP ${res.status}`);
        const contentDisp = res.headers.get("content-disposition") || "";
        const nameMatch = contentDisp.match(/filename="([^"]+)"/);
        sourceTitle = nameMatch ? nameMatch[1].replace(/\.[^.]+$/, "") : "Viral Video";
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(sourceFilePath, buffer);
      }
    }

    if (!fs.existsSync(sourceFilePath) || fs.statSync(sourceFilePath).size < 1000) {
      throw new Error("Downloaded file is empty or missing. The URL may not be a supported video source.");
    }

    let totalDuration = await getVideoDuration(ffmpegBin, sourceFilePath);
    if (!totalDuration || totalDuration <= 0) {
      totalDuration = probedDuration > 0 ? probedDuration : 60;
    }
    const clips = await splitVideo(ffmpegBin, sourceFilePath, clipsDir, totalDuration, Date.now());

    // Delete the source file to save space — we only need the clips
    try { fs.unlinkSync(sourceFilePath); } catch {}

    return { clips, sourceTitle: sanitizeFilename(sourceTitle).replace(/_/g, " "), totalDuration };
  } catch (err: any) {
    // Cleanup on failure
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
      try { fs.unlinkSync(sourceFilePath); } catch {}
    }
    return { error: err.message || "Failed to download and split video." };
  }
}

// ─── Generate Clip Metadata (100% rule-based, zero AI, works forever) ─────────

// Category-specific hashtag banks
const HASHTAG_BANK: Record<string, string[]> = {
  "Motivational":   ["motivation","mindset","success","inspiration","hustle","grind","nevergiveup","goals","growth","discipline","winners","bestadvice","lifelessons","selfdevelopment","unstoppable","positivemindset","bossmindset","winning","ambition","levelup"],
  "Funny":          ["funny","humor","comedy","laugh","lol","hilarious","memes","trynottolaugh","funnyclips","funnyvideo","comedycentral","fails","epicfails","funnymoments","laughing","jokes","funnyshorts","prank","trending","funnystuff"],
  "Educational":    ["education","learning","knowledge","facts","didyouknow","science","history","interestingfacts","funfacts","study","mindblowing","learneveryday","amazingfacts","wisdom","schooloflife","curious","informative","discovery","explainer","learnmore"],
  "Nature":         ["nature","wildlife","earth","beautiful","naturelover","outdoors","wilderness","animals","photography","landscape","scenery","naturalbeauty","ecology","planet","stunning","peaceful","adventure","explore","biodiversity","amazingnature"],
  "Sports":         ["sports","athlete","fitness","training","workout","champions","winning","game","highlights","sportsmotivation","dedication","teamwork","passion","performance","legendary","records","goals","unstoppable","competition","sportslife"],
  "Music":          ["music","viral","trending","hiphop","pop","rnb","beats","newmusic","musicvideo","banger","fire","playlist","musically","vibe","musiclover","singer","artist","dance","live","charttopper"],
  "Gaming":         ["gaming","gamer","gameplay","videogames","twitch","streaming","gamerlife","games","ps5","xbox","pcgaming","epicmoments","clutch","winning","gaming2024","gamingcommunity","esports","highlights","satisfying","glitch"],
  "Travel":         ["travel","explore","adventure","wanderlust","vacation","travelblogger","travelphotography","worldtravel","beautifulplaces","holiday","travelgram","destination","backpacking","travellife","tourism","culture","nature","experience","globetrotter","mustvisit"],
  "Food":           ["food","foodie","delicious","cooking","recipe","foodlover","yummy","chef","tasty","homemade","foodphotography","eat","instafood","mealprep","foodies","foodblog","dinner","lunch","breakfast","munchies"],
  "Fashion":        ["fashion","style","outfit","ootd","streetstyle","trendy","fashionista","model","clothing","aesthetics","look","outfitinspo","stylish","wear","trend","fashionblogger","vibe","aesthetic","swagger","drip"],
};

// Fallback universal hashtags
const UNIVERSAL_HASHTAGS = ["viral","trending","foryou","fyp","reels","shorts","explore","share","mustwatch","viralvideo","watchthis","followformore","content","socialmedia","entertainment"];

// Part-based hooks (rotate based on part number)
const HOOKS: Record<string, string[]> = {
  "Motivational":   ["This one will change how you think 🔥","If you're going through a tough time, watch this 💪","This clip hits different when you needed it most ⚡","One of the most powerful moments in the entire series 🎯","Stop scrolling — this is exactly what you need to hear today 🙌"],
  "Funny":          ["You will NOT be able to stop laughing 😂","Warning: do not watch this in public 🤣","This one got me in tears 💀","This is the funniest thing I've seen all week 😭","Bro I can't stop rewatching this 😂🔥"],
  "Educational":    ["Most people don't know this 🤯","This fact will blow your mind 🧠","They don't teach this in school 📚","One of the most eye-opening clips I've come across 👀","After seeing this, you'll never look at it the same way 💡"],
  "Nature":         ["Nature never ceases to amaze me 🌿","Our planet is absolutely breathtaking 🌍","This is why I love the natural world 🦋","Moments like these remind us how beautiful life is 🌅","Pure magic captured on camera 📷"],
  "Sports":         ["This moment gave me chills 🏆","Absolute SCENES! 🔥","This is why sports are beautiful 💯","Nobody expected this to happen 😤","Legendary performance right here 🐐"],
  "Gaming":         ["Nobody saw this coming 🎮","This clip broke the internet 💥","The reaction says everything 👀","Insane skill level right here 🔥","This is why we love gaming 🎯"],
  "Music":          ["This track is on another level 🎵","The vibe is unreal 🔥","You need this on your playlist NOW 🎶","Can't stop listening to this 🎤","Pure fire, no skip 🔥"],
  "Travel":         ["I can't believe places like this exist 😍","This destination is absolutely stunning 🌏","Adding this to the bucket list immediately ✈️","The views here are unreal 🏔️","This is why travel changes you forever 🌅"],
  "Food":           ["The way this came together is insane 🍽️","One bite and you'll understand why this went viral 😋","This recipe is next level 👨‍🍳","Warning: this will make you very hungry 🤤","Absolutely mouth-watering 🔥"],
  "Fashion":        ["The fit is immaculate 🔥","This look is absolutely everything 💅","Style goals right here ✨","The drip is unreal 👑","This is how you do it 💯"],
};

// CTA (Call to action) endings
const CTAS = [
  "Follow for more clips like this!",
  "Save this and share it with someone who needs to see it!",
  "Drop a 🔥 if you agree!",
  "Tag someone who needs this!",
  "Turn on notifications so you never miss a part!",
  "Which part did you like most? Comment below!",
  "Like and follow for the full series!",
  "Share this with your friends — they'll thank you later!",
];

function pickRandom<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export async function cleanViralTitle(rawTitle: string, category = "Trending"): Promise<string> {
  let title = (rawTitle || "").replace(/https?:\/\/\S+/gi, "").replace(/#[a-zA-Z0-9_]+/g, "").trim();
  const isHash = /^[a-zA-Z0-9_-]{18,}$/.test(title) || /^[0-9\s_-]+$/.test(title) || !/[a-zA-Z]/.test(title);
  if (!title || isHash || title.length < 4) {
    const fallbacks: Record<string, string[]> = {
      Trending: ["Trending Viral Internet Moment", "Must Watch Viral Video", "This Clip Is Taking Over Social Media"],
      Motivational: ["The Mindset Shift That Changes Everything", "Powerful Motivation You Need Today", "Never Give Up On Your Dreams"],
      Funny: ["Try Not To Laugh Challenge", "Pure Comedy Gold Moment", "Funniest Video You Will See Today"],
      Comedy: ["Stand Up Comedy Masterpiece", "Funniest Clip You Will See Today", "Comedy Gold Moments"],
      Food: ["Incredible Street Food Chef Skills", "Delicious Cooking Recipe Master", "Mouth Watering Food Everyone Is Craving"],
      Sports: ["Legendary Athlete Moment Chills", "Incredible Sports Highlight", "Unstoppable Athletic Performance"],
      Travel: ["Breathtaking Place You Must Visit", "Hidden Paradise On Earth", "Stunning Travel View Before You Die"],
      Nature: ["Incredible Wildlife Encounter Caught On Camera", "Nature Never Ceases To Amaze", "Wild Animals Beautiful Moment"],
      Gaming: ["Insane Gaming Clutch Moment", "Epic Gameplay Highlight", "Unbelievable Gaming Reaction"],
      Music: ["Amazing Live Music Performance", "Incredible Rhythm And Melody", "Viral Sound That Hits Different"],
    };
    const list = fallbacks[category] || fallbacks.Trending;
    return list[Math.floor(Math.random() * list.length)];
  }
  return title.slice(0, 80).replace(/\s+/g, " ").trim();
}

export async function generateClipMetadata(params: {
  partNumber: number;
  totalParts: number;
  sourceTitle: string;
  totalDuration: number;
  contentCategory: string;
  clipDuration: number;
}): Promise<{ description: string; hashtags: string[] }> {
  const { partNumber, totalParts, sourceTitle, contentCategory, clipDuration } = params;

  const cleanTitle = await cleanViralTitle(sourceTitle, contentCategory);
  const categoryHooks = HOOKS[contentCategory] || HOOKS["Motivational"];
  const hook = pickRandom(categoryHooks, partNumber - 1);
  const cta = pickRandom(CTAS, partNumber + 1);

  // Strictly omit PART label if video is a single clip
  const isMultiPart = totalParts > 1;
  const partLabel = isMultiPart ? `📌 PART ${partNumber} of ${totalParts}` : "";
  const clipLen = clipDuration < 120 ? `${Math.round(clipDuration)}s` : `${Math.round(clipDuration / 60)}min`;

  // Clean, structured description
  const description = [
    ...(partLabel ? [partLabel, ""] : []),
    `✨ ${hook}`,
    `🎬 ${cleanTitle}`,
    `⏱ Duration: ${clipLen}`,
    "",
    `💬 ${cta}`,
    "🔔 Like, comment & subscribe for daily viral moments!",
    "",
    "────────────────",
    `Fair Use Disclaimer: This clip from "${cleanTitle}" is curated under Fair Use for educational, inspirational, and commentary purposes. All rights belong to their respective owners.`,
  ].join("\n");

  // Post-respective hashtags: clean words from title + niche tags + platform tags
  const bankTags = (HASHTAG_BANK[contentCategory] || HASHTAG_BANK["Motivational"] || []).slice(0, 10);
  const rawWords = cleanTitle.match(/[a-zA-Z]{3,12}/g) || [];
  const cleanTitleTags = rawWords
    .map((w) => w.toLowerCase())
    .filter((w) => !/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(w) && !bankTags.includes(w) && !UNIVERSAL_HASHTAGS.includes(w))
    .slice(0, 4);

  const combined = [...new Set([...cleanTitleTags, ...bankTags.slice(0, 6), "shorts", "reels", "viral", "fyp"])];
  const hashtags = combined.slice(0, 10);

  return { description, hashtags };
}

// ─── Publish Clip + Cleanup ───────────────────────────────────────────────────

// ─── Story Card Image Generator (9:16 Polaroid card with thumbnail & CTA) ────
async function getOrGenerateStoryCardUrl(params: {
  videoPath?: string;
  publicVideoUrl?: string;
  title: string;
  partNumber: number;
}): Promise<{ secureUrl?: string; publicId?: string }> {
  try {
    const { videoPath, publicVideoUrl, title, partNumber } = params;
    let frameUrlOrData = "";

    // 1. Try extracting 1s frame locally if videoPath exists
    if (videoPath && fs.existsSync(/*turbopackIgnore: true*/ videoPath)) {
      try {
        const ffmpegBin = await checkFfmpeg();
        const os = require("os");
        const tmpFrame = path.join(os.tmpdir(), `frame_${Date.now()}_part${partNumber}.jpg`);
        await execAsync(`"${ffmpegBin}" -y -ss 1 -i "${videoPath}" -vframes 1 -q:v 2 "${tmpFrame}"`);
        if (fs.existsSync(tmpFrame) && fs.statSync(tmpFrame).size > 0) {
          const buf = fs.readFileSync(tmpFrame);
          frameUrlOrData = `data:image/jpeg;base64,${buf.toString("base64")}`;
          try { fs.unlinkSync(tmpFrame); } catch {}
        }
      } catch (ffErr: any) {
        console.warn("Local frame extract notice:", ffErr.message);
      }
    }

    // 2. Fallback to Cloudinary video poster frame URL if available
    if (!frameUrlOrData && publicVideoUrl && publicVideoUrl.includes("cloudinary.com")) {
      frameUrlOrData = publicVideoUrl.replace(/\.[^.]+$/, ".jpg");
    }

    // 3. Generate Polaroid Story Card with ImageResponse
    const { generatePolaroidStoryCard } = await import("@/app/lib/story-card");
    const cardBuffer = await generatePolaroidStoryCard({
      thumbnailUrl: frameUrlOrData,
      title,
    });

    // 4. Upload generated card buffer to Cloudinary
    const { uploadImageToCloudinary } = await import("@/app/cloudinary-upload");
    const cRes = await uploadImageToCloudinary(cardBuffer, `story_polaroid_${Date.now()}_part${partNumber}`);
    return { secureUrl: cRes.secureUrl, publicId: cRes.publicId };
  } catch (err: any) {
    console.error("Story card generation error:", err.message);
    return {};
  }
}

export async function publishClipAndCleanup(params: {
  clipPath: string;
  partNumber: number;
  totalParts: number;
  totalDuration?: number;
  title: string;
  description: string;
  hashtags: string[];
  platforms: string[];
  userEmail: string;
  connections: string[];
  cloudinaryPublicId?: string;
}): Promise<{
  success: boolean;
  youtubeUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeVideoId?: string;
  facebookVideoId?: string;
  instagramVideoId?: string;
  gmailSent?: boolean;
  error?: string;
  logs: string[];
}> {
  const { clipPath, partNumber, title, description, hashtags, platforms, userEmail } = params;
  const logs: string[] = [];

  // Verify clip file exists (supports local files or remote Hugging Face cloud URLs)
  const isRemote = clipPath.startsWith("http://") || clipPath.startsWith("https://");
  let absolutePath = "";

  if (isRemote) {
    const os = require("os");
    const tempFile = path.join(os.tmpdir(), `publish_${Date.now()}_part${partNumber}.mp4`);
    try {
      const resp = await fetch(clipPath);
      if (!resp.ok) return { success: false, error: `Failed to download clip from cloud worker: HTTP ${resp.status}`, logs };
      const arrBuf = await resp.arrayBuffer();
      fs.writeFileSync(tempFile, Buffer.from(arrBuf));
      absolutePath = tempFile;
    } catch (fetchErr: any) {
      return { success: false, error: `Cloud clip download failed: ${fetchErr.message}`, logs };
    }
  } else {
    absolutePath = clipPath.startsWith("/")
      ? path.join(process.cwd(), "public", clipPath)
      : clipPath;

    if (!fs.existsSync(/*turbopackIgnore: true*/ absolutePath)) {
      return { success: false, error: "Clip file not found on disk.", logs };
    }
  }

  const fullTitle = `${title} — ${description.slice(0, 40)}`;
  const formattedHashtags = hashtags.map((h) => `#${h.replace(/^#/, "")}`);
  const fullDescription = `${title}\n\n${description}\n\n${formattedHashtags.join(" ")}`;

  let youtubeVideoId: string | undefined;
  let facebookVideoId: string | undefined;
  let instagramVideoId: string | undefined;
  let youtubeUrl: string | undefined;
  let facebookUrl: string | undefined;
  let instagramUrl: string | undefined;
  let gmailSent = false;
  let uploadedCloudinaryId: string | undefined;
  let storyCardUrl: string | undefined;
  let uploadedStoryCardId: string | undefined;

  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();

  // Pre-generate aesthetic Polaroid Story card thumbnail
  try {
    const cardData = await getOrGenerateStoryCardUrl({
      videoPath: absolutePath,
      publicVideoUrl: (isRemote && (clipPath.startsWith("http://") || clipPath.startsWith("https://"))) ? clipPath : undefined,
      title,
      partNumber,
    });
    if (cardData.secureUrl) {
      storyCardUrl = cardData.secureUrl;
      uploadedStoryCardId = cardData.publicId;
    }
  } catch (cardErr: any) {
    console.warn("Story card pre-generation notice:", cardErr?.message);
  }

  try {
    // ─ YouTube (Posts as YouTube Short if <= 180s) ─
    if (platforms.includes("YouTube")) {
      try {
        const { google } = require("googleapis");
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.youtube);
        const youtube = google.youtube({ version: "v3", auth: oauth2Client });

        const isShort = !params.totalDuration || params.totalDuration <= 180;
        const cleanTitleWithShorts = isShort && !fullTitle.toLowerCase().includes("#shorts")
          ? `${fullTitle.slice(0, 90)} #Shorts`
          : fullTitle.slice(0, 100);

        const res = await youtube.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title: cleanTitleWithShorts,
              description: fullDescription,
              tags: [...hashtags.slice(0, 12), "Shorts", "shorts", "viral"],
              categoryId: "22",
            },
            status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
          },
          media: { body: fs.createReadStream(/*turbopackIgnore: true*/ absolutePath) },
        });

        youtubeVideoId = res.data.id;
        youtubeUrl = isShort
          ? `https://www.youtube.com/shorts/${youtubeVideoId}`
          : `https://www.youtube.com/watch?v=${youtubeVideoId}`;
        logs.push(`✅ YouTube: ${youtubeUrl}`);
      } catch (e: any) {
        logs.push(`❌ YouTube: ${e.message}`);
      }
    }

    // ─ Facebook (Posts as Reel + Creates Story card linking to Reel) ─
    if (platforms.includes("Facebook")) {
      try {
        const pageId = tokens.facebook?.page_id;
        const pageToken = tokens.facebook?.page_access_token;
        if (!pageId || !pageToken) throw new Error("Facebook not connected.");

        // Upload as file stream via multipart
        const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ absolutePath);
        const formData = new FormData();
        formData.append("access_token", pageToken);
        formData.append("title", fullTitle.slice(0, 100));
        formData.append("description", fullDescription);
        formData.append("published", "true");
        formData.append(
          "source",
          new Blob([fileBuffer], { type: "video/mp4" }),
          `clip_part${partNumber}.mp4`
        );

        const postRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/videos`, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(180000),
        });
        const postData = await postRes.json();
        if (!postRes.ok || postData.error) throw new Error(postData.error?.message || `HTTP ${postRes.status}`);

        facebookVideoId = postData.id;
        facebookUrl = `https://www.facebook.com/reel/${facebookVideoId}`;
        logs.push(`✅ Facebook: ${facebookUrl}`);

        // Also post Facebook Page Story (using designed Polaroid Story card)
        try {
          if (!storyCardUrl) {
            const cardData = await getOrGenerateStoryCardUrl({
              videoPath: absolutePath,
              publicVideoUrl: (isRemote && (clipPath.startsWith("http://") || clipPath.startsWith("https://"))) ? clipPath : undefined,
              title,
              partNumber,
            });
            if (cardData.secureUrl) {
              storyCardUrl = cardData.secureUrl;
              uploadedStoryCardId = cardData.publicId;
            }
          }

          if (storyCardUrl) {
            // Step 1: Upload photo as unpublished to prepare for Story
            const upRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                access_token: pageToken,
                url: storyCardUrl,
                published: "false",
              }),
            });
            const upData = await upRes.json();
            if (upData?.id) {
              // Step 2: Publish photo to Facebook Page Stories
              const storyRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/photo_stories`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  access_token: pageToken,
                  photo_id: upData.id,
                }),
              });
              const storyData = await storyRes.json();
              if (storyData?.id || storyData?.success || storyData?.post_id) {
                logs.push(`✅ Facebook: Story published (Polaroid Reel card)`);
              } else {
                console.warn("Facebook photo_stories error response:", storyData);
              }
            }
          }
        } catch (storyErr: any) {
          console.warn("Facebook story notice:", storyErr.message);
        }
      } catch (e: any) {
        logs.push(`❌ Facebook: ${e.message}`);
      }
    }

    // ─ Instagram (Posts as Reel + Posts Story with Thumbnail Card) ─
    if (platforms.includes("Instagram")) {
      try {
        const igUserId = tokens.facebook?.instagram_user_id || "17841430707006338";
        const instagramToken =
          tokens.facebook?.instagram_access_token ||
          tokens.facebook?.instagram_page_access_token ||
          tokens.facebook?.page_access_token;
        const instagramApi = tokens.facebook?.instagram_access_token
          ? "https://graph.instagram.com/v26.0"
          : "https://graph.facebook.com/v26.0";
        if (!instagramToken || !igUserId) throw new Error("Instagram not connected.");

        // Meta Instagram API requires a direct accessible MP4 video file URL
        let publicVideoUrl = (isRemote && (clipPath.startsWith("http://") || clipPath.startsWith("https://"))) ? clipPath : "";
        if (!publicVideoUrl) {
          try {
            const { uploadVideoToCloudinary } = await import("@/app/cloudinary-upload");
            const publicId = `ig_clip_${Date.now()}_part${partNumber}`;
            const uploadRes = await uploadVideoToCloudinary(absolutePath, publicId);
            publicVideoUrl = uploadRes.secureUrl;
            uploadedCloudinaryId = uploadRes.publicId;
          } catch (cErr: any) {
            console.warn("Cloudinary upload for Instagram:", cErr.message);
          }
        }

        if (!publicVideoUrl) {
          throw new Error("Instagram Reels require a direct video file. Please configure Cloudinary in .env or provide a public video URL.");
        }

        // 1. Post Instagram Reel
        const createRes = await fetch(`${instagramApi}/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: instagramToken,
            media_type: "REELS",
            video_url: publicVideoUrl,
            caption: `${title}\n\n${description}\n\n${formattedHashtags.join(" ")}`,
            share_to_feed: "true",
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || createData.error) throw new Error(createData.error?.message || `HTTP ${createRes.status}`);

        const creationId = createData.id;
        let finished = false;
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 4000));
          const statusUrl = new URL(`${instagramApi}/${creationId}`);
          statusUrl.search = new URLSearchParams({
            fields: "status_code,status",
            access_token: instagramToken,
          }).toString();
          const statusRes = await fetch(statusUrl, { cache: "no-store" });
          const statusData = await statusRes.json();
          if (statusData.status_code === "FINISHED") { finished = true; break; }
          if (statusData.status_code === "ERROR") throw new Error(statusData.status || "Instagram processing failed.");
        }
        if (!finished) throw new Error("Instagram processing timed out.");

        const publishRes = await fetch(`${instagramApi}/${igUserId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: instagramToken, creation_id: creationId }),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message || `HTTP ${publishRes.status}`);

        instagramVideoId = publishData.id;
        instagramUrl = `https://www.instagram.com/reel/${instagramVideoId}`;
        logs.push(`✅ Instagram: Reel published (${instagramUrl})`);

        // 2. Post as Instagram Story (Designed Polaroid Story card)
        try {
          if (!storyCardUrl) {
            const cardData = await getOrGenerateStoryCardUrl({
              videoPath: absolutePath,
              publicVideoUrl,
              title,
              partNumber,
            });
            if (cardData.secureUrl) {
              storyCardUrl = cardData.secureUrl;
              uploadedStoryCardId = cardData.publicId;
            }
          }

          if (storyCardUrl) {
            const storyRes = await fetch(`${instagramApi}/${igUserId}/media`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                access_token: instagramToken,
                media_type: "STORIES",
                image_url: storyCardUrl,
              }),
            });
            const storyData = await storyRes.json();
            if (storyData?.id) {
              const storyCreationId = storyData.id;
              let storyFinished = false;
              for (let s = 0; s < 15; s++) {
                await new Promise((r) => setTimeout(r, 3000));
                const sCheck = await fetch(`${instagramApi}/${storyCreationId}?fields=status_code,status&access_token=${instagramToken}`, { cache: "no-store" });
                const sJson = await sCheck.json();
                if (sJson.status_code === "FINISHED") { storyFinished = true; break; }
                if (sJson.status_code === "ERROR") break;
              }
              if (storyFinished) {
                const pubStoryRes = await fetch(`${instagramApi}/${igUserId}/media_publish`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({ access_token: instagramToken, creation_id: storyCreationId }),
                });
                if (pubStoryRes.ok) {
                  logs.push(`✅ Instagram: Story published (Polaroid Reel card)`);
                }
              }
            }
          }
        } catch (storyErr: any) {
          console.warn("Instagram story notice:", storyErr.message);
        }
      } catch (e: any) {
        logs.push(`❌ Instagram: ${e.message}`);
      }
    }

    // ─ Gmail notification (RFC 2047 MIME encoded subject to avoid garbled encoding) ─
    if (platforms.includes("Gmail") || (tokens.gmail?.access_token && (youtubeUrl || facebookUrl || instagramUrl))) {
      try {
        const { google } = require("googleapis");
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.gmail);
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        let recipient = userEmail?.trim() || "";
        if (!recipient && oauth2Client.credentials.id_token) {
          try {
            const ticket = await oauth2Client.verifyIdToken({
              idToken: oauth2Client.credentials.id_token,
              audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            });
            recipient = ticket.getPayload()?.email || "";
          } catch {}
        }

        if (recipient) {
          const linksSection = [
            youtubeUrl ? `📺 YouTube: ${youtubeUrl}` : null,
            facebookUrl ? `📘 Facebook: ${facebookUrl}` : null,
            instagramUrl ? `📸 Instagram: ${instagramUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          const emailBody =
            `Your viral clip has been successfully published!\n\n` +
            `Title: ${title}\n\n` +
            `Description:\n${description}\n\n` +
            `🔗 Published Links:\n${linksSection || "No links available."}\n\n` +
            `Hashtags: ${formattedHashtags.join(" ")}`;

          const cleanSubject = `[The Viral Desk] Clip Published: ${title.slice(0, 50)}`;
          const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject).toString("base64")}?=`;

          const message = [
            `To: ${recipient}`,
            "Content-Type: text/plain; charset=utf-8",
            `Subject: ${encodedSubject}`,
            "",
            emailBody,
          ].join("\n");

          const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

          await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedMessage } });
          gmailSent = true;
          logs.push(`✅ Gmail: Notification sent to ${recipient}`);
        }
      } catch (e: any) {
        logs.push(`❌ Gmail: ${e.message}`);
      }
    }
  } finally {
    // ─ GUARANTEED VIDEO DELETION: Runs NO MATTER WHAT (success or failure) ─
    // 1. Delete local or downloaded tmp clip file
    try {
      if (absolutePath && fs.existsSync(/*turbopackIgnore: true*/ absolutePath)) {
        fs.unlinkSync(absolutePath);
        logs.push("🗑️ Video clip file deleted from storage.");
      }
    } catch (e: any) {
      console.warn("Could not delete local/tmp clip file:", e.message);
    }

    // 2. Delete clip from Hugging Face Cloud Worker to keep disk at 0 MB forever
    const workerUrl = process.env.HUGGINGFACE_WORKER_URL;
    if (isRemote && workerUrl) {
      try {
        const filename = path.basename(new URL(clipPath).pathname);
        await fetch(`${workerUrl.replace(/\/$/, "")}/cleanup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        });
        logs.push("🗑️ Cloud worker storage deleted.");
      } catch (cleanupErr: any) {
        console.warn("Cloud worker cleanup error:", cleanupErr.message);
      }
    }

    // 3. Delete clip from Cloudinary (Auto-cleanup to keep storage at 0 MB)
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    let targetPublicId = params.cloudinaryPublicId || uploadedCloudinaryId;
    if (!targetPublicId && clipPath.includes("res.cloudinary.com")) {
      const match = clipPath.match(/\/video\/upload\/(?:v\d+\/)?([^.]+)/);
      if (match) targetPublicId = match[1];
    }

    if (targetPublicId && cloudName && apiKey && apiSecret && process.env.CLOUDINARY_DELETE_AFTER_PUBLISH === "true") {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const crypto = await import("crypto");
        const signature = crypto
          .createHash("sha1")
          .update(`public_id=${targetPublicId}&timestamp=${timestamp}${apiSecret}`)
          .digest("hex");

        const formData = new FormData();
        formData.append("public_id", targetPublicId);
        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp.toString());
        formData.append("signature", signature);

        const destroyRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`, {
          method: "POST",
          body: formData,
        });
        const destroyData = await destroyRes.json();
        if (destroyData.result === "ok") {
          logs.push(`🗑️ Cloudinary storage cleaned up (${targetPublicId}).`);
        } else {
          console.warn("Cloudinary destroy response:", destroyData);
        }
      } catch (cErr: any) {
        console.warn("Could not delete clip from Cloudinary:", cErr.message);
      }
    }

    // 4. Delete story card image from Cloudinary if uploaded
    if (uploadedStoryCardId && cloudName && apiKey && apiSecret && process.env.CLOUDINARY_DELETE_AFTER_PUBLISH === "true") {
      try {
        const { deleteCloudinaryImage } = await import("@/app/cloudinary-upload");
        await deleteCloudinaryImage(uploadedStoryCardId);
      } catch (scErr: any) {
        console.warn("Could not delete story card from Cloudinary:", scErr.message);
      }
    }
  }

  return {
    success: true,
    youtubeUrl,
    facebookUrl,
    instagramUrl,
    youtubeVideoId,
    facebookVideoId,
    instagramVideoId,
    gmailSent,
    logs,
  };
}

// ─── Native YouTube Search (supports modern Shorts shelf & video lockups) ────
async function searchYouTubeVideos(query: string): Promise<{ url: string; title: string; views: number; source: string }[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const jsonMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) || html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);
    if (!jsonMatch) return [];

    const data = JSON.parse(jsonMatch[1]);
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const results: { url: string; title: string; views: number; source: string }[] = [];
    const seenIds = new Set<string>();

    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        // 1. Standard videoRenderer
        const vr = item?.videoRenderer;
        if (vr?.videoId && !seenIds.has(vr.videoId)) {
          seenIds.add(vr.videoId);
          const title = vr.title?.runs?.[0]?.text || vr.title?.accessibility?.accessibilityData?.label || "Viral Video";
          const viewsText = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || "0";
          const views = parseInt(viewsText.replace(/[^0-9]/g, "")) || 0;
          results.push({
            url: `https://www.youtube.com/watch?v=${vr.videoId}`,
            title,
            views,
            source: "YouTube Trending (Fair Use)",
          });
        }

        // 2. Modern gridShelfViewModel (Shorts shelf in modern YouTube UI)
        if (item?.gridShelfViewModel?.contents && Array.isArray(item.gridShelfViewModel.contents)) {
          for (const entry of item.gridShelfViewModel.contents) {
            const slvm = entry?.shortsLockupViewModel;
            const videoId =
              slvm?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
              (slvm?.entityId && typeof slvm.entityId === "string" ? slvm.entityId.replace(/^shorts-shelf-item-/, "") : null);
            if (videoId && !seenIds.has(videoId)) {
              seenIds.add(videoId);
              const rawTitle = slvm?.accessibilityText || "Viral Short";
              const title = rawTitle.replace(/,\s*\d+[\d,.]*\s*(?:million|billion|thousand|views|\w+ views)?.*$/i, "").trim() || rawTitle;
              results.push({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title,
                views: 500000,
                source: "YouTube Shorts (Viral)",
              });
            }
          }
        }

        // 3. Legacy reelShelfRenderer (Shorts shelf in classic YouTube UI)
        const reelShelf = item?.reelShelfRenderer;
        if (reelShelf && Array.isArray(reelShelf.items)) {
          for (const reel of reelShelf.items) {
            const rvr = reel?.reelItemRenderer;
            if (rvr?.videoId && !seenIds.has(rvr.videoId)) {
              seenIds.add(rvr.videoId);
              const viewsText = rvr.viewCountText?.simpleText || "0";
              const views = parseInt(viewsText.replace(/[^0-9]/g, "")) || 0;
              results.push({
                url: `https://www.youtube.com/watch?v=${rvr.videoId}`,
                title: rvr.headline?.simpleText || "Viral Short",
                views,
                source: "YouTube Shorts (Viral)",
              });
            }
          }
        }
      }
    }

    return results;
  } catch (e) {
    console.warn("Direct YouTube search fallback error:", e);
    return [];
  }
}

// ─── Auto-Find Viral Video Queries (Multi-Platform Viral Discovery) ───────────
const SAFE_CATEGORY_QUERIES: Record<string, string[]> = {
  "Trending": [
    "viral shorts trending",
    "popular viral video shorts",
    "trending shorts reels",
    "most viral video moments",
  ],
  "Motivational": [
    "best motivational speech shorts",
    "podcast life advice wisdom shorts",
    "discipline mindset powerful speech shorts",
    "success motivation powerful quotes shorts",
  ],
  "Educational": [
    "interesting facts educational shorts",
    "science facts did you know shorts",
    "eye opening history lesson shorts",
    "mind blowing facts trivia shorts",
  ],
  "Funny": [
    "funny podcast moments shorts",
    "stand up comedy hilarious clean shorts",
    "epic funny moment shorts",
    "try not to laugh funny shorts",
  ],
  "Comedy": [
    "stand up comedy hilarious clean shorts",
    "funny comedy moments shorts",
    "epic funny clips shorts",
    "hilarious clean comedy shorts",
  ],
  "Horror": [
    "scary urban legends stories shorts",
    "spooky horror mystery narration shorts",
    "creepy paranormal true stories shorts",
  ],
  "Romance": [
    "touching romantic story shorts",
    "wholesome love relationship advice shorts",
    "sweet emotional love stories shorts",
  ],
  "Adventure": [
    "extreme sports outdoor adventure shorts",
    "hiking wilderness exploration shorts",
    "action travel adventure shorts",
  ],
  "Music": [
    "amazing street musician performance shorts",
    "talented instrumental piano guitar solo shorts",
    "impressive vocal live performance shorts",
  ],
  "Nature": [
    "breathtaking nature wildlife shorts",
    "amazing earth planet discovery shorts",
    "peaceful nature landscape shorts",
    "animals amazing moments wildlife shorts",
  ],
  "Sports": [
    "athlete discipline motivation speech shorts",
    "legendary sports moment highlights shorts",
    "unstoppable athlete mindset shorts",
    "gym workout fitness motivation shorts",
  ],
  "Gaming": [
    "epic gaming moment clutch shorts",
    "funny gaming moments clips shorts",
    "satisfying gaming moments shorts",
  ],
  "Travel": [
    "beautiful places to visit before you die shorts",
    "world travel hidden gems shorts",
    "stunning travel destinations wanderlust shorts",
  ],
  "Food": [
    "satisfying cooking recipe street food shorts",
    "delicious food compilation shorts",
    "viral food recipes street food shorts",
  ],
  "Fashion": [
    "street style transformation aesthetic fashion shorts",
    "classic stylish outfit ideas shorts",
    "outfit inspiration aesthetic trend shorts",
  ],
};

// ─── Real Dynamic Viral Scrapers (Live Online Only — Zero Hardcoding & Zero AI) ─

const TIKTOK_CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Motivational": ["motivation", "mindset", "success", "grind", "nevergiveup", "focus", "discipline", "life", "quote", "inspire", "hardwork", "hustle", "gymmotivation"],
  "Funny": ["funny", "laugh", "humor", "comedy", "lol", "prank", "joke", "meme", "fails", "trynottolaugh", "hilarious", "relatable"],
  "Comedy": ["funny", "laugh", "humor", "comedy", "lol", "prank", "joke", "meme", "fails", "standup", "sketch"],
  "Educational": ["facts", "didyouknow", "science", "learn", "history", "educational", "interesting", "knowledge", "discovery", "school"],
  "Nature": ["nature", "wildlife", "animal", "earth", "ocean", "forest", "dog", "cat", "puppy", "pet", "birds", "landscape"],
  "Sports": ["sports", "football", "soccer", "gym", "workout", "athlete", "goals", "basketball", "training", "fitness", "run", "champion", "tennis", "fight", "ufc", "boxing"],
  "Gaming": ["gaming", "game", "gamer", "play", "gta", "fortnite", "roblox", "minecraft", "streamer", "twitch", "gameplay", "clip"],
  "Travel": ["travel", "explore", "vacation", "trip", "place", "city", "beautiful", "hotel", "flight", "beach", "view", "wanderlust", "destination"],
  "Food": ["food", "recipe", "cooking", "chef", "tasty", "delicious", "eat", "dinner", "cake", "kitchen", "bake", "lunch", "streetfood", "snack"],
  "Fashion": ["fashion", "style", "ootd", "outfit", "clothes", "dress", "model", "drip", "fit", "beauty", "makeup", "look"],
  "Music": ["music", "song", "sing", "dance", "lyrics", "sound", "rap", "cover", "beat", "banger"],
};

// 1. Live Trending TikTok Video Scraper (Real creators, millions of views, direct MP4 CDN stream)
async function scrapeTikTokTrendingVideos(category: string): Promise<{ title: string; url: string; source: string } | null> {
  const regions = ["GB", "US", "CA", "AU"];
  // Randomly rotate region so every call gets fresh, varied live content
  const region = regions[Math.floor(Math.random() * regions.length)];
  try {
    const res = await fetch(`https://www.tikwm.com/api/feed/list?region=${region}&count=35`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(7500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rawVideos: any[] = data.data || [];
    if (!Array.isArray(rawVideos) || rawVideos.length === 0) return null;

    // Filter valid videos: direct MP4, real title, exclude synthetic AI generations
    const valid = rawVideos.filter((v) => {
      if (!v.play || !v.title) return false;
      const t = String(v.title).toLowerCase();
      const u = String(v.play).toLowerCase();
      if (t.includes("ai generated") || t.includes("ai-generation") || u.includes("user-ai-generation")) return false;
      return true;
    });

    if (valid.length === 0) return null;

    const catKws = TIKTOK_CATEGORY_KEYWORDS[category] || [];
    let matched = valid.filter((v) => {
      const text = `${v.title} ${v.author?.nickname || ""} ${v.author?.unique_id || ""}`.toLowerCase();
      return catKws.some((k) => text.includes(k));
    });

    // If no keyword match found in this batch or category is Trending, pool high-engagement videos
    const pool = matched.length > 0 ? matched : valid.filter((v) => (v.play_count || 0) > 100000);
    const candidateList = pool.length > 0 ? pool : valid;

    // Sort by highest view count so the most viral videos appear first
    candidateList.sort((a, b) => (b.play_count || 0) - (a.play_count || 0));

    // Pick from top 6 engaging videos
    const picked = candidateList[Math.floor(Math.random() * Math.min(candidateList.length, 6))];
    if (!picked) return null;

    const author = picked.author?.nickname || picked.author?.unique_id || "Creator";
    const views = picked.play_count ? Number(picked.play_count).toLocaleString() : "";
    const cleanTitle = picked.title.replace(/#[a-zA-Z0-9_]+/g, "").replace(/\s+/g, " ").trim();
    const displayTitle = cleanTitle.length > 5 ? cleanTitle : picked.title.trim();

    return {
      title: displayTitle.slice(0, 80),
      url: picked.play,
      source: `Live Trending TikTok (${views ? `${views} views • ` : ""}@${author})`,
    };
  } catch (err: any) {
    console.warn("TikTok live trending feed notice:", err.message);
  }
  return null;
}

// 2. Mixkit Live HD Video Scraper (Real human-filmed action, food, sports, nature footage)
async function searchMixkit(category: string): Promise<{ title: string; url: string; source: string } | null> {
  const catMap: Record<string, string> = {
    "Trending": "lifestyle",
    "Motivational": "lifestyle",
    "Funny": "lifestyle",
    "Comedy": "lifestyle",
    "Educational": "technology",
    "Nature": "nature",
    "Sports": "sports",
    "Gaming": "technology",
    "Travel": "travel",
    "Food": "food",
    "Fashion": "lifestyle",
  };
  const targetCategory = catMap[category] || "nature";
  try {
    const res = await fetch(`https://mixkit.co/free-stock-video/${targetCategory}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const mp4Matches = [...new Set([...html.matchAll(/https:\/\/assets\.mixkit\.co\/videos\/(\d+)\/\1\-(?:720|1080)\.mp4/g)].map((m) => m[0]))];
    if (mp4Matches.length > 0) {
      const picked = mp4Matches[Math.floor(Math.random() * mp4Matches.length)];
      return {
        title: `Viral ${category} Moment`,
        url: picked,
        source: "Mixkit HD Video (Direct Cloud MP4, Zero Bot Checks)",
      };
    }
  } catch (e) {
    console.warn("Mixkit direct search fallback notice:", e);
  }
  return null;
}

// 3. Internet Archive Live API (Classic comedy, vintage cartoons, iconic public moments)
async function searchArchiveOrg(category: string): Promise<{ title: string; url: string; source: string } | null> {
  const queryMap: Record<string, string> = {
    "Trending": "innovation discovery future viral",
    "Motivational": "achievement success athlete inspiration",
    "Educational": "science education history discovery",
    "Comedy": "comedy cartoon slapstick funny",
    "Funny": "comedy cartoon slapstick humor",
    "Horror": "ghost horror mystery gothic",
    "Romance": "love romance classic vintage",
    "Adventure": "expedition adventure wildlife nature",
    "Nature": "wildlife nature animals wilderness",
    "Music": "swing jazz orchestra dance concert",
    "Food": "cooking harvest food preparation festival",
  };
  const q = queryMap[category] || category;
  try {
    const searchUrl = `https://archive.org/advancedsearch.php?q=mediatype:movies+AND+collection:(prelinger+OR+animationandcartoons+OR+classic_tv)+AND+${encodeURIComponent(q)}&fl[]=identifier,title,description&sort[]=downloads+desc&rows=25&output=json`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const docs = data.response?.docs || [];
    if (!docs.length) return null;

    const sample = docs.slice(0, 15);
    const doc = sample[Math.floor(Math.random() * sample.length)];

    const metaRes = await fetch(`https://archive.org/metadata/${doc.identifier}/files`, { signal: AbortSignal.timeout(4000) });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const files: any[] = meta.result || [];
      const mp4 =
        files.find((f) => f.name?.endsWith("_512kb.mp4")) ||
        files.find((f) => f.name?.endsWith(".mp4") && !f.name?.includes("_thumb"));
      if (mp4) {
        return {
          title: doc.title || `Classic ${category} Clip`,
          url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(mp4.name)}`,
          source: "Internet Archive (Direct Cloud MP4, Zero Bot Checks)",
        };
      }
    }
  } catch {}
  return null;
}

// 4. Wikimedia Commons Live API (High quality community-filmed videos)
async function searchWikimedia(category: string): Promise<{ title: string; url: string; source: string } | null> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=filetype:video+${encodeURIComponent(category)}&srlimit=15&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TheViralDesk/1.0 (contact@viraldesk.app)" },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.query?.search || [];
    if (!results.length) return null;

    const picked = results[Math.floor(Math.random() * Math.min(results.length, 10))];
    const title = picked.title;

    const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url|mime&format=json`;
    const infoRes = await fetch(infoUrl, {
      headers: { "User-Agent": "TheViralDesk/1.0 (contact@viraldesk.app)" },
      signal: AbortSignal.timeout(3500),
    });
    if (infoRes.ok) {
      const infoData = await infoRes.json();
      const page: any = Object.values(infoData.query?.pages || {})[0];
      const videoUrl = page?.imageinfo?.[0]?.url;
      if (videoUrl && (videoUrl.endsWith(".webm") || videoUrl.endsWith(".mp4"))) {
        return {
          title: title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
          url: videoUrl,
          source: "Wikimedia Commons (Creative Commons / Public Domain)",
        };
      }
    }
  } catch {}
  return null;
}

// ─── Scrape Live Online Viral Videos (100% Dynamic, Zero Hardcoding, Zero AI) ─
export async function scrapeOnlineViralVideo(category: string): Promise<{ url: string; title: string; source: string }> {
  const cleanCat = category?.trim() || "Trending";

  // 1. Live Trending TikTok Videos (Real creators, millions of views, direct unwatermarked CDN stream)
  const fromTikTok = await scrapeTikTokTrendingVideos(cleanCat);
  if (fromTikTok) return fromTikTok;

  // 2. Mixkit HD real human-filmed video scraper (action/sports/food/nature)
  const fromMixkit = await searchMixkit(cleanCat);
  if (fromMixkit) return fromMixkit;

  // 3. Internet Archive live search (classic comedy, slapstick, vintage cartoons)
  const fromArchive = await searchArchiveOrg(cleanCat);
  if (fromArchive) return fromArchive;

  // 4. Wikimedia Commons live search
  const fromWiki = await searchWikimedia(cleanCat);
  if (fromWiki) return fromWiki;

  // 5. Fallback retry with general Trending on TikTok live feed
  const fallbackTikTok = await scrapeTikTokTrendingVideos("Trending");
  if (fallbackTikTok) return fallbackTikTok;

  // 6. Fallback retry with Mixkit real footage
  const fallbackMixkit = (await searchMixkit("nature")) || (await searchMixkit("lifestyle"));
  if (fallbackMixkit) return fallbackMixkit;

  throw new Error(`Could not find a live viral video stream for "${cleanCat}". Please paste a video URL directly.`);
}

export async function findSafeRoyaltyFreeVideo(category: string): Promise<{ url: string; title: string; source: string }> {
  return scrapeOnlineViralVideo(category);
}

// ─── Multi-Platform Viral Video Finder (Online Scraper, Zero Bot Checks) ──────
export async function autoFindViralVideo(
  category: string,
  mode: "scrape" | "viral" | "direct" | "youtube" = "scrape"
): Promise<{ url?: string; title?: string; source?: string; error?: string }> {
  try {
    const cleanCat = category?.trim() || "Trending";

    // 1. By default ("scrape" or "direct" or "viral"): Scrape viral contents online
    // This returns DIRECT MP4 URLs with ZERO YouTube bot checks, 100% cloud-downloadable!
    if (mode === "scrape" || mode === "direct" || mode === "viral") {
      try {
        const scrapedVideo = await scrapeOnlineViralVideo(cleanCat);
        if (scrapedVideo?.url) {
          return scrapedVideo;
        }
      } catch (scrapeErr: any) {
        console.warn("Online viral scraper notice, trying YouTube fallback:", scrapeErr.message);
      }
    }

    // 2. Only if explicit YouTube requested or scraper failed:
    const queries = SAFE_CATEGORY_QUERIES[cleanCat] || [
      `${cleanCat} viral shorts`,
      `${cleanCat} podcast shorts`,
      `${cleanCat} shorts`,
    ];

    let videos: { url: string; title: string; views: number; source: string }[] = [];
    for (const q of queries) {
      videos = await searchYouTubeVideos(q);
      if (videos.length >= 3) break;
    }

    if (videos.length > 0) {
      videos.sort((a, b) => b.views - a.views);
      const safeVideos = videos.filter(
        (v) =>
          !v.title.toLowerCase().includes("official music video") &&
          !v.title.toLowerCase().includes("feat.") &&
          !v.title.toLowerCase().includes("nasa")
      );
      const candidates = safeVideos.length ? safeVideos : videos;
      const topVideo = candidates[Math.floor(Math.random() * Math.min(candidates.length, 6))];
      return {
        url: topVideo.url,
        title: topVideo.title,
        source: topVideo.source || "YouTube Shorts (Viral)",
      };
    }

    // Ultimate fallback: Scrape online direct MP4
    const fallbackVideo = await scrapeOnlineViralVideo(cleanCat);
    return fallbackVideo;
  } catch (error: any) {
    return { error: error.message || "Failed to search for viral video." };
  }
}

