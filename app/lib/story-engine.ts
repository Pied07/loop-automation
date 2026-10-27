import configData from "./models/ai_video_config.json";
import weightsData from "./models/ai_video_weights.json";
import archetypesData from "./models/narrative_archetypes.json";

export interface StoryPart {
  partNumber: number;
  title: string;
  script: string;
  sentences: string[];
  scenes: SceneItem[];
  isLastPart: boolean;
}

export interface SceneItem {
  scene_index: number;
  text: string;
  visual_prompt: string;
  imageUrl?: string;
}

export interface StoryGenerationResult {
  category: string;
  factId: string;
  overallTitle: string;
  numParts: number;
  durationPerPart: number;
  parts: StoryPart[];
  hashtags: string[];
  latent_score: number;
  archetype_theme?: string;
  source: string;
}

interface Archetype {
  theme: string;
  title_template: string;
  c1_pool: ([string, string] | string)[];
  c2_pool: ([string, string] | string)[];
  settings: string[];
  openings: string[];
  beats: string[];
  expansions?: string[];
  cliffhangers?: string[];
  resolutions?: string[];
  cta?: string;
  style_prompt?: string;
}

// Master archetypes database imported directly from bundle
const MASTER_ARCHETYPES: Record<string, Archetype[]> = archetypesData as unknown as Record<string, Archetype[]>;

function vectorizeText(text: string, vocab: Record<string, number>, idf: number[], vocabSize: number = 512): Float32Array {
  const vec = new Float32Array(vocabSize);
  const tokens = text.toLowerCase().match(/\b[a-zA-Z]{2,}\b/g) || [];
  for (const t of tokens) {
    const idx = vocab[t];
    if (idx !== undefined && idx < vocabSize) {
      vec[idx] += 1.0 * (idf[idx] !== undefined ? idf[idx] : 1.0);
    }
  }
  let sumSq = 0;
  for (let i = 0; i < vocabSize; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < vocabSize; i++) {
      vec[i] /= norm;
    }
  }
  return vec;
}

function neuralMLPForward(vector: Float32Array, weights: any): Float32Array {
  if (!weights) {
    return new Float32Array(64);
  }
  const h1 = new Float32Array(128);
  for (let j = 0; j < 128; j++) {
    let sum = weights.intercepts[0][j];
    for (let i = 0; i < 512; i++) {
      sum += vector[i] * weights.coefficient[i][j];
    }
    h1[j] = Math.max(0, sum);
  }

  const h2 = new Float32Array(64);
  for (let j = 0; j < 64; j++) {
    let sum = weights.intercepts1[0][j];
    for (let i = 0; i < 128; i++) {
      sum += h1[i] * weights.coefficient1[i][j];
    }
    h2[j] = Math.max(0, sum);
  }

  const out = new Float32Array(64);
  for (let j = 0; j < 64; j++) {
    let sum = weights.intercepts2[0][j];
    for (let i = 0; i < 64; i++) {
      sum += h2[i] * weights.coefficient2[i][j];
    }
    out[j] = sum;
  }

  return out;
}

function createPseudoRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return {
    next(): number {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    },
    choice<T>(arr: T[]): T {
      const idx = Math.floor(this.next() * arr.length);
      return arr[idx];
    },
    shuffle<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

function buildCleanVisualPrompt(sceneText: string, fallbackSubject: string, styleDescriptor: string): string {
  let clean = sceneText.replace(/\b(?:Part\s+\d+|Welcome back to Part\s+\d+|Follow for Part\s+\d+|Watch Part\s+\d+|Save this video|follow for more|subscribe|share this|comment below)[^.]*/gi, "");
  clean = clean.replace(/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b/gi, "");
  clean = clean.replace(/\b(?:spinal mobility|highway crash|car crash|crash|paralysis|paralyzed|wheelchair|crutches|rehabilitation|hospital|amputation|injured|injury|deformity|deformed|broken|surgery|disease|sick|illness|twisted|severed|bleeding|wound)\b/gi, "");
  clean = clean.replace(/["\'\*_#`~]/g, " ");
  clean = clean.replace(/[^a-zA-Z0-9\s,.-]/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();

  if (clean.length < 12) {
    clean = fallbackSubject;
  } else {
    const sentences = clean.split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 8);
    clean = sentences[0] || clean;
    if (clean.length > 120) {
      clean = clean.slice(0, 120).replace(/\s+\S*$/, "");
    }
  }

  const isHorror = /horror|haunted|ghost|demon|creepy|paranormal|nightmare|asylum|spectral|phantom|shadow/i.test(`${sceneText} ${fallbackSubject} ${styleDescriptor}`);
  const isRealism = /realism|photoreal|35mm/i.test(styleDescriptor);

  let sceneComposition = "";
  if (isHorror) {
    sceneComposition =
      "cinematic wide-angle horror film still, terrifyingly creepy atmosphere, pale ghostly apparition with hollow dark eyes, " +
      "creepy spectral face in the shadows, supernatural mist, haunted abandoned environment, spine-chilling horror movie cinematography, " +
      "James Wan and Guillermo del Toro aesthetic, 35mm film grain, 8k scary masterpiece";
  } else if (isRealism) {
    const faceQuality = "perfect facial symmetry, symmetrical almond eyes, centered focused pupils, harmonious facial features, beautiful natural smile, clean human anatomy";
    sceneComposition = `cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, ${faceQuality}, natural skin texture, photorealistic 8k`;
  } else {
    const faceQuality = "perfect facial symmetry, symmetrical almond eyes, centered focused pupils, harmonious facial features, beautiful natural smile, clean human anatomy";
    sceneComposition = `cinematic wide-angle environmental establishing shot, dynamic action in full scene, deep background architecture and scenery, atmospheric environmental storytelling, ${faceQuality}, unified artistic illustration, seamless character rendering, no deformed face, no collage`;
  }

  return `Cinematic scene of ${clean}, ${sceneComposition}, ${styleDescriptor}, vertical 9:16 framing`;
}

export async function generateStoryParts(params: {
  category: string;
  customTag?: string;
  prompt?: string;
  duration?: number;
  numImages?: number;
  numParts?: number;
  excludeId?: string;
  sceneStyle?: string;
  seed?: number;
}): Promise<StoryGenerationResult> {
  const effectiveCat =
    params.category?.trim().toLowerCase() === "others" && params.customTag?.trim()
      ? params.customTag.trim()
      : (params.category || "Romance").trim();

  let catKey = effectiveCat;
  if (!MASTER_ARCHETYPES[catKey]) {
    for (const k of Object.keys(MASTER_ARCHETYPES)) {
      if (k.toLowerCase() === effectiveCat.toLowerCase() || effectiveCat.toLowerCase().includes(k.toLowerCase())) {
        catKey = k;
        break;
      }
    }
    if (!MASTER_ARCHETYPES[catKey]) {
      catKey = effectiveCat.toLowerCase().includes("love") ? "Romance" : (effectiveCat.toLowerCase().includes("action") ? "Action" : "Interesting Facts");
    }
  }

  const archetypeList = MASTER_ARCHETYPES[catKey] || MASTER_ARCHETYPES["Romance"];
  const prompt = (params.prompt || "").trim();
  const clampedDuration = Math.max(60, Math.min(600, Number(params.duration) || 60));
  const clampedParts = Math.max(1, Math.min(5, Number(params.numParts) || 1));
  const clampedImages = Math.max(1, Math.min(20, Number(params.numImages) || 5));
  const sceneStyle = params.sceneStyle || "Realism";

  // 1. Forward Neural Inference via ONNX Weights
  const queryText = `${effectiveCat} ${params.customTag || ""} ${prompt}`.trim();
  const queryVec = vectorizeText(queryText, configData.vocabulary, configData.idf, configData.vocab_size || 512);
  const latentPred = neuralMLPForward(queryVec, weightsData);

  let sumSq = 0;
  for (let i = 0; i < latentPred.length; i++) sumSq += latentPred[i] * latentPred[i];
  const latentNorm = Math.sqrt(sumSq);

  let charSum = 0;
  for (let i = 0; i < queryText.length; i++) charSum += queryText.charCodeAt(i);

  // Dynamic seed: unique per run, ensuring non-repeating generation
  const seedOffset = params.seed ? Number(params.seed) : Math.floor(Math.random() * 1000000) + 1;
  let seedVal = Math.floor(Math.abs(latentNorm * 100000)) + charSum + (seedOffset % 100000);
  if (params.excludeId && `ml_${catKey.toLowerCase()}_${seedVal}` === params.excludeId) {
    seedVal += 7919;
  }

  // Neural Archetype Selector: picks among multiple diverse archetypes based on continuous latent space + seed
  let latentSum = 0;
  for (let i = 0; i < Math.min(16, latentPred.length); i++) latentSum += Math.abs(latentPred[i]);
  const archetypeIdx = Math.floor(latentSum * 10000 + seedOffset) % archetypeList.length;
  const archetype = archetypeList[archetypeIdx];

  const rng = createPseudoRandom(seedVal);

  // Dynamic Character & Setting Selection from Chosen Archetype
  const c1Pair = rng.choice(archetype.c1_pool);
  const c2Pair = rng.choice(archetype.c2_pool);
  const c1 = Array.isArray(c1Pair) ? c1Pair[0] : c1Pair;
  const r1 = Array.isArray(c1Pair) && c1Pair.length > 1 ? c1Pair[1] : "specialist";
  const c2 = Array.isArray(c2Pair) ? c2Pair[0] : c2Pair;
  const r2 = Array.isArray(c2Pair) && c2Pair.length > 1 ? c2Pair[1] : "specialist";
  let setting = rng.choice(archetype.settings);

  let baseTitle = "";
  if (prompt && prompt.length > 4) {
    baseTitle = prompt.length <= 60 ? prompt : prompt.slice(0, 57).replace(/\s+\S*$/, "") + "...";
    setting = `${setting} to uncover the truth behind ${prompt}`;
  } else {
    baseTitle = archetype.title_template || `The Story of ${c1} & ${c2}`;
  }

  // Duration Calibration: 140 words/min spoken narration
  // 60s -> ~140-150 words (6-8 sentences); 120s -> ~280-300 words (14-16 sentences)
  const targetWordsPerPart = Math.max(120, Math.floor((clampedDuration * 140) / 60));
  const partsData: StoryPart[] = [];

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = pNum === clampedParts;
    const partSentences: string[] = [];

    if (pNum === 1) {
      const rawOpen = rng.choice(archetype.openings);
      const opening = rawOpen
        .replace(/\{c1\}/g, c1)
        .replace(/\{r1\}/g, r1)
        .replace(/\{c2\}/g, c2)
        .replace(/\{r2\}/g, r2)
        .replace(/\{setting\}/g, setting);
      partSentences.push(opening);
    } else {
      partSentences.push(`Welcome back to Part ${pNum}. Picking up right as ${c1} and ${c2} pushed deeper into the mystery...`);
    }

    const coreBeatsPool = (archetype.beats || []).map((b) =>
      b.replace(/\{c1\}/g, c1).replace(/\{c2\}/g, c2).replace(/\{setting\}/g, setting)
    );
    const shuffledBeats = rng.shuffle(coreBeatsPool);

    const expPool = (archetype.expansions || []).map((e) =>
      e.replace(/\{c1\}/g, c1).replace(/\{c2\}/g, c2).replace(/\{setting\}/g, setting)
    );
    const shuffledExp = rng.shuffle(expPool);

    for (const beat of shuffledBeats) {
      if (!partSentences.includes(beat)) {
        partSentences.push(beat);
      }
      const currentWords = partSentences.join(" ").split(/\s+/).length;
      if (currentWords >= targetWordsPerPart - 45) {
        break;
      }
    }

    let currentWords = partSentences.join(" ").split(/\s+/).length;
    for (const exp of shuffledExp) {
      if (currentWords >= targetWordsPerPart - 40) {
        break;
      }
      if (!partSentences.includes(exp)) {
        partSentences.push(exp);
        currentWords += exp.split(/\s+/).length;
      }
    }

    if (!isLast) {
      const cliffList = archetype.cliffhangers && archetype.cliffhangers.length > 0
        ? archetype.cliffhangers
        : ["What happened next stunned everyone... Follow right now for Part {next_part}!"];
      const cliffTemplate = rng.choice(cliffList);
      const cliff = cliffTemplate
        .replace(/\{c1\}/g, c1)
        .replace(/\{c2\}/g, c2)
        .replace(/\{next_part\}/g, String(pNum + 1));
      partSentences.push(cliff);
    } else {
      const resList = archetype.resolutions && archetype.resolutions.length > 0
        ? archetype.resolutions
        : ["Against all odds, they proved that courage and faith conquer all."];
      const resTemplate = rng.choice(resList);
      const resolution = resTemplate.replace(/\{c1\}/g, c1).replace(/\{c2\}/g, c2);
      partSentences.push(resolution);
      const cta = archetype.cta || "Save this video right now and follow for more daily stories!";
      partSentences.push(cta);
    }

    const scriptText = partSentences.join(" ");

    const scenes: SceneItem[] = [];
    const nSents = partSentences.length;
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const start = Math.floor((sIdx * nSents) / clampedImages);
      let end = Math.floor(((sIdx + 1) * nSents) / clampedImages);
      if (start === end) end = Math.min(nSents, start + 1);
      const chunk = partSentences.slice(start, end);
      const sceneText = chunk.length > 0 ? chunk.join(" ") : partSentences[Math.min(sIdx, nSents - 1)];

      const vPrompt = buildCleanVisualPrompt(
        sceneText,
        `${c1}, ${c2}, ${setting}`,
        `${sceneStyle} style, ${archetype.style_prompt || "photorealistic 8k"}`
      );

      scenes.push({
        scene_index: sIdx,
        text: sceneText,
        visual_prompt: vPrompt,
      });
    }

    const partTitle = clampedParts > 1 ? `${baseTitle} (Part ${pNum})` : baseTitle;
    partsData.push({
      partNumber: pNum,
      title: partTitle,
      script: scriptText,
      sentences: partSentences,
      scenes,
      isLastPart: isLast,
    });
  }

  const categoryTags: Record<string, string[]> = {
    Romance: ["lovequotes", "relationshipgoals", "heartfelt", "emotionalmoments", "wholesomelove", "romanticvibes", "soulmate", "truelove"],
    Horror: ["creepypasta", "scarystories", "horrorstory", "unexplained", "paranormal", "chilling", "spookyvibes", "darkmystery"],
    Action: ["actionmovie", "adrenaline", "blockbuster", "thriller", "highstakes", "cinematic", "mission", "epicbattle"],
    Adventure: ["wilderness", "exploration", "hiddenplaces", "uncharted", "survival", "natgeo", "adventuretime", "expedition"],
    Motivational: ["discipline", "successmindset", "nevergiveup", "grindneverstops", "hardwork", "mindsetmatters", "resilience", "dailyroutine"],
    "Interesting Facts": ["mindblowingfacts", "didyouknow", "untoldhistory", "mystery", "randomfacts", "learnontiktok", "educational", "curiosity"],
    Comedy: ["funnyvideos", "hilarious", "relatablehumor", "comedyclub", "epicfail", "trynottolaugh", "chaoticenergy", "parody"],
    Educational: ["sciencefacts", "quantumphysics", "deepdive", "stem", "learnsomethingnew", "discovery", "astronomy", "curiousminds"],
    Food: ["foodie", "streetfood", "masterchef", "culinaryarts", "recipes", "deliciousfood", "foodtok", "comfortfood"],
    Music: ["musichistory", "analogwarmth", "behindthetrack", "producertok", "sounddesign", "vintageaudio", "legendarybeats", "musicdiscovery"],
  };

  const hashtags = categoryTags[catKey] || ["viral", "trending", "shorts", "fyp", "storytime"];

  return {
    category: effectiveCat,
    factId: `ml_${catKey.toLowerCase()}_${seedVal}`,
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
    hashtags,
    latent_score: latentNorm,
    archetype_theme: archetype.theme || "Original Story",
    source: "user_trained_onnx_ml_model",
  };
}
