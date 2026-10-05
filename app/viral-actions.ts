"use server";

import path from "path";
import fs from "fs";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
}



// Check if ffmpeg is available
async function checkFfmpeg(): Promise<string> {
  // Try bundled ffmpeg installer first
  try {
    const requireFunc = typeof process !== "undefined" && process.versions && process.versions.node ? eval("require") : require;
    const ffmpegPath = requireFunc("@ffmpeg-installer/ffmpeg").path;
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch {}
  // Fallback to system ffmpeg
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
  return new Promise((resolve, reject) => {
    const localExe = path.join(process.cwd(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
    const ytDlpCmd = fs.existsSync(localExe) ? localExe : (process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

    const cookiePath = path.join(process.cwd(), "cookies.txt");
    const hasCookies = fs.existsSync(cookiePath);

    const args = [
      videoUrl,
      "--output", outputPath,
      "--format", "best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best",
      "--recode-video", "mp4",
      "--no-playlist",
      "--ffmpeg-location", ffmpegBin,
      "--js-runtimes", "node",
      ...(hasCookies ? ["--cookies", cookiePath] : []),
      "--print-json",
      "--no-warnings",
    ];

    const proc = spawn(ytDlpCmd, args, { shell: false });
    let jsonOutput = "";
    let errOutput = "";

    proc.stdout.on("data", (d: Buffer) => { jsonOutput += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { errOutput += d.toString(); });

    proc.on("close", (code: number | null) => {
      // Check if file was saved under a slightly different name (e.g. extension difference)
      if (!fs.existsSync(outputPath)) {
        const dir = path.dirname(outputPath);
        const base = path.basename(outputPath, path.extname(outputPath));
        try {
          const matching = fs.readdirSync(dir).find((f) => f.startsWith(base) && !f.endsWith(".part"));
          if (matching) {
            fs.renameSync(path.join(dir, matching), outputPath);
          }
        } catch {}
      }

      if (code === 0 && fs.existsSync(outputPath)) {
        let title = "Viral Video";
        let duration = 0;
        try {
          const parsed = JSON.parse(jsonOutput.trim().split("\n").pop() || "{}");
          title = parsed.title || parsed.fulltitle || "Viral Video";
          if (parsed.duration && typeof parsed.duration === "number") {
            duration = parsed.duration;
          }
        } catch {}
        resolve({ title, duration });
      } else {
        let msg = `Download failed (code ${code}): ${errOutput.slice(0, 300)}`;
        if (
          errOutput.includes("Instagram sent an empty media response") ||
          errOutput.includes("API is not granting access") ||
          errOutput.toLowerCase().includes("login") ||
          errOutput.toLowerCase().includes("cannot parse data")
        ) {
          msg = "Meta (Instagram/Facebook) requires authentication for this video. To download IG/FB videos, save your browser cookies to a cookies.txt file in the project folder, or use YouTube, TikTok, or direct .mp4 links.";
        }
        reject(new Error(msg));
      }
    });

    proc.on("error", (e: Error) => {
      reject(new Error(`Could not start yt-dlp: ${e.message}`));
    });
  });
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

// ─── Split Video ──────────────────────────────────────────────────────────────

async function splitVideo(
  ffmpegBin: string,
  sourcePath: string,
  clipsDir: string,
  totalDuration: number,
  timestamp: number
): Promise<{ clipPath: string; duration: number; startTime: number }[]> {
  // Determine clip length: short (< 10 min) → 90s clips, long (≥ 10 min) → 1200s (20 min) clips
  const clipLength = totalDuration < 600 ? 90 : 1200;
  const clips: { clipPath: string; duration: number; startTime: number }[] = [];

  let startTime = 0;
  let partIndex = 1;

  while (startTime < totalDuration) {
    const remaining = totalDuration - startTime;
    const duration = Math.min(clipLength, remaining);
    if (duration < 3) break; // Skip tiny tail clips

    const clipFilename = `clip_${timestamp}_part${partIndex}.mp4`;
    const clipPath = path.join(clipsDir, clipFilename);

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-ss", String(startTime),
        "-i", sourcePath,
        "-t", String(duration),
        "-c:v", "copy",
        "-c:a", "copy",
        "-avoid_negative_ts", "make_zero",
        clipPath,
      ];
      const proc = spawn(ffmpegBin, args, { shell: false });
      let errOut = "";
      proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });
      proc.on("close", (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg split failed (part ${partIndex}): ${errOut.slice(-300)}`));
      });
      proc.on("error", (e: Error) => reject(e));
    });

    clips.push({ clipPath, duration, startTime });
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

    // Try yt-dlp first, then ytdl-core as fallback
    let sourceTitle = "Viral Video";
    let probedDuration = 0;
    try {
      const result = await downloadWithYtDlp(videoUrl, sourceFilePath, ffmpegBin);
      sourceTitle = result.title;
      if (result.duration && result.duration > 0) probedDuration = result.duration;
    } catch (ytdlpErr: any) {
      console.warn("yt-dlp failed, trying ytdl-core:", ytdlpErr.message);
      try {
        const result = await downloadWithYtdlCore(videoUrl, sourceFilePath);
        sourceTitle = result.title;
      } catch (ytdlErr: any) {
        // Last resort: direct HTTP download (works for direct .mp4 links)
        console.warn("ytdl-core failed, trying direct download:", ytdlErr.message);
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

export async function generateClipMetadata(params: {
  partNumber: number;
  totalParts: number;
  sourceTitle: string;
  totalDuration: number;
  contentCategory: string;
  clipDuration: number;
}): Promise<{ description: string; hashtags: string[] }> {
  const { partNumber, totalParts, sourceTitle, contentCategory, clipDuration } = params;

  // Pick hooks and CTA based on part number (deterministic rotation)
  const categoryHooks = HOOKS[contentCategory] || HOOKS["Motivational"];
  const hook = pickRandom(categoryHooks, partNumber - 1);
  const cta = pickRandom(CTAS, partNumber + 1);

  // Build part label — strictly omit if video is covered in a single clip
  const isMultiPart = totalParts > 1;
  const partLabel = isMultiPart ? `📌 PART ${partNumber} of ${totalParts}` : "";
  const clipLen = clipDuration < 120 ? `${Math.round(clipDuration)}s` : `${Math.round(clipDuration / 60)}min`;

  // Fair Use & Copyright Attribution (protects channel from strikes by directing claimants to contact first)
  const creditBlock = `Credit / Source: "${sourceTitle}". This clip is shared under Fair Use for educational, inspirational, and commentary purposes. All rights belong to their respective owners. For credit or immediate removal, please reach out via DM/email.`;

  // Build description
  const description = [
    ...(partLabel ? [partLabel] : []),
    hook,
    `⏱ ${clipLen} clip.`,
    cta,
    "",
    "────────────────",
    creditBlock,
  ].join("\n");

  // Build hashtags: category-specific + universal + words from title
  const bankTags = (HASHTAG_BANK[contentCategory] || HASHTAG_BANK["Motivational"]).slice(0, 8);
  const titleWords = sourceTitle.match(/[a-zA-Z]{4,}/g) || [];
  const titleTags = titleWords
    .map((w) => w.toLowerCase())
    .filter((w) => !bankTags.includes(w) && !UNIVERSAL_HASHTAGS.includes(w))
    .slice(0, 3);
  const universalPick = UNIVERSAL_HASHTAGS.slice(0, 3);
  const hashtags = [...new Set([...bankTags.slice(0, 5), ...titleTags, ...universalPick, ...bankTags.slice(5)])].slice(0, 10);

  return { description, hashtags };
}

// ─── Publish Clip + Cleanup ───────────────────────────────────────────────────

export async function publishClipAndCleanup(params: {
  clipPath: string;
  partNumber: number;
  totalParts: number;
  title: string;
  description: string;
  hashtags: string[];
  platforms: string[];
  userEmail: string;
  connections: string[];
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

  // Verify clip file exists
  const absolutePath = clipPath.startsWith("/")
    ? path.join(process.cwd(), "public", clipPath)
    : clipPath;

  if (!fs.existsSync(absolutePath)) {
    return { success: false, error: "Clip file not found on disk.", logs };
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

  const { readTokens } = await import("@/app/lib/tokens");
  const tokens: any = await readTokens();

  // ─ YouTube ─
  if (platforms.includes("YouTube")) {
    try {
      const { google } = require("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials(tokens.youtube);
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });

      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: fullTitle.slice(0, 100),
            description: fullDescription,
            tags: hashtags.slice(0, 15),
            categoryId: "22",
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        },
        media: { body: require("fs").createReadStream(absolutePath) },
      });

      youtubeVideoId = res.data.id;
      youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
      logs.push(`✅ YouTube: ${youtubeUrl}`);
    } catch (e: any) {
      logs.push(`❌ YouTube: ${e.message}`);
    }
  }

  // ─ Facebook ─
  if (platforms.includes("Facebook")) {
    try {
      const pageId = tokens.facebook?.page_id;
      const pageToken = tokens.facebook?.page_access_token;
      if (!pageId || !pageToken) throw new Error("Facebook not connected.");

      // Upload as file stream via multipart
      const fileBuffer = fs.readFileSync(absolutePath);
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
      facebookUrl = `https://www.facebook.com/video/${facebookVideoId}`;
      logs.push(`✅ Facebook: ${facebookUrl}`);
    } catch (e: any) {
      logs.push(`❌ Facebook: ${e.message}`);
    }
  }

  // ─ Instagram ─
  if (platforms.includes("Instagram")) {
    try {
      const igUserId = tokens.facebook?.instagram_user_id;
      const instagramToken =
        tokens.facebook?.instagram_access_token || tokens.facebook?.instagram_page_access_token;
      const instagramApi = tokens.facebook?.instagram_access_token
        ? "https://graph.instagram.com/v26.0"
        : "https://graph.facebook.com/v26.0";
      if (!instagramToken || !igUserId) throw new Error("Instagram not connected.");

      // Instagram requires a public video URL — use YouTube link if available, else skip
      if (!youtubeUrl) throw new Error("Instagram requires the video to be hosted publicly. Upload to YouTube first.");

      const createRes = await fetch(`${instagramApi}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: instagramToken,
          media_type: "REELS",
          video_url: youtubeUrl,
          caption: `${title}\n\n${description}\n\n${formattedHashtags.join(" ")}`,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || createData.error) throw new Error(createData.error?.message || `HTTP ${createRes.status}`);

      const creationId = createData.id;
      let finished = false;
      for (let i = 0; i < 15; i++) {
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
      logs.push(`✅ Instagram: Reel published`);
    } catch (e: any) {
      logs.push(`❌ Instagram: ${e.message}`);
    }
  }

  // ─ Gmail notification ─
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
          `Your viral clip has been published!\n\n` +
          `${title}\n${description}\n\n` +
          `🔗 Published Links:\n${linksSection || "No links available."}\n\n` +
          `Hashtags: ${formattedHashtags.join(" ")}`;

        const message = [
          `To: ${recipient}`,
          "Content-Type: text/plain; charset=utf-8",
          `Subject: ✅ Clip Published: ${title}`,
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

  // ─ Auto-delete clip from disk after publishing ─
  try {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    logs.push("🗑️ Local clip file deleted after publishing.");
  } catch (e: any) {
    logs.push(`⚠️ Could not delete local clip: ${e.message}`);
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

// ─── Native YouTube Search (zero dependency, no browseId crashes) ─────────────
async function searchYouTubeVideos(query: string): Promise<{ url: string; title: string; views: number }[]> {
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
    const results: { url: string; title: string; views: number }[] = [];

    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        // Standard video renderers
        const vr = item?.videoRenderer;
        if (vr?.videoId && vr.title?.runs?.[0]?.text) {
          const viewsText = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || "0";
          const views = parseInt(viewsText.replace(/[^0-9]/g, "")) || 0;
          results.push({
            url: `https://www.youtube.com/watch?v=${vr.videoId}`,
            title: vr.title.runs[0].text,
            views,
          });
        }
        // Shorts shelf items
        const reelShelf = item?.reelShelfRenderer;
        if (reelShelf && Array.isArray(reelShelf.items)) {
          for (const reel of reelShelf.items) {
            const rvr = reel?.reelItemRenderer;
            if (rvr?.videoId) {
              const viewsText = rvr.viewCountText?.simpleText || "0";
              const views = parseInt(viewsText.replace(/[^0-9]/g, "")) || 0;
              results.push({
                url: `https://www.youtube.com/watch?v=${rvr.videoId}`,
                title: rvr.headline?.simpleText || "Viral Short",
                views,
              });
            }
          }
        }
      }
    }

    return results;
  } catch (e) {
    console.warn("Direct YouTube search fallback:", e);
    return [];
  }
}

// ─── Auto-Find Viral Video (100% YouTube, copyright-safe, high-reach) ─────────
const SAFE_CATEGORY_QUERIES: Record<string, string[]> = {
  "Motivational": ["best motivational speech shorts", "podcast life advice wisdom shorts", "discipline mindset powerful speech shorts"],
  "Educational":   ["interesting facts educational shorts", "science facts did you know shorts", "eye opening history lesson shorts"],
  "Funny":         ["funny podcast moments shorts", "stand up comedy hilarious clean shorts", "epic funny moment shorts"],
  "Nature":        ["breathtaking nature wildlife shorts", "amazing earth planet discovery shorts", "peaceful nature landscape shorts"],
  "Sports":        ["athlete discipline motivation speech shorts", "legendary sports moment highlights shorts", "unstoppable athlete mindset shorts"],
  "Gaming":        ["epic gaming moment clutch shorts", "funny gaming moments clips shorts"],
  "Travel":        ["beautiful places to visit before you die shorts", "world travel hidden gems shorts"],
  "Food":          ["satisfying cooking recipe street food shorts", "delicious food compilation shorts"],
  "Fashion":       ["street style transformation aesthetic fashion shorts", "classic stylish outfit ideas shorts"],
};

export async function autoFindViralVideo(category: string): Promise<{ url?: string; title?: string; error?: string }> {
  try {
    const cleanCat = category?.trim() || "Motivational";
    const queries = SAFE_CATEGORY_QUERIES[cleanCat] || [
      `${cleanCat} podcast advice shorts`,
      `${cleanCat} speech shorts`,
      `${cleanCat} shorts`,
    ];

    // Try targeted safe queries first
    let videos: { url: string; title: string; views: number }[] = [];
    for (const q of queries) {
      videos = await searchYouTubeVideos(q);
      if (videos.length >= 2) break;
    }

    if (!videos.length) {
      videos = await searchYouTubeVideos(`${cleanCat} shorts`);
    }

    if (videos.length > 0) {
      // Sort by view count to always get the most viral ones
      videos.sort((a, b) => b.views - a.views);
      // Filter out obvious music video titles to avoid Content ID audio matches
      const safeVideos = videos.filter(
        (v) => !v.title.toLowerCase().includes("official music video") && !v.title.toLowerCase().includes("feat.")
      );
      const candidates = safeVideos.length ? safeVideos : videos;

      // Pick randomly from top 5 highest viewed so user gets variety on repeated clicks
      const topVideo = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
      return {
        url: topVideo.url,
        title: topVideo.title,
      };
    }

    return { error: `No viral videos found for "${cleanCat}". Please paste a YouTube video URL directly.` };
  } catch (error: any) {
    return { error: error.message || "Failed to search for viral video." };
  }
}

