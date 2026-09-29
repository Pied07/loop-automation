"use server";

import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { fal } from "@fal-ai/client";
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

async function uploadRendererAsset(bytes: Buffer, filename: string, contentType: string, shotstackKey?: string, json2videoKey?: string) {
  const body = Uint8Array.from(bytes).buffer;
  if (shotstackKey) {
    const request = await fetch("https://api.shotstack.io/ingest/v1/upload", {
      method: "POST",
      headers: { "x-api-key": shotstackKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
      signal: AbortSignal.timeout(30000)
    });
    if (!request.ok) throw new Error(`Shotstack asset upload setup failed (${request.status}): ${(await request.text()).slice(0, 300)}`);
    const upload = await request.json();
    const uploadUrl = upload?.data?.attributes?.url;
    const sourceId = upload?.data?.id;
    if (!uploadUrl || !sourceId) throw new Error("Shotstack did not return an asset upload URL.");
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body, signal: AbortSignal.timeout(60000) });
    if (!put.ok) throw new Error(`Shotstack asset transfer failed (${put.status}).`);

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const statusResponse = await fetch(`https://api.shotstack.io/ingest/v1/sources/${encodeURIComponent(sourceId)}`, {
        headers: { "x-api-key": shotstackKey }, signal: AbortSignal.timeout(15000)
      });
      if (!statusResponse.ok) throw new Error(`Shotstack asset status failed (${statusResponse.status}).`);
      const attributes = (await statusResponse.json())?.data?.attributes;
      if (attributes?.status === "ready" && attributes?.source) return attributes.source as string;
      if (attributes?.status === "failed") throw new Error("Shotstack could not process the narration asset.");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("Timed out while Shotstack prepared the narration asset.");
  }

  if (json2videoKey) {
    const request = await fetch("https://api.json2video.com/v2/media/file", {
      method: "POST",
      headers: { "x-api-key": json2videoKey, "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, contentType, size: bytes.byteLength, folder: "temp" }),
      signal: AbortSignal.timeout(30000)
    });
    if (!request.ok) throw new Error(`JSON2Video asset upload setup failed (${request.status}): ${(await request.text()).slice(0, 300)}`);
    const upload = await request.json();
    if (!upload?.uploadUrl || !upload?.fileUrl) throw new Error("JSON2Video did not return an asset upload URL.");
    const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body, signal: AbortSignal.timeout(60000) });
    if (!put.ok) throw new Error(`JSON2Video asset transfer failed (${put.status}).`);
    return upload.fileUrl as string;
  }

  throw new Error("No configured renderer can host the narration asset.");
}

function getPollinationsApiKey() {
  return process.env.POLLINATION_API_KEY?.trim() || process.env.POLLINATIONS_API_KEY?.trim() || process.env.POLLINATIONS_KEY?.trim();
}

async function requestPollinationsChat(messages: { role: "system" | "user"; content: string }[], timeoutMs: number, jsonOnly = false) {
  const apiKey = getPollinationsApiKey();
  if (!apiKey) throw new Error("POLLINATION_API_KEY is not configured");
  const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages,
      ...(jsonOnly ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Pollinations HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Pollinations returned an empty response");
  return text.trim();
}

export async function generateVideoContent(promptText: string, format: string, numImages: number = 3, videoDuration: number = 15) {
  numImages = Math.max(1, Math.min(10, Math.floor(Number(numImages) || 3)));
  videoDuration = Math.max(1, Math.min(60, Math.floor(Number(videoDuration) || 15)));
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const hfToken = process.env.HF_ACCESS_TOKEN?.trim();

  const systemInstruction = `You are an expert creative storyteller and video scriptwriter. Your job is to write a COMPLETE, ORIGINAL SHORT STORY based on the user's idea.

The user's idea/theme: "${promptText}"
Video format: ${format}
Duration: exactly ${videoDuration} seconds
Number of scenes: exactly ${numImages}

IMPORTANT RULES:
- DO NOT just repeat or summarize the prompt. Write an actual story with a beginning, middle, and end.
- Write narration totaling about ${Math.max(12, Math.round(videoDuration * 2.15))} spoken words, divided naturally across exactly ${numImages} captions.
- Captions contain only story narration. Never say scene numbers, labels, headings, or camera directions.
- Each imagePrompt describes a distinct moment in one continuous story, with consistent characters, setting, and style. Include subject, action, composition, lighting, and mood; no text in the image.
- The story must have emotional arc: setup -> conflict/tension -> climax -> resolution.
- Make it engaging, dramatic, and creative — surprise the viewer.

Respond ONLY with a raw valid JSON object (no markdown, no code blocks):
{
  "title": "A short catchy title",
  "description": "One sentence summary of the story",
  "hashtags": ["tag1", "tag2", "tag3"],
  "scenes": [
    {
      "imagePrompt": "Extremely detailed visual description for AI image generation, cinematic, 8k, dramatic lighting",
      "caption": "The spoken narration for this scene that advances the story"
    }
  ]
}`;

  function parseScriptJson(text: string) {
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      const data = JSON.parse(clean.slice(start, end + 1));
      if (!data.scenes || !Array.isArray(data.scenes) || data.scenes.length === 0) return null;
      data.scenes = data.scenes
        .filter((scene: unknown): scene is { caption: string; imagePrompt: string } => {
          if (!scene || typeof scene !== "object") return false;
          const candidate = scene as { caption?: unknown; imagePrompt?: unknown };
          return typeof candidate.caption === "string" && !!candidate.caption.trim() && typeof candidate.imagePrompt === "string" && !!candidate.imagePrompt.trim();
        })
        .slice(0, numImages);
      if (data.scenes.length !== numImages) return null;
      return {
        title: data.title || "Generated Story",
        description: data.description || "An AI generated story.",
        hashtags: ensureRelevantHashtags(data.hashtags, `${data.title || ""} ${data.description || ""} ${promptText} ${format}`),
        scenes: data.scenes.map((scene: { caption: string; imagePrompt: string }) => ({
          ...scene,
          caption: scene.caption.trim().replace(/^(?:scene|shot|part)\s*\d+\s*[:.)-]?\s*/i, "")
        })),
        captions: data.scenes.map((scene: { caption: string }) => scene.caption.trim().replace(/^(?:scene|shot|part)\s*\d+\s*[:.)-]?\s*/i, "")).join(" ")
      };
    } catch { return null; }
  }

  // Prefer the configured Pollinations account, then fall back to other providers.
  if (getPollinationsApiKey()) {
    try {
      const text = await requestPollinationsChat([
        { role: "system", content: "You are a creative video scriptwriter. Always respond with raw valid JSON only, no markdown, no explanations." },
        { role: "user", content: systemInstruction }
      ], 30000, true);
      const result = parseScriptJson(text);
      if (result) return result;
      console.warn("Pollinations script response did not match the requested scene count.");
    } catch (error) {
      console.warn("Pollinations script generation failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }

  // 1. Try Groq first (fast, free, confirmed working)
  if (groqKey) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: "You are a creative video scriptwriter. Always respond with raw valid JSON only, no markdown, no explanations." },
            { role: "user", content: systemInstruction }
          ],
          temperature: 0.8,
          max_tokens: 4096,
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData?.choices?.[0]?.message?.content || "";
        const result = parseScriptJson(text);
        if (result) {
          console.log("Script generated with Groq ✓");
          return result;
        }
      } else {
        console.warn("Groq failed:", groqRes.status, await groqRes.text());
      }
    } catch (e: any) {
      console.log("Groq error (non-fatal):", e.message);
    }
  }

  // 2. Try Gemini as fallback
  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemInstruction }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 4096, responseMimeType: "application/json" }
          }),
          signal: AbortSignal.timeout(20000)
        }
      );
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const result = parseScriptJson(text);
        if (result) {
          console.log("Script generated with Gemini ✓");
          return result;
        }
      } else {
        console.warn("Gemini failed:", geminiRes.status, await geminiRes.text());
      }
    } catch (e: any) {
      console.log("Gemini error (non-fatal):", e.message);
    }
  }

  // 3. Try HuggingFace Llama
  if (hfToken) {
    try {
      const hfRes = await fetch("https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct", {
        method: "POST",
        headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemInstruction}<|eot_id|><|start_header_id|>user<|end_header_id|>\nGenerate the JSON story.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n{`,
          parameters: { max_new_tokens: 1500, return_full_text: false, temperature: 0.9 }
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (hfRes.ok) {
        const json = await hfRes.json();
        const result = parseScriptJson("{" + json[0].generated_text);
        if (result) {
          console.log("Script generated with HuggingFace ✓");
          return result;
        }
      }
    } catch (e: any) {
      console.log("HF API failed (non-fatal):", e.message);
    }
  }

  // 4. Try Pollinations text AI (free, no key)
  try {
    const polliRes = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a creative video scriptwriter. Always respond with raw valid JSON only, no markdown." },
          { role: "user", content: systemInstruction }
        ],
        model: "openai",
        seed: Math.floor(Math.random() * 999999)
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (polliRes.ok) {
      const result = parseScriptJson(await polliRes.text());
      if (result) {
        console.log("Script generated with Pollinations ✓");
        return result;
      }
    }
  } catch (e: any) {
    console.log("Pollinations script gen failed (non-fatal):", e.message);
  }

  // 5. Creative local fallback — tells a real story arc, never just reads the prompt
  console.log("Using creative local story fallback.");
  const theme = promptText.slice(0, 60);
  const storyBeats = [
    `In a world where everything felt ordinary, one moment changed everything.`,
    `${theme} — the beginning of something no one could have predicted.`,
    `Tension grew as the truth slowly began to surface.`,
    `A decision had to be made. There was no turning back.`,
    `The climax arrived like a storm — sudden, powerful, and unforgettable.`,
    `In the aftermath, nothing would ever be the same again.`,
    `The story had ended, but its echo would last forever.`,
    `One final breath. One final truth revealed.`,
    `The ending no one saw coming — until now.`,
    `And so the story lived on, beyond the last frame.`,
  ];
  const fallbackScenes = Array.from({ length: numImages }, (_, i) => ({
    imagePrompt: `A distinct vertical 9:16 cinematic film still in ${format} style, visual moment: ${storyBeats[i] || storyBeats[storyBeats.length - 1]}. Story concept: ${theme}. Rich subject detail, intentional composition, atmospheric light, consistent art direction, no lettering, no labels, no watermark.`,
    caption: storyBeats[i] || storyBeats[storyBeats.length - 1]
  }));
  return {
    title: `${format}: ${theme.slice(0, 35)}`,
    description: `A ${format.toLowerCase()} story about ${theme.toLowerCase()}.`,
    hashtags: ensureRelevantHashtags([], `${theme} ${format}`),
    scenes: fallbackScenes,
    captions: fallbackScenes.map(s => s.caption).join(" ")
  };
}

function ensureRelevantHashtags(hashtags: unknown, context: string) {
  const stopWords = new Set(["about", "after", "again", "against", "also", "and", "are", "before", "being", "between", "could", "during", "from", "have", "into", "just", "more", "most", "over", "should", "that", "their", "there", "these", "they", "this", "through", "under", "very", "video", "with", "would", "your"]);
  const clean = (value: string) => value.replace(/^#+/, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const selected = Array.isArray(hashtags) ? hashtags.filter((tag): tag is string => typeof tag === "string").map(clean).filter(Boolean) : [];
  const words = context.match(/[\p{L}\p{N}]{3,}/gu) || [];
  const relevant = words.map(clean).filter((word) => word.length >= 3 && !stopWords.has(word));
  const defaults = ["shorts", "shortstory", "storytelling", "aivideo", "originalstory", "cinematic", "storytime", "viralshorts", "creativevideo", "narrativestory"];
  for (const tag of [...relevant, ...defaults]) {
    if (!selected.includes(tag)) selected.push(tag);
    if (selected.length >= 10) break;
  }
  return selected.slice(0, 15).map((tag) => `#${tag}`);
}

export async function generateDetailedPrompt(idea: string, details: {
  format: string;
  duration: number;
  imageCount: number;
  imageStyle: string;
  captionStyle: string;
  voice: string;
  language: string;
}) {
  const request = `Create a complete production prompt for a ${details.format} short video, preserving the user's idea and all specific scene details below. Do not replace named characters, location, lighting, palette, camera directions, mood, or frame descriptions with generic alternatives.

USER'S IDEA AND VISUAL DIRECTIONS:
${idea.trim() || "No story idea was provided. Invent a fresh, original story that fits the selected video type and all production settings."}

PRODUCTION SETTINGS:
- Total duration: exactly ${details.duration} seconds.
- Visuals: exactly ${details.imageCount} distinct vertical 9:16 frames, evenly timed across the video.
- Image style: ${details.imageStyle}.
- Caption style: ${details.captionStyle}; apply this only to readable spoken subtitles, never put text in generated images.
- Narration voice: ${details.voice}.
- Narration language: ${details.language}.

Expand the user's material into a coherent beginning, middle, and payoff that fits the duration. Keep the same characters, location, lighting, and palette across frames wherever requested. Specify what each frame shows, with no scene labels spoken aloud, no lettering in images, and captions timed to narration. Return only the finished prompt.`;
  const providerErrors: string[] = [];
  const fallbackPrompt = `${details.format} short video production prompt\n\nStory idea: ${idea.trim() || `Invent an original ${details.format} story with a compelling opening and satisfying payoff.`}\n\nProduction requirements:\n- Runtime: exactly ${details.duration} seconds.\n- Create exactly ${details.imageCount} distinct vertical 9:16 images, paced across the runtime.\n- Visual style: ${details.imageStyle}. Keep characters, location, lighting, and palette consistent wherever applicable.\n- Narration: ${details.voice}, in ${details.language}. Write a complete beginning-to-ending script sized to ${details.duration} seconds. Narration must contain story text only; do not speak scene numbers, labels, or directions.\n- Divide the story into exactly ${details.imageCount} visual beats. For each beat, provide the spoken narration and a detailed, text-free image prompt describing a distinct moment.\n- Captions: ${details.captionStyle}, legible within vertical safe areas, wrapped into short lines, and timed to the spoken narration.\n- Open with a compelling hook and deliver a clear emotional payoff. Do not add any lettering, subtitles, or watermark to the images.`;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: request }], temperature: 0.8, max_tokens: 700 }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const text = (await response.json())?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 30) return text;
      } else providerErrors.push(`Groq: HTTP ${response.status}`);
    } catch (error) { providerErrors.push(`Groq: ${error instanceof Error ? error.message : "request failed"}`); }
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: request }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 700 } }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const text = (await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 30) return text;
      } else providerErrors.push(`Gemini: HTTP ${response.status}`);
    } catch (error) { providerErrors.push(`Gemini: ${error instanceof Error ? error.message : "request failed"}`); }
  }

  if (getPollinationsApiKey()) {
    try {
      const text = await requestPollinationsChat([{ role: "user", content: request }], 10000);
      if (text.length > 30) return text;
      providerErrors.push("Pollinations returned too little prompt text");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request failed";
      providerErrors.push(`Pollinations: ${reason.slice(0, 220)}`);
      console.warn("Pollinations prompt generation failed:", reason);
    }
  } else {
    providerErrors.push("Pollinations API key is missing");
  }

  console.warn("AI prompt providers unavailable; returning a complete local prompt:", providerErrors.join(" | "));
  return fallbackPrompt;
}

// Map UI voice names to ElevenLabs voice IDs
const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  Adam:    "pNInz6obpgDQGcFmaJgB", // Deep Male · Narration
  Rachel:  "21m00Tcm4TlvDq8ikWAM", // Calm · Clear Female
  Josh:    "TxGEqnHWrfWFTfGW9XjX", // Young · Casual Male
  Bella:   "EXAVITQu4vr4xnSDxMaL", // Soft · Warm Female
  Daniel:  "onwK4e9ZLuTAKqWW03F9", // British · Authoritative Male
  Lily:    "pFZP5JQG7iQjIQuC4Bku", // British · Warm Female
  Harry:   "SOYHLrjzK2X1ezoPC6cr", // Anxious · Intense Male
  Freya:   "jsCqWAovK2LkecY7zXl4", // Strong · Confident Female
  Liam:    "TX3LPaxmHj5en2jOta9n", // Crisp · Articulate Male
  Grace:   "oWAxZDx7w5VEj9dCyTzz", // Southern · Warm Female
  Ethan:   "g5CIjZEefAph4nQFvHAz", // Raspy · Dark Male
  Emily:   "LcfcDJNUP1GQjkzn1xUU", // Gentle · Storyteller Female
  Clyde:   "2EiwWnXFnvU5JabPnv8n", // Midwest · Gravelly Male
  Matilda: "XrExE9yKIg1WjnnlVkGX", // Warm · Friendly Australian Female
  Sam:     "yoZ06aMxZJJ28mfd3POQ", // Raspy · Mysterious Male
};

const GEMINI_TTS_VOICE_MAP: Record<string, string> = {
  Adam: "Charon", Rachel: "Kore", Josh: "Puck", Bella: "Aoede", Daniel: "Orus",
  Lily: "Erinome", Harry: "Fenrir", Freya: "Autonoe", Liam: "Iapetus", Grace: "Callirrhoe",
  Ethan: "Algenib", Emily: "Achernar", Clyde: "Gacrux", Matilda: "Despina", Sam: "Enceladus"
};

export async function renderVideo(scenes: any[], videoDuration: number = 15, imageStyle: string = "Realistic", ttsLanguage: string = "en-US", captionStyle: string = "Modern", idToken?: string, userId?: string, voiceType: string = "Adam") {
  try {
    videoDuration = Math.max(1, Math.min(60, Math.floor(Number(videoDuration) || 15)));
    scenes = scenes.slice(0, 10);
    if (!scenes.length) throw new Error("The script did not contain any scenes.");
    const shotstackKey = process.env.SHOTSTACK_API_KEY?.trim();
    const j2vKey = process.env.JSON2VIDEO_API_KEY?.trim();
    if (!shotstackKey && !j2vKey) throw new Error("Configure SHOTSTACK_API_KEY or JSON2VIDEO_API_KEY to render videos.");

    const hfToken = process.env.HF_ACCESS_TOKEN?.trim();
    const falKey = process.env.FAL_KEY?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const pollinationsKey = process.env.POLLINATION_API_KEY?.trim() || process.env.POLLINATIONS_API_KEY?.trim() || process.env.POLLINATIONS_KEY?.trim();
    const pixazoKey = process.env.PIXAZO_API_KEY?.trim();
    console.log(`Generating ${scenes.length} distinct images...`);

    // Process scenes sequentially to avoid HF rate limits
    const sceneClips: { url: string; caption: string }[] = [];
    for (let idx = 0; idx < scenes.length; idx++) {
      const scene = scenes[idx];
      const promptStr = `${scene.imagePrompt} - ${imageStyle} style, highly detailed, professional`;
      const seed = Math.floor(Math.random() * 100000);
      const pollinationsPrompt = `${promptStr}, vertical 9:16 composition, coherent visual continuity, no text, no watermark`;
      const pollinationsUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(pollinationsPrompt)}?model=flux&width=1024&height=1792&nologo=true&seed=${seed}`;
      const legacyPollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(pollinationsPrompt)}?width=1024&height=1792&nologo=true&seed=${seed}`;

      let imageBuffer: ArrayBuffer | null = null;
      let contentType = "image/jpeg";
      let generatedImageUrl = "";
      const providerErrors: string[] = [];
      const summarizeProviderError = (provider: string, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/429|quota|monthly included credits|depleted/i.test(message)) return `${provider}: quota or credits exhausted`;
        if (/401|403|forbidden|unauthorized/i.test(message)) return `${provider}: API key rejected or lacks permission`;
        return `${provider}: ${message.slice(0, 240)}`;
      };

      const acceptImage = async (response: Response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
        const detectedType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        const isPng = header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
        const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
        const isWebp = header.length >= 12 && String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
        if (isPng) contentType = "image/png";
        else if (isJpeg) contentType = "image/jpeg";
        else if (isWebp) contentType = "image/webp";
        else if (detectedType?.startsWith("image/")) contentType = detectedType;
        else throw new Error(`Response was not an image (${detectedType || "unknown content type"})`);
        imageBuffer = bytes;
      };

      if (pollinationsKey) {
        try {
          const pRes = await fetch(pollinationsUrl, {
            headers: { Authorization: `Bearer ${pollinationsKey}` },
            signal: AbortSignal.timeout(90000)
          });
          await acceptImage(pRes);
          generatedImageUrl = pollinationsUrl;
          console.log(`Pollinations scene ${idx + 1} OK (${contentType})`);
        } catch (error) { providerErrors.push(summarizeProviderError("Pollinations", error)); console.error(`Pollinations error for scene ${idx + 1}:`, error); }
      }

      if (!imageBuffer && falKey) {
        try {
          fal.config({ credentials: falKey });
          const result = await fal.subscribe("fal-ai/flux/dev", {
            input: { prompt: `${promptStr}, vertical 9:16 composition, coherent visual continuity, no text, no watermark`, image_size: { width: 1024, height: 1792 }, num_images: 1, output_format: "jpeg" }
          }) as unknown as { data?: { images?: { url?: string }[] }; images?: { url?: string }[] };
          const candidateUrl = result?.data?.images?.[0]?.url || result?.images?.[0]?.url || "";
          if (candidateUrl) {
            const imageResponse = await fetch(candidateUrl, { signal: AbortSignal.timeout(30000) });
            await acceptImage(imageResponse);
            generatedImageUrl = candidateUrl;
          } else throw new Error("No image URL returned");
        } catch (error) { providerErrors.push(summarizeProviderError("fal", error)); console.warn(`fal image ${idx + 1} failed:`, error); }
      }

      if (!imageBuffer && geminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const result = await ai.models.generateContent({
            model: "gemini-3.1-flash-image",
            contents: `${promptStr}, vertical 9:16 composition, coherent visual continuity, no text, no watermark`,
            config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
          });
          const parts = result.candidates?.[0]?.content?.parts || [];
          const imagePart = parts.find((part: any) => part.inlineData?.data);
          if (!imagePart?.inlineData?.data) throw new Error("No image data returned");
          const bytes = Buffer.from(imagePart.inlineData.data, "base64");
          imageBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          contentType = imagePart.inlineData.mimeType || "image/png";
        } catch (error) { providerErrors.push(summarizeProviderError("Gemini", error)); console.warn(`Gemini image ${idx + 1} failed:`, error); }
      }

      // Hugging Face's router-backed client replaces the retired api-inference URL.
      if (!imageBuffer && hfToken) {
        console.log(`Requesting scene ${idx + 1} from Hugging Face...`);
        try {
          const hf = new HfInference(hfToken);
          const blob = await hf.textToImage({ model: "black-forest-labs/FLUX.1-Krea-dev", inputs: `${promptStr}, vertical 9:16, no text, no watermark`, provider: "auto" }, { signal: AbortSignal.timeout(90000) });
          await acceptImage(new Response(blob, { headers: { "content-type": blob.type || "image/jpeg" } }));
          console.log(`Hugging Face scene ${idx + 1} OK (${contentType})`);
        } catch (error) { providerErrors.push(summarizeProviderError("Hugging Face", error)); console.warn(`HF image ${idx + 1} failed:`, error); }
      }

      if (!imageBuffer && pixazoKey) {
        try {
          const pixazoResponse = await fetch("https://gateway.pixazo.ai/flux-1-schnell/v1/getDataBatch", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Secret-Key": pixazoKey, "Cache-Control": "no-cache" },
            body: JSON.stringify({ prompt: `${promptStr}, vertical 9:16 composition, coherent visual continuity, no text, no watermark`, num_steps: 4, seed, width: 512, height: 910 }),
            signal: AbortSignal.timeout(90000)
          });
          if (!pixazoResponse.ok) throw new Error(`HTTP ${pixazoResponse.status}: ${(await pixazoResponse.text()).slice(0, 200)}`);
          const payload = await pixazoResponse.json();
          let resultPayload = payload;
          let resultUrl = "";
          const findImageUrl = (value: unknown): string => {
            if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : "";
            if (!value || typeof value !== "object") return "";
            for (const [key, child] of Object.entries(value)) {
              if (/^(url|image|image_url|output_url|download_url)$/i.test(key)) {
                const candidate = findImageUrl(child);
                if (candidate) return candidate;
              }
            }
            for (const child of Object.values(value)) {
              const candidate = findImageUrl(child);
              if (candidate) return candidate;
            }
            return "";
          };
          const pollingUrl = typeof payload?.polling_url === "string" ? payload.polling_url : "";
          if (pollingUrl) {
            const deadline = Date.now() + 90000;
            while (Date.now() < deadline) {
              await new Promise(resolve => setTimeout(resolve, 2500));
              const statusResponse = await fetch(pollingUrl, { headers: { "Ocp-Apim-Subscription-Key": pixazoKey }, signal: AbortSignal.timeout(15000) });
              if (!statusResponse.ok) throw new Error(`status HTTP ${statusResponse.status}`);
              resultPayload = await statusResponse.json();
              const status = String(resultPayload?.status || "").toLowerCase();
              if (["failed", "error", "cancelled"].includes(status)) throw new Error(String(resultPayload?.message || resultPayload?.error || "generation task failed"));
              resultUrl = findImageUrl(resultPayload);
              if (resultUrl || ["completed", "succeeded", "success", "done"].includes(status)) break;
            }
          } else resultUrl = findImageUrl(resultPayload);
          if (!resultUrl) throw new Error("No generated image URL returned");
          const imageResponse = await fetch(resultUrl, { signal: AbortSignal.timeout(30000) });
          await acceptImage(imageResponse);
          generatedImageUrl = resultUrl;
        } catch (error) { providerErrors.push(summarizeProviderError("Pixazo", error)); console.warn(`Pixazo image ${idx + 1} failed:`, error); }
      }

      if (!imageBuffer && !pollinationsKey) {
        console.log(`Falling back to Pollinations for scene ${idx + 1}...`);
        try {
          const pRes = await fetch(pollinationsKey ? pollinationsUrl : legacyPollinationsUrl, {
            headers: pollinationsKey ? { Authorization: `Bearer ${pollinationsKey}` } : undefined,
            signal: AbortSignal.timeout(90000)
          });
          await acceptImage(pRes);
          generatedImageUrl = pollinationsKey ? pollinationsUrl : legacyPollinationsUrl;
        } catch (error) { providerErrors.push(summarizeProviderError("Pollinations", error)); console.error(`Pollinations error for scene ${idx + 1}:`, error); }
      }

      // 3. Upload to Firebase Storage (required for Shotstack to download)
      if (!imageBuffer) throw new Error(`Image ${idx + 1} could not be generated. ${providerErrors.join(" | ") || "No image providers are configured."}`);
      let finalUrl = generatedImageUrl || pollinationsUrl;

      if (imageBuffer) {
        try {
          if (idToken && userId) {
            const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
            if (!bucket) throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing.");
            const ext = contentType.includes("png") ? "png" : "jpg";
            const objectName = `users/${userId}/assets/scene_${Date.now()}_${idx}.${ext}`;
            const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
            const uploadRes = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": contentType },
              body: imageBuffer
            });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              finalUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media&token=${uploadData.downloadTokens}`;
              console.log(`Scene ${idx + 1} uploaded to Firebase OK`);
            } else {
              console.error("Firebase upload failed:", await uploadRes.text());
              finalUrl = generatedImageUrl || pollinationsUrl;
            }
          } else {
            // No auth — use Pollinations URL directly (may fail on Shotstack)
            finalUrl = generatedImageUrl || pollinationsUrl;
          }
        } catch (e) {
          console.error(`Failed to upload scene ${idx + 1}:`, e);
          finalUrl = generatedImageUrl || pollinationsUrl;
        }
      }

      sceneClips.push({ url: finalUrl, caption: scene.caption });
    }
    
    const captionWeight = (caption: string) => {
      const words = caption.trim().split(/\s+/).filter(Boolean).length;
      const pauses = (caption.match(/[,.!?;:]/g) || []).length;
      return Math.max(1, words + pauses * 0.35);
    };
    const captionWeights = sceneClips.map((scene) => captionWeight(scene.caption));
    const totalCaptionWeight = captionWeights.reduce((sum, weight) => sum + weight, 0) || sceneClips.length;
    let scheduledDuration = 0;
    const sceneDurations = captionWeights.map((weight, index) => {
      if (index === captionWeights.length - 1) return Math.max(0.01, videoDuration - scheduledDuration - 0.1);
      const duration = Math.round(videoDuration * weight / totalCaptionWeight * 1000) / 1000;
      scheduledDuration += duration;
      return duration;
    });
    const wrapCaption = (caption: string) => {
      const words = caption.trim().split(/\s+/).filter(Boolean);
      const chunks: string[] = [];
      let line = "";
      let lines: string[] = [];
      for (const word of words) {
        if (line && `${line} ${word}`.length > 30) {
          lines.push(line);
          line = word;
        } else line = line ? `${line} ${word}` : word;
        if (lines.length === 2) {
          chunks.push(lines.join("\n"));
          lines = [];
        }
      }
      if (line) lines.push(line);
      if (lines.length) chunks.push(lines.join("\n"));
      return chunks.length ? chunks : [""];
    };
    let currentStartTime = 0;
    
    const imageClips = sceneClips.map((scene, index) => {
      const length = sceneDurations[index];
      const clip = {
        asset: { type: "image", src: scene.url },
        start: currentStartTime,
        length,
        effect: "zoomIn"
      };
      currentStartTime += length;
      return clip;
    });

    if (!geminiKey) throw new Error("GEMINI_API_KEY is required for free-tier Gemini narration.");
    const ttsVoice = GEMINI_TTS_VOICE_MAP[voiceType];
    if (!ttsVoice) throw new Error(`The selected voice ${voiceType} is not configured for Gemini narration.`);
    const narration = sceneClips.map((scene) => scene.caption.trim()).filter(Boolean).join(" ");
    const speechResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.8-flash-lite-tts",
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text: narration,
            annotations: [{
              type: "speech_metadata",
              style: `Narrate naturally in ${ttsLanguage}, with warm, expressive storytelling, clear diction, varied pacing, and emotion that follows the story. Do not add words or speak scene labels.`
            }]
          }]
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: ttsVoice }] }
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!speechResponse.ok) {
      const details = await speechResponse.text();
      const quotaHint = /429|RESOURCE_EXHAUSTED|quota/i.test(details) ? " Gemini TTS free-tier quota is exhausted; no paid narration fallback was attempted." : "";
      throw new Error(`Gemini narration failed (${speechResponse.status}): ${details.slice(0, 500)}${quotaHint}`);
    }
    const speechResult: {
      output_audio?: { data?: unknown };
      steps?: { content?: { type?: string; data?: unknown }[] }[];
    } = await speechResponse.json();
    const audioBase64 = speechResult?.output_audio?.data
      || speechResult?.steps?.flatMap((step) => step.content || []).find((part) => part.type === "audio")?.data;
    if (typeof audioBase64 !== "string" || !audioBase64) throw new Error("Gemini returned no narration audio data.");
    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (!audioBuffer.byteLength) throw new Error("Gemini returned an empty narration audio file.");
    const audioUrl = await uploadRendererAsset(audioBuffer, `narration_${Date.now()}.wav`, "audio/wav", shotstackKey, j2vKey);
    const audioClips = [{ alias: "narration", asset: { type: "audio", src: audioUrl }, start: 0, length: videoDuration }];

    const captionClip = {
      asset: {
        type: "rich-caption",
        src: "alias://narration",
        font: { family: captionStyle === "Classic" ? "Arapey" : "Roboto", size: 48, color: "#FFFFFF", weight: captionStyle === "Bold" ? 700 : 500 },
        stroke: { width: 2, color: "#000000", opacity: 1 },
        animation: { style: captionStyle === "Bold" ? "highlight" : "none" },
        align: { horizontal: "center", vertical: "middle" }
      },
      start: 0,
      length: "end",
      width: 920,
      height: 300,
      position: "bottom",
      offset: { x: 0, y: 0.08 }
    };

    const shotstackPayload = {
      timeline: {
        background: "#000000",
        tracks: [
          { clips: [captionClip] },
          { clips: audioClips },
          { clips: imageClips }
        ]
      },
      output: { format: "mp4", resolution: "1080", aspectRatio: "9:16" }
    };

    let renderId = "";
    let json2videoProjectId = "";
    let shotstackError = shotstackKey ? "Init failed" : "Not selected";
    let j2vError = j2vKey ? "Not started" : "Not configured";

    if (shotstackKey) {
      try {
        const renderResponse = await fetch('https://api.shotstack.io/edit/v1/render', {
          method: 'POST',
          headers: { 'x-api-key': shotstackKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(shotstackPayload)
        });
        const responseText = await renderResponse.text();
        let renderData: any;
        try { renderData = JSON.parse(responseText); } catch { renderData = null; }
        if (!renderResponse.ok) {
          shotstackError = `HTTP ${renderResponse.status}: ${responseText.slice(0, 700) || renderResponse.statusText}`;
        } else if (renderData?.success && renderData?.response?.id) {
          renderId = renderData.response.id;
          shotstackError = "";
        } else {
          shotstackError = `Unexpected Shotstack response: ${responseText.slice(0, 700)}`;
        }
      } catch(e) {
        shotstackError = e instanceof Error ? e.message : String(e);
        console.error("Shotstack init failed", e);
      }
    }

    // 5. Trigger JSON2Video Render
    if (!renderId && j2vKey) {
      try {
        const j2vPayload = {
          resolution: "1080x1920",
          quality: "high",
          elements: [{ type: "audio", src: audioClips[0].asset.src, duration: -2 }],
          scenes: sceneClips.map((scene, idx) => ({
            duration: sceneDurations[idx],
            elements: [
              { type: "image", src: scene.url },
              { type: "text", text: wrapCaption(scene.caption).join("\n"), style: "caption", settings: { "font-size": "32px", "line-height": "1.15", "max-width": "85%", "text-align": "center" } }
            ]
          }))
        };
        const j2vRes = await fetch("https://api.json2video.com/v2/movies", {
          method: 'POST',
          headers: { 'x-api-key': j2vKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(j2vPayload)
        });
        const j2vData = await j2vRes.json();
        if (j2vData.project) {
          json2videoProjectId = j2vData.project;
          j2vError = "";
        } else j2vError = `Unexpected JSON2Video response: ${JSON.stringify(j2vData).slice(0, 500)}`;
      } catch(e) {
        j2vError = e instanceof Error ? e.message : String(e);
        console.error("JSON2Video init failed", e);
      }
    }

    // 6. Poll for completion of both (Vercel allows up to 60s for server actions)
    let shotstackDone = !renderId;
    let j2vDone = !json2videoProjectId;
    
    let shotstackUrl = "";
    let json2videoUrl = "";
    
    if (renderId) shotstackError = "";
    
    let attempts = 0;
    while ((!shotstackDone || !j2vDone) && attempts < 120) {
      await new Promise(r => setTimeout(r, 5000)); // wait 5 seconds
      
      // Check Shotstack
      if (!shotstackDone && shotstackKey) {
        try {
          const statusResponse = await fetch(`https://api.shotstack.io/edit/v1/render/${renderId}`, {
            headers: { 'x-api-key': shotstackKey }
          });
          const statusData = await statusResponse.json();
          if (statusData?.response?.status) {
            if (statusData.response.status === "done") {
              shotstackUrl = statusData.response.url;
              shotstackDone = true;
            } else if (statusData.response.status === "failed") {
              shotstackError = statusData.response.error || "Unknown Shotstack error";
              shotstackDone = true;
            }
          }
        } catch (e) { }
      }
      
      // Check JSON2Video
      if (!j2vDone && j2vKey) {
        try {
          const j2vRes = await fetch(`https://api.json2video.com/v2/movies?project=${json2videoProjectId}`, {
            headers: { 'x-api-key': j2vKey }
          });
          const j2vData = await j2vRes.json();
          if (j2vData?.movie?.status === "done") {
            json2videoUrl = j2vData.movie.url;
            j2vDone = true;
          } else if (j2vData?.movie?.status === "error") {
            j2vError = j2vData.movie.message || "Unknown JSON2Video error";
            j2vDone = true;
          }
        } catch(e) {}
      }
      
      attempts++;
    }

    if (!shotstackUrl && !json2videoUrl) {
      throw new Error(`Renders failed. Shotstack: ${shotstackError}. JSON2Video: ${j2vError}.`);
    }
    return { videoUrl: shotstackUrl || json2videoUrl, shotstackUrl, json2videoUrl };
  } catch (error: any) {
    console.error("Render Error:", error);
    return { error: error.message };
  }
}

export async function publishToSocials(videoUrl: string, title: string, platforms: string[], userEmail: string = "", hashtags: string[] = [], description: string = "") {
  const { readTokens } = await import('@/app/lib/tokens');
  let tokens: any = await readTokens();
  
  const results: string[] = [];
  let youtubeVideoId: string | undefined = undefined;
  let facebookVideoId: string | undefined = undefined;
  let instagramVideoId: string | undefined = undefined;

  for (const platform of platforms) {
    try {
      if (platform === "YouTube") {
        console.log(`[YouTube API] Uploading ${videoUrl} as "${title}"...`);
        
        if (!tokens.youtube || !tokens.youtube.access_token) {
          throw new Error("YouTube not fully connected. Please reconnect YouTube in Settings.");
        }
        
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.youtube);
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        // Download video to temp file
        const videoRes = await fetch(videoUrl);
        const arrayBuffer = await videoRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const tmpPath = require('path').join(require('os').tmpdir(), `yt_upload_${Date.now()}.mp4`);
        require('fs').writeFileSync(tmpPath, buffer);
        
        try {
          const res = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: title,
                description: `Created with YouTube Automation AI Shorts Generator\n\n${hashtags.join(" ")}`,
                tags: hashtags.map((tag) => tag.replace(/^#/, "")).slice(0, 15),
                categoryId: '22',
              },
              status: {
                privacyStatus: 'public', // Set to public!
                selfDeclaredMadeForKids: false
              },
            },
            media: {
              body: require('fs').createReadStream(tmpPath)
            }
          });
          console.log('YouTube upload successful:', res.data.id);
          youtubeVideoId = res.data.id;
          results.push(`Successfully uploaded to YouTube (Video ID: ${res.data.id})`);
        } finally {
          try { require('fs').unlinkSync(tmpPath); } catch (e) {}
        }
      } 
      else if (platform === "Gmail") {
        console.log(`[Gmail API] Sending email notification with link: ${videoUrl}...`);
        
        if (!tokens.gmail || !tokens.gmail.access_token) {
          throw new Error("Gmail not fully connected. Please reconnect Gmail in Settings.");
        }
        
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials(tokens.gmail);

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        let recipient = userEmail.trim();
        if (!recipient && oauth2Client.credentials.id_token) {
          const ticket = await oauth2Client.verifyIdToken({ idToken: oauth2Client.credentials.id_token, audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID });
          recipient = ticket.getPayload()?.email || "";
        }
        if (!recipient) throw new Error("Could not determine the connected Gmail address.");
        
        // Construct email
        const subject = `Your video is ready: ${title}`;
        const body = `Your AI-generated video "${title}" has finished rendering successfully!\n\nYou can view and download it here:\n${videoUrl}\n\nEnjoy!`;
        const message = [
          `To: ${recipient}`,
          'Content-Type: text/plain; charset=utf-8',
          `Subject: ${subject}`,
          '',
          body
        ].join('\n');
        
        const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage
          }
        });

        results.push("Successfully sent email notification");
      }
      else if (platform === "Facebook") {
        console.log(`[Facebook API] Uploading ${videoUrl}...`);
        const pageId = tokens.facebook?.page_id;
        const pageToken = tokens.facebook?.page_access_token;
        if (!pageId || !pageToken) throw new Error("Facebook Page access is not verified. Reconnect Facebook in Settings and approve Page access.");
        const postRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: pageToken,
            file_url: videoUrl,
            title,
            description: `${description}\n\n${hashtags.join(" ")}`.trim(),
            published: "true"
          })
        });
        const postData = await postRes.json();
        if (!postRes.ok || postData.error || !postData.id) throw new Error(postData.error?.message || `Facebook rejected the video upload (HTTP ${postRes.status}).`);
        
        console.log('Facebook upload successful:', postData.id);
        facebookVideoId = postData.id;
        results.push(`Successfully uploaded to Facebook (Video ID: ${postData.id})`);
      }
      else if (platform === "Instagram") {
        console.log(`[Instagram API] Uploading ${videoUrl}...`);
        const igUserId = tokens.facebook?.instagram_user_id;
        const instagramToken = tokens.facebook?.instagram_access_token || tokens.facebook?.instagram_page_access_token;
        const instagramApi = tokens.facebook?.instagram_access_token ? "https://graph.instagram.com/v26.0" : "https://graph.facebook.com/v26.0";
        if (!instagramToken || !igUserId) throw new Error("Instagram publishing is not verified. Connect a Professional account through Instagram Login.");
        
        const createRes = await fetch(`${instagramApi}/${igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: instagramToken,
            media_type: 'REELS',
            video_url: videoUrl,
            caption: `${title}\n${description}\n\n${hashtags.join(" ")}`
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok || createData.error || !createData.id) throw new Error(createData.error?.message || `Instagram rejected the Reel (HTTP ${createRes.status}).`);
        const creationId = createData.id;
        
        let isFinished = false;
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 4000));
          const statusUrl = new URL(`${instagramApi}/${creationId}`);
          statusUrl.search = new URLSearchParams({ fields: "status_code,status", access_token: instagramToken }).toString();
          const statusRes = await fetch(statusUrl, { cache: "no-store" });
          const statusData = await statusRes.json();
          if (statusData.status_code === 'FINISHED') {
            isFinished = true;
            break;
          } else if (statusData.status_code === 'ERROR') {
            throw new Error(statusData.status || "Instagram failed to process the video.");
          }
        }
        if (!isFinished) throw new Error("Instagram processing timed out.");
        
        const publishRes = await fetch(`${instagramApi}/${igUserId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            access_token: instagramToken,
            creation_id: creationId
          })
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || publishData.error || !publishData.id) throw new Error(publishData.error?.message || `Instagram did not publish the Reel (HTTP ${publishRes.status}).`);
        
        console.log('Instagram upload successful:', publishData.id);
        instagramVideoId = publishData.id;
        results.push(`Successfully uploaded to Instagram (Media ID: ${publishData.id})`);
      }
      else {
        results.push(`Published to ${platform}`);
      }
    } catch (e: any) {
      console.error(`Failed to publish to ${platform}:`, e.message);
      results.push(`Failed to publish to ${platform}: ${e.message}`);
      throw new Error(`Failed to publish to ${platform}: ${e.message}`);
    }
  }

  return { success: true, logs: results, youtubeVideoId, facebookVideoId, instagramVideoId };
}

export async function getPublishedAutomationVideos() {
  const { readTokens } = await import('@/app/lib/tokens');
  let tokens: any = await readTokens();
  if (!tokens || Object.keys(tokens).length === 0) {
    throw new Error("YouTube is not connected on this server.");
  }
  if (!tokens.youtube?.access_token) throw new Error("YouTube is not connected. Reconnect YouTube to recover published videos.");

  const { google } = require("googleapis");
  const oauth2Client = new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials(tokens.youtube);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channels = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const uploadsId = channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return [];
  const uploads = await youtube.playlistItems.list({ part: ["snippet", "contentDetails"], playlistId: uploadsId, maxResults: 50 });
  const items = uploads.data.items || [];
  const videoIds = items.map((item: any) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId).filter(Boolean);
  const metadata = videoIds.length ? await youtube.videos.list({ part: ["snippet"], id: videoIds.join(",") }) : { data: { items: [] } };
  const snippetsById = new Map((metadata.data.items || []).map((video: any) => [video.id, video.snippet]));
  const knownFormats = ["ASMR", "Horror", "Historical", "Motivational", "Sci-Fi", "Romance", "Mystery", "Comedy", "Fantasy", "Food", "Study focus", "Nature"];
  const normalizeFormat = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return items.flatMap((item: any) => {
    const snippet = item.snippet;
    const videoId = item.contentDetails?.videoId || snippet?.resourceId?.videoId;
    if (!videoId || !snippet?.description?.includes("Created with YouTube Automation AI Shorts Generator")) return [];
    const details = snippetsById.get(videoId) || snippet;
    const title = String(details.title || snippet.title || "Generated video");
    const prefix = title.match(/^([^:]{2,24}):/)?.[1]?.trim();
    const format = knownFormats.find((candidate) => normalizeFormat(candidate) === normalizeFormat(prefix || "") || (details.tags || []).some((tag: string) => normalizeFormat(tag) === normalizeFormat(candidate))) || "Short";
    return [{
      id: `youtube-${videoId}`,
      title,
      description: "Recovered from your YouTube uploads.",
      captions: "",
      hashtags: ensureRelevantHashtags(details.tags, `${title} ${details.description || ""}`),
      videoUrl: `https://www.youtube.com/shorts/${videoId}`,
      youtubeVideoId: videoId,
      format,
      createdAt: details.publishedAt ? new Date(details.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: "completed" as const
    }];
  });
}

export async function deleteFromYouTube(videoId: string) {
  const { readTokens } = await import('@/app/lib/tokens');
  let tokens: any = await readTokens();
  if (!tokens || Object.keys(tokens).length === 0) {
    throw new Error("YouTube not connected. Cannot delete from YouTube.");
  }

  if (!tokens.youtube || !tokens.youtube.access_token) {
    throw new Error("YouTube not fully connected. Cannot delete from YouTube.");
  }
  
  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(tokens.youtube);
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    await youtube.videos.delete({ id: videoId });
    return { success: true };
  } catch (error: any) {
    if (error?.code === 404 || error?.response?.status === 404) return { success: true, alreadyAbsent: true };
    console.error("Failed to delete from YouTube:", error);
    throw new Error(error.message || "Failed to delete from YouTube API");
  }
}

export async function deleteFromFacebook(videoId: string) {
  const { readTokens } = await import('@/app/lib/tokens');
  let tokens: any = await readTokens();
  if (!tokens || Object.keys(tokens).length === 0) {
    throw new Error("Facebook not connected.");
  }

  if (!tokens.facebook?.page_id || !tokens.facebook?.page_access_token) {
    throw new Error("Facebook Page access is not verified. Reconnect Facebook in Settings.");
  }
  
  try {
    const delRes = await fetch(`https://graph.facebook.com/v26.0/${videoId}?access_token=${tokens.facebook.page_access_token}`, {
      method: 'DELETE'
    });
    const delData = await delRes.json();
    if (delData.error) {
      if (delData.error.code === 100) return { success: true, alreadyAbsent: true };
      throw new Error(delData.error.message);
    }
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete from Facebook:", error);
    throw new Error(error.message || "Failed to delete from Facebook API");
  }
}

export async function mergeVideos(videoUrls: string[]) {
  try {
    const shotstackKey = process.env.SHOTSTACK_API_KEY;
    if (!shotstackKey) throw new Error("Missing SHOTSTACK_API_KEY");

    let currentStartTime = 0;
    const clips = videoUrls.map(url => {
      const clip = {
        asset: { type: "video", src: url },
        start: currentStartTime,
        length: 15
      };
      currentStartTime += 15;
      return clip;
    });

    const payload = {
      timeline: {
        background: "#000000",
        tracks: [{ clips }]
      },
      output: { format: "mp4", resolution: "1080", aspectRatio: "9:16" }
    };

    const renderResponse = await fetch("https://api.shotstack.io/edit/v1/render", {
      method: "POST",
      headers: { "x-api-key": shotstackKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const renderData = await renderResponse.json();
    if (!renderData.success) throw new Error(renderData.response?.error || "Shotstack merge init failed");
    const renderId = renderData.response.id;

    // Poll for completion
    let done = false;
    let finalUrl = "";
    let errorMsg = "";
    let attempts = 0;
    while (!done && attempts < 120) {
      await new Promise(r => setTimeout(r, 5000));
      const statusResponse = await fetch("https://api.shotstack.io/edit/v1/render/" + renderId, {
        headers: { "x-api-key": shotstackKey }
      });
      const statusData = await statusResponse.json();
      if (statusData?.response?.status) {
        if (statusData.response.status === "done") {
          finalUrl = statusData.response.url;
          done = true;
        } else if (statusData.response.status === "failed") {
          errorMsg = statusData.response.error || "Unknown error";
          done = true;
        }
      }
      attempts++;
    }

    if (errorMsg) return { error: errorMsg };
    if (!finalUrl) return { error: "Timed out waiting for merge" };
    return { url: finalUrl };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function generateContinuationScript(originalPrompt: string, originalCaptions: string, format: string, numImages: number = 3, videoDuration: number = 15) {
  const continuationPrompt = "This is a continuation of a " + format + " video.\nOriginal prompt: " + originalPrompt + "\nWhat happened so far (captions): " + originalCaptions + "\n\nGenerate the NEXT part of the story.";
  return await generateVideoContent(continuationPrompt, format, numImages, videoDuration);
}
