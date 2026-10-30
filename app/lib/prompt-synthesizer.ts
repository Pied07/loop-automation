/**
 * STORY & VISUAL SCENE PROMPT SYNTHESIZER
 * Synthesizes any user input into a rich, cinematic, high-fidelity diffusion prompt.
 * Guaranteed face/eye alignment, proper anatomy, and style-accurate lighting.
 */

const FILLER_PATTERNS = [
  /\bwelcome\s+(?:back\s+)?to\s+(?:part\s+\d+|our\s+video|the\s+channel)\b[!,.]?/gi,
  /\bpart\s+\d+[:\s-]*/gi,
  /\b(?:today\s+)?we\s+will\s+(?:explore|uncover|look\s+at|discover|talk\s+about)\b/gi,
  /\bin\s+this\s+(?:video|part|episode|short|reel)\b/gi,
  /\bdid\s+you\s+know(?:\s+that)?\b/gi,
  /\bhave\s+you\s+ever\s+wondered\b/gi,
  /\bwatch\s+(?:until|till)\s+the\s+end\b/gi,
  /\blike\s+and\s+subscribe\b/gi,
  /\bcomment\s+down\s+below\b/gi,
  /\bthe\s+truth\s+will\s+shock\s+you\b/gi,
  /\bnumber\s+\d+[:\s]*/gi,
  /\blet'?s\s+dive\s+in\b/gi,
  /\bstay\s+tuned\b/gi,
  /\bfollow\s+(?:right\s+now\s+)?for\s+part\s+\d+.*$/gi,
];

const CHARACTER_PATTERNS = [
  /\b(?:man|woman|boy|girl|person|people|someone|anyone|human|humans|explorer|detective|scientist|doctor|nurse|teacher|professor|student|engineer|worker|pilot|astronaut|chef|cook|artist|musician|singer|dancer|athlete|runner|boxer|warrior|soldier|guard|knight|wanderer|traveler|stranger|samurai|ronin|ninja|monk|assassin|hunter|archer|wizard|mage|witch|sorcerer|king|queen|prince|princess|hero|heroine|protagonist|villain|model|child|children|teen|adult)\b/i,
  /\b(?:he|she|they|him|her)\s+(?:walked|stepped|looked|gazed|ran|turned|whispered|froze|reached|stood|held|sat|saw|watched|crawled|pressed|smiled|cried|spoke)\b/i,
  /\b(?:female|male|lady|gentleman|guy|fellow|character|hero|protagonist|beauty|crowd)\b/i,
];

interface StylePreset {
  prefix: string;
  lighting: string;
  suffix: string;
  charFraming: string;
  envFraming: string;
}

const STYLE_PRESETS: Record<string, StylePreset> = {
  "Anime / Manga": {
    prefix: "masterpiece high definition 2D Japanese anime digital key visual, Ufotable Makoto Shinkai style, clean delicate lineart",
    lighting: "radiant cinematic rim lighting, warm golden ambient glow, luminous energy bloom, 8k anime wallpaper",
    suffix: "trending on Pixiv, clean delicate anime lineart, expressive luminous anime eyes, polished digital anime illustration, 8k wallpaper",
    charFraming: "cinematic anime shot, clear visible stance, prominent hero focus, dynamic anime composition",
    envFraming: "traditional Japanese pavilion, hanging warm lanterns, soft bokeh blur",
  },
  "Realistic / Photorealism": {
    prefix: "masterpiece raw 35mm DSLR color photograph, ultra-photorealistic, shot on Sony A7R V, 85mm f/1.4 GM lens",
    lighting: "natural golden hour lighting, cinematic rim light, authentic optical depth of field, soft realistic bokeh, physical light bounce",
    suffix: "award-winning National Geographic portrait photography, authentic human skin texture with pores, lifelike features, 8k UHD, true photorealism",
    charFraming: "cinematic on-location portrait photograph, natural authentic posture, shallow depth of field, perfectly proportioned anatomy",
    envFraming: "breathtaking on-location outdoor landscape photography, natural lighting, high dynamic range, sharp organic details",
  },
  "Cinematic Film": {
    prefix: "cinematic film still, 35mm Panavision anamorphic lens photography",
    lighting: "dramatic atmospheric lighting, natural depth of field, chiaroscuro contrast",
    suffix: "photorealistic 8k, Panavision anamorphic lens, award-winning cinematography, ultra-detailed textures",
    charFraming: "cinematic medium shot, natural posture, integrated with environment",
    envFraming: "wide establishing shot, atmospheric depth, rich environmental storytelling",
  },
  "3D Animation / Pixar": {
    prefix: "Pixar Disney 3D animation style, beautifully rendered CGI scene",
    lighting: "warm cinematic studio 3D lighting, subsurface scattering, soft volumetric rim light",
    suffix: "Unreal Engine 5 Octane render 8k, polished animated movie still",
    charFraming: "expressive 3D animated character, charming stylized features, natural pose",
    envFraming: "whimsical 3D animated environment, rich warm textures, delightful atmosphere",
  },
  "Sci-Fi Cyberpunk": {
    prefix: "cyberpunk film still, sharp focus, futuristic metropolis",
    lighting: "glowing neon reflections, futuristic atmospheric haze, moody rain-slicked lighting",
    suffix: "Blade Runner aesthetic, Unreal Engine 5 render, high tech atmosphere, 8k",
    charFraming: "cyber operative in tactical gear, natural dynamic angle, neon reflections",
    envFraming: "towering futuristic skyline, intricate cybernetic details, atmospheric haze",
  },
  "Epic Fantasy": {
    prefix: "epic fantasy digital concept art, masterpiece",
    lighting: "volumetric mist, ethereal god rays, ancient majesty",
    suffix: "artstation trending, 8k resolution, highly detailed fantasy scenery, breathtaking scale",
    charFraming: "heroic cinematic shot, fantasy adventurer in context, sweeping perspective",
    envFraming: "grand sweeping landscape, monumental ancient architecture, mythical atmosphere",
  },
  "Dark Fantasy / Horror": {
    prefix: "dark fantasy cinematic digital concept art, gothic painterly illustration",
    lighting: "volumetric dark mist, glowing magical runes, dramatic torchlight and moonlit shadows",
    suffix: "Elden Ring aesthetic, ArtStation trending, seamless painterly rendering, 8k",
    charFraming: "lone wanderer in ornate armor, atmospheric concept art composition",
    envFraming: "monumental gothic fortress, ominous misty ruins, dark enchanted wilderness",
  },
  "Comic Book / Graphic Novel": {
    prefix: "vintage retro comic book art panel, classic graphic novel illustration",
    lighting: "bold black ink contour lines, dramatic comic noir shadows, pop-art halftone dots",
    suffix: "detailed cross-hatching, classic comic book aesthetic, 8k comic artwork",
    charFraming: "dynamic comic character stance, classic illustrative style",
    envFraming: "stylized graphic novel background, dramatic ink perspectives",
  },
  "Photorealistic Nature": {
    prefix: "National Geographic documentary photography, crisp organic details",
    lighting: "golden hour sunlight, clean natural illumination, high contrast",
    suffix: "8k UHD, pin-sharp focus, award-winning nature photography",
    charFraming: "documentary field explorer observed from natural distance, environmental context",
    envFraming: "pristine wilderness, breathtaking natural formations, ultra-fine foliage textures",
  },
};

export function cleanNarration(text: string): string {
  let cleaned = text;
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

export function synthesizeScenePrompt(
  userInput: string,
  options?: {
    stylePreset?: string;
    aspectRatio?: string;
    category?: string;
    topic?: string;
  }
): string {
  const raw = (userInput || "").trim();
  if (!raw) return "";

  const stylePreset = options?.stylePreset || "Cinematic Film";
  const aspectRatio = options?.aspectRatio || "9:16 (Shorts / Reels)";
  const category = (options?.category || "Custom").toLowerCase();
  const topic = options?.topic || "";

  // If user selected "Raw Prompt Only", return clean raw
  if (stylePreset.toLowerCase().includes("raw")) {
    return raw;
  }

  // Clean narration fillers
  const cleaned = cleanNarration(raw);
  const visualCore = cleaned.length >= 4 ? cleaned : raw;

  // Limit core to 35 words so it fits in CLIP context
  const words = visualCore.split(/\s+/);
  const compactCore = words.length > 35 ? words.slice(0, 35).join(" ") : visualCore;

  // Find matching style preset
  let matchedPreset = STYLE_PRESETS[stylePreset];
  if (!matchedPreset) {
    const sLower = stylePreset.toLowerCase();
    for (const [key, val] of Object.entries(STYLE_PRESETS)) {
      if (sLower.includes(key.toLowerCase()) || key.toLowerCase().includes(sLower)) {
        matchedPreset = val;
        break;
      }
    }
  }
  if (!matchedPreset) {
    matchedPreset = STYLE_PRESETS["Cinematic Film"];
  }

  const sLower = stylePreset.toLowerCase();
  const isAnime = /anime|manga|ghibli|cartoon/i.test(sLower);
  const isDisney = /disney|pixar|3d/i.test(sLower);
  const isCyberpunk = /cyber|sci-fi|futuristic/i.test(sLower);
  const isComic = /comic|graphic/i.test(sLower);
  const isDark = /dark|horror|gothic/i.test(sLower) || category.includes("horror");

  // Character presence
  const hasCharacters = CHARACTER_PATTERNS.some((p) => p.test(compactCore)) ||
    /\b(?:smile|laugh|gaze|look|stare|eyes|face|hand|touch|embrace|walked|stepped|couple|duo|together)\b/i.test(compactCore);

  const isCouple = /\b(?:two|both|together|couple|pair|duo|holding\s+hands|hand\s+in\s+hand)\b/i.test(compactCore) ||
    (/\b(?:man|boy|he)\b/i.test(compactCore) && /\b(?:woman|girl|she)\b/i.test(compactCore));

  const framingTag = aspectRatio.includes("16:9")
    ? "widescreen 16:9 cinematic framing"
    : aspectRatio.includes("1:1")
    ? "square 1:1 balanced composition"
    : aspectRatio.includes("4:3")
    ? "classic 4:3 standard framing"
    : "vertical 9:16 mobile composition";

  const parts: string[] = [];

  // 1. Style prefix
  parts.push(matchedPreset.prefix);

  // 2. Main subject with visual core
  parts.push(`cinematic scene of ${compactCore}`);

  // 3. Staging and anti-distortion anatomical guarantees
  if (isCouple) {
    if (isAnime) {
      parts.push(
        "two anime characters together side by side, natural graceful posture, " +
        "both characters facing consistent natural direction, authentic anatomically correct necks, " +
        "beautifully drawn faces, perfectly aligned symmetrical anime eyes, sharp clear pupils, " +
        "natural gentle expressions, exactly two arms each, five fingers per hand, distinct separate bodies, no conjoined limbs"
      );
    } else {
      parts.push(
        "two people together side by side, natural realistic posture, " +
        "both characters facing consistent natural direction, authentic anatomically correct necks, " +
        "beautifully rendered faces, perfectly aligned symmetrical eyes, sharp clear pupils, " +
        "authentic facial expressions, exactly two arms each, five fingers per hand, distinct separate bodies, no conjoined limbs"
      );
    }
  } else if (hasCharacters) {
    const isFemale = /\b(?:woman|girl|female|lady|queen|princess|actress|she|her)\b/i.test(compactCore);
    const isMale = /\b(?:man|boy|male|guy|king|prince|actor|he|him)\b/i.test(compactCore);
    const charTag = isFemale ? "1woman" : isMale ? "1man" : "1person";

    if (isAnime) {
      parts.push(
        `single anime ${charTag}, natural graceful posture, ` +
        "head and body facing consistent natural direction, authentic anatomically correct neck, " +
        "single head, perfectly aligned symmetrical anime eyes, sharp detailed pupils, clear iris, " +
        "exactly two arms, five fingers per hand, correct anatomical proportions, no duplicate bodies"
      );
    } else {
      parts.push(
        `centered single ${charTag}, natural realistic posture, ` +
        "head and body facing consistent natural direction, authentic anatomically correct neck, " +
        "single head, perfectly aligned symmetrical eyes, sharp detailed pupils, clear iris, " +
        "exactly two arms, five fingers per hand, correct anatomical proportions, no duplicate bodies"
      );
    }
  } else {
    parts.push("detailed environment, authentic physical textures, rich architectural depth, sharp clean focus, scenic view, no humans, no characters");
  }

  // 4. Atmospheric lighting
  parts.push(matchedPreset.lighting);

  // 5. Finishing polish & framing
  parts.push(matchedPreset.suffix);
  parts.push(framingTag);

  return parts.join(", ");
}
