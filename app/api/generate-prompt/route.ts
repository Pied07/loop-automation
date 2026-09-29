import { NextResponse } from "next/server";

type PromptDetails = {
  format: string;
  duration: number;
  imageCount: number;
  imageStyle: string;
  captionStyle: string;
  voice: string;
  language: string;
};

export async function POST(request: Request) {
  let body: { idea?: unknown; details?: Partial<PromptDetails> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.slice(0, 12000) : "";
  const details = body.details;
  if (!details || typeof details !== "object"
    || typeof details.format !== "string"
    || !Number.isFinite(Number(details.duration))
    || !Number.isFinite(Number(details.imageCount))
    || typeof details.imageStyle !== "string"
    || typeof details.captionStyle !== "string"
    || typeof details.voice !== "string"
    || typeof details.language !== "string") {
    return NextResponse.json({ success: false, error: "Fill in all production settings before building the prompt." }, { status: 400 });
  }

  const safeDetails: PromptDetails = {
    format: details.format.slice(0, 100),
    duration: Math.max(1, Math.min(60, Math.floor(Number(details.duration)))),
    imageCount: Math.max(1, Math.min(10, Math.floor(Number(details.imageCount)))),
    imageStyle: details.imageStyle.slice(0, 100),
    captionStyle: details.captionStyle.slice(0, 100),
    voice: details.voice.slice(0, 100),
    language: details.language.slice(0, 50),
  };
  const ideaOrFallback = idea.trim() || `Invent a fresh, original ${safeDetails.format} story with a compelling opening and satisfying payoff.`;
  const prompt = `Create a complete production prompt for a ${safeDetails.format} short video, preserving the user's idea and all specific scene details below. Do not replace named characters, location, lighting, palette, camera directions, mood, or frame descriptions with generic alternatives.

USER'S IDEA AND VISUAL DIRECTIONS:
${ideaOrFallback}

PRODUCTION SETTINGS:
- Total duration: exactly ${safeDetails.duration} seconds.
- Visuals: exactly ${safeDetails.imageCount} distinct vertical 9:16 frames, paced across the video.
- Image style: ${safeDetails.imageStyle}.
- Caption style: ${safeDetails.captionStyle}; apply this only to readable spoken subtitles, never put text in generated images.
- Narration voice: ${safeDetails.voice}.
- Narration language: ${safeDetails.language}.

Expand the user's material into a coherent beginning, middle, and payoff that fits the duration. Keep the same characters, location, lighting, and palette across frames wherever requested. Specify what each frame shows, with no scene labels spoken aloud, no lettering in images, and captions timed to narration. Return only the finished prompt.`;

  const fallback = `${safeDetails.format} short video production prompt

Story idea: ${ideaOrFallback}

Production requirements:
- Runtime: exactly ${safeDetails.duration} seconds.
- Create exactly ${safeDetails.imageCount} distinct vertical 9:16 images, paced across the runtime.
- Visual style: ${safeDetails.imageStyle}. Keep characters, location, lighting, and palette consistent wherever applicable.
- Narration: ${safeDetails.voice}, in ${safeDetails.language}. Write a complete beginning-to-ending script sized to ${safeDetails.duration} seconds. Narration must contain story text only; do not speak scene numbers, labels, or directions.
- Divide the story into exactly ${safeDetails.imageCount} visual beats. For each beat, provide the spoken narration and a detailed, text-free image prompt describing a distinct moment.
- Captions: ${safeDetails.captionStyle}, legible within vertical safe areas, wrapped into short lines, and timed to the spoken narration.
- Open with a compelling hook and deliver a clear emotional payoff. Do not add lettering, subtitles, or watermark to the images.`;

  const errors: string[] = [];
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 700 }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const text = (await response.json())?.choices?.[0]?.message?.content?.trim();
        if (typeof text === "string" && text.length > 30) return NextResponse.json({ success: true, prompt: text });
      } else errors.push(`Groq HTTP ${response.status}`);
    } catch (error) {
      errors.push(`Groq ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 700 } }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const text = (await response.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (typeof text === "string" && text.length > 30) return NextResponse.json({ success: true, prompt: text });
      } else errors.push(`Gemini HTTP ${response.status}`);
    } catch (error) {
      errors.push(`Gemini ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  const pollinationsKey = process.env.POLLINATION_API_KEY?.trim() || process.env.POLLINATIONS_API_KEY?.trim() || process.env.POLLINATIONS_KEY?.trim();
  if (pollinationsKey) {
    try {
      const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${pollinationsKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai", messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const text = (await response.json())?.choices?.[0]?.message?.content?.trim();
        if (typeof text === "string" && text.length > 30) return NextResponse.json({ success: true, prompt: text });
      } else errors.push(`Pollinations HTTP ${response.status}`);
    } catch (error) {
      errors.push(`Pollinations ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  console.warn("AI prompt providers unavailable; returning local prompt fallback:", errors.join(" | "));
  return NextResponse.json({ success: true, prompt: fallback, fallback: true });
}
