import configData from "./models/ai_video_config.json";
import weightsData from "./models/ai_video_weights.json";

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
  source: string;
}

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

function neuralMLPForward(vector: Float32Array, weights: Record<string, any>): Float32Array {
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
  clean = clean.replace(/["'*_#`~]/g, " ");
  clean = clean.replace(/[^a-zA-Z0-9\s,.-]/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();

  let visualAction = "";
  if (clean.length >= 10) {
    const sents = clean.split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 5);
    visualAction = sents.slice(0, 2).join(". ");
    if (visualAction.length > 160) {
      visualAction = visualAction.slice(0, 160).replace(/\s+\S*$/, "");
    }
  }

  if (!visualAction || visualAction.length < 8) {
    visualAction = fallbackSubject;
  } else if (fallbackSubject && !visualAction.toLowerCase().includes(fallbackSubject.toLowerCase().split(",")[0].trim())) {
    const settingPart = fallbackSubject.split(",").slice(-1)[0]?.trim();
    if (settingPart && settingPart.length > 3) {
      visualAction = `${visualAction}, set in ${settingPart}`;
    }
  }

  const isHorror = /horror|haunted|ghost|demon|creepy|paranormal|nightmare|asylum|spectral|phantom|shadow/i.test(`${sceneText} ${fallbackSubject} ${styleDescriptor}`);
  const isRealism = /realism|photoreal|35mm/i.test(styleDescriptor);
  const isAnime = /anime|manga|ghibli/i.test(styleDescriptor);
  const isDisney = /disney|pixar|3d/i.test(styleDescriptor);

  let styleTag = "";
  if (isHorror) {
    styleTag = "cinematic horror film still, chilling atmospheric lighting, deep shadows, 35mm film photography, 8k";
  } else if (isAnime) {
    styleTag = "Makoto Shinkai anime movie still, beautiful high quality Japanese animation scenery, vivid cinematic lighting";
  } else if (isDisney) {
    styleTag = "Pixar 3D animated film still, Unreal Engine 5 render, volumetric studio lighting";
  } else if (isRealism) {
    styleTag = "cinematic 35mm film still, natural atmospheric lighting, high detail, photorealistic 8k";
  } else {
    styleTag = `${styleDescriptor}, cinematic lighting, photorealistic 8k`;
  }

  return `Cinematic shot of ${visualAction}, ${styleTag}, vertical 9:16 composition`;
}

const CHARACTER_REGISTRY: Record<string, [string, string, string, string][]> = {
  Horror: [
    ["Damian", "a night-shift archivist", "Elena", "a paranormal acoustic specialist"],
    ["Victor", "an investigative reporter", "Maya", "a sound engineer"],
    ["Arthur", "a lighthouse keeper", "Clara", "a maritime historian"],
    ["Julian", "a rare manuscript restorer", "Naomi", "a folklorist"],
    ["Marcus", "an urban explorer", "Evelyn", "a structural engineer"],
    ["Gabriel", "a radio broadcaster", "Sophia", "a frequency technician"],
  ],
  Romance: [
    ["Julian", "an antique horologist", "Elena", "a concert cellist"],
    ["Liam", "an architectural designer", "Clara", "an art gallery curator"],
    ["Ethan", "a vintage bookshop owner", "Grace", "a travel photographer"],
    ["Mateo", "a botanical illustrator", "Chloe", "a classical pianist"],
    ["Noah", "an acoustic composer", "Isla", "a museum archivist"],
    ["Alexander", "a film preservationist", "Valeria", "a screen director"],
  ],
  Action: [
    ["Cole", "a tactical rescue specialist", "Vance", "a field operative"],
    ["Kaelen", "a cybersecurity operative", "Ren", "an extraction driver"],
    ["Darek", "a reconnaissance scout", "Jocelyn", "a combat drone engineer"],
    ["Torin", "a high-altitude climber", "Sena", "an expedition medic"],
    ["Jax", "a structural demolitions expert", "Corina", "a surveillance analyst"],
  ],
  Adventure: [
    ["Nolan", "a deep-sea cartographer", "Amara", "a marine biologist"],
    ["Finnian", "an uncharted cavern surveyor", "Kira", "a paleoclimatologist"],
    ["Lucas", "an aerial explorer", "Talia", "a wilderness survivalist"],
    ["Declan", "an archaeological surveyor", "Freya", "an ancient linguist"],
  ],
  Motivational: [
    ["Jordan", "a relentless marathoner", "Marcus", "a mental resilience coach"],
    ["Devin", "an independent aerospace builder", "Serena", "a lead propulsion scientist"],
    ["Kai", "an endurance cyclist", "Elena", "a sports physiologist"],
    ["Caleb", "a self-made craftsman", "Mira", "an industrial innovator"],
  ],
  Educational: [
    ["Professor Vance", "a quantum physicist", "Dr. Lin", "an astrophysics researcher"],
    ["Dr. Aris", "a neurobiologist", "Tessa", "a cognitive data scientist"],
    ["Felix", "a deep-core geologist", "Dr. Mercer", "a planetary scientist"],
  ],
  Comedy: [
    ["Barney", "an over-enthusiastic barista", "Penny", "a skeptical regular customer"],
    ["Toby", "an accident-prone delivery driver", "Gemma", "a frantic event coordinator"],
    ["Milo", "a self-proclaimed escape artist", "Rosie", "his exhausted stage assistant"],
  ],
  Food: [
    ["Chef Marco", "a perfectionist pasta maker", "Alessia", "an underground food critic"],
    ["Kenji", "a midnight ramen artisan", "Yuki", "a culinary fermentation specialist"],
    ["Santiago", "a wood-fired bakery master", "Carmen", "a heritage grain farmer"],
  ],
  Music: [
    ["Adrian", "an analog tape mastering engineer", "Lyra", "an avant-garde synth prodigy"],
    ["Miles", "a jazz trumpet virtuoso", "Eva", "a vinyl record label founder"],
    ["Dorian", "a modular synthesizer designer", "Sora", "an ambient sound designer"],
  ],
  Trending: [
    ["Zack", "an investigative content creator", "Tara", "a live stream producer"],
    ["Kieran", "a tech whistleblower", "Noelle", "an independent digital analyst"],
  ],
};

const SETTING_REGISTRY: Record<string, string[]> = {
  Horror: [
    "a decommissioned coastal broadcast tower wrapped in heavy sea mist",
    "the subterranean archives beneath an abandoned 19th-century asylum",
    "a desolate high-altitude observatory cut off by an approaching blizzard",
    "an antique mirror restoration hall in Venice where every reflection lags by half a second",
    "an isolated radio relay station in northern Maine during a total blackout",
    "a forgotten deep-water shipping vessel found adrift with warm engines and no crew",
  ],
  Romance: [
    "a rain-slicked cobblestone courtyard in Paris beneath the amber glow of streetlamps",
    "a candlelit antique bookshop tucked between quiet canals in Amsterdam",
    "a windswept clifftop terrace overlooking the Mediterranean at dusk",
    "a snowbound train carriage traveling through the Scottish Highlands at midnight",
    "an overgrown botanical glasshouse glowing under the soft autumn twilight",
  ],
  Action: [
    "the rain-soaked rooftop of a neon-lit skyscraper high above Shanghai",
    "a high-speed bullet train racing along the Pacific coast during a storm",
    "a fortified offshore oil platform converted into a black-site server facility",
    "a crumbling subterranean transit tunnel under heavy perimeter surveillance",
  ],
  Adventure: [
    "an uncharted volcanic archipelago shrouded in perpetual geothermal vapor",
    "a subterranean crystal labyrinth five hundred meters beneath the Antarctic ice sheet",
    "an ancient lost temple half-swallowed by the dense jungle canopy of Central America",
    "a treacherous mountain pass in the Andes where magnetic compasses spin uncontrollably",
  ],
  Motivational: [
    "a quiet solitary gym at 4:30 AM before the city begins to wake",
    "the steep rocky switchbacks leading up the final ascent of Mount Rainier",
    "a modest garage workshop where the lights stay on long past midnight",
    "the finish line of a grueling hundred-mile desert ultramarathon",
  ],
  Educational: [
    "the observation platform of the Atacama Large Millimeter Array under crystal stars",
    "a sterile cleanroom lab housing the world's most sensitive gravitational wave detector",
    "a high-pressure deep-sea exploration submersible two miles below sea level",
  ],
  Comedy: [
    "a wildly chaotic specialty bakery on the morning of a royal wedding order",
    "an overcrowded subway platform during an unexpected flash mob rehearsal",
    "a wildly over-engineered smart home having a complete electronic meltdown",
  ],
  Food: [
    "a bustling midnight street-food stall in the neon-lit alleys of Osaka",
    "a centuries-old rustic stone mill in Tuscany dusted with heirloom flour",
    "a high-octane Michelin-star kitchen during the peak of dinner service",
  ],
  Music: [
    "a dimly lit Abbey Road mastering studio packed with vintage tube amplifiers",
    "a subterranean jazz club in New Orleans where the music never stops until dawn",
    "a high-ceilinged cathedral recording chamber resonating with pure acoustic reverb",
  ],
  Trending: [
    "a high-tech creator studio lit with dynamic cyber-cyan and amber lights",
    "the control room of a viral live-stream event counting down to zero",
  ],
};

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
  const catParam = (params.category || "Horror").trim();
  const knownCategories = [
    "Trending", "Comedy", "Motivational", "Horror", "Educational",
    "Romance", "Adventure", "Music", "Food", "Action"
  ];

  let effectiveCat = "Trending";
  for (const kc of knownCategories) {
    if (kc.toLowerCase() === catParam.toLowerCase()) {
      effectiveCat = kc;
      break;
    }
  }

  const prompt = (params.prompt || "").trim();
  const clampedDuration = Math.max(60, Math.min(600, Number(params.duration) || 60));
  const clampedParts = Math.max(1, Math.min(5, Number(params.numParts) || 1));
  const clampedImages = Math.max(1, Math.min(20, Number(params.numImages) || 5));
  const sceneStyle = params.sceneStyle || "Realism";

  // 1. Forward Neural Inference via User Trained MLP Weights
  const queryText = `${effectiveCat} ${params.customTag || ""} ${prompt}`.trim();
  const queryVec = vectorizeText(queryText, configData.vocabulary, configData.idf, configData.vocab_size || 512);
  const latentPred = neuralMLPForward(queryVec, weightsData);

  let sumSq = 0;
  for (let i = 0; i < latentPred.length; i++) sumSq += latentPred[i] * latentPred[i];
  const latentNorm = Math.sqrt(sumSq);

  let charSum = 0;
  for (let i = 0; i < queryText.length; i++) charSum += queryText.charCodeAt(i);

  // Dynamic seed unique per run / regenerate click
  const seedOffset = params.seed && params.seed > 0 ? Number(params.seed) : (Date.now() % 1000000 + Math.floor(Math.random() * 99999));
  let seedVal = Math.floor(Math.abs(latentNorm * 100000)) + charSum + (seedOffset % 100000);
  if (params.excludeId && `ml_${effectiveCat.toLowerCase()}_${seedVal}` === params.excludeId) {
    seedVal += 7919;
  }

  const rng = createPseudoRandom(seedVal);

  // 2. Sample Characters & Setting from Continuous Latent Sub-spaces
  const catChars = CHARACTER_REGISTRY[effectiveCat] || CHARACTER_REGISTRY["Trending"];
  let charLatentSum = 0;
  for (let i = 0; i < Math.min(16, latentPred.length); i++) charLatentSum += Math.abs(latentPred[i]);
  const charIdx = Math.floor(charLatentSum * 1000 + seedVal) % catChars.length;
  let [c1, c1Role, c2, c2Role] = catChars[charIdx];

  if (prompt) {
    const userWords = prompt.match(/\b[A-Z][a-z]+\b/g) || [];
    const validWords = userWords.filter(w => !["The", "A", "An", "Part", "Video"].includes(w));
    if (validWords.length > 0) {
      c1 = validWords[0];
      if (validWords.length > 1) c2 = validWords[1];
    }
  }

  const catSettings = SETTING_REGISTRY[effectiveCat] || SETTING_REGISTRY["Trending"];
  let setLatentSum = 0;
  for (let i = 16; i < Math.min(32, latentPred.length); i++) setLatentSum += Math.abs(latentPred[i]);
  const setIdx = Math.floor(setLatentSum * 1000 + Math.floor(seedVal / 7)) % catSettings.length;
  const setting = catSettings[setIdx];

  // 3. Synthesize Procedural Multi-part Script Calibrated to Duration
  const targetWordsPerPart = Math.floor(clampedDuration * 2.5);
  const sentencesNeeded = Math.max(5, Math.min(24, Math.round(targetWordsPerPart / 15)));

  const partsData: StoryPart[] = [];
  const baseTitle = prompt ? `${prompt.slice(0, 40)}: The Untold Story` : `${c1} and ${c2}: The Mystery of ${effectiveCat}`;

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = (pNum === clampedParts);
    const sents: string[] = [];

    // Opening Hook
    if (pNum === 1) {
      const hookOptions = [
        `It was meant to be an ordinary assignment when ${c1}, ${c1Role}, and ${c2}, ${c2Role}, arrived at ${setting}.`,
        `No one could have prepared ${c1} for what lay hidden inside ${setting}.`,
        `At precisely the moment the storm reached its peak, ${c1} and ${c2} made a discovery at ${setting} that defied every logical explanation.`,
        `When ${c1} first stepped inside ${setting}, the stillness in the air felt heavy and charged with anticipation.`,
      ];
      sents.push(rng.choice(hookOptions));
    } else {
      sents.push(`Welcome back to Part ${pNum}. The situation inside ${setting} had escalated beyond anything ${c1} and ${c2} could have anticipated.`);
    }

    // Inciting Incident
    const incitingOptions = [
      `${c1} pointed out an anomaly in the perimeter readings, prompting ${c2} to step forward cautiously.`,
      `A sudden fluctuation in the atmosphere caught ${c2}'s attention, causing ${c1} to immediately pause.`,
      `Without warning, an unexpected signal echoed across the space, breaking the long-standing silence.`,
      `Looking closely at the instruments, ${c1} realized that the readings were shifting in real time.`,
    ];
    sents.push(rng.choice(incitingOptions));

    // Dynamic Narrative Actions & Dialogue
    const dialogueBank = [
      `'${c2}, take a look at this right now,' ${c1} urged, gesturing toward the central console.`,
      `'${c1}, are you seeing what I'm seeing?' ${c2} whispered, checking the auxiliary monitors.`,
      `'We need to be extremely deliberate with our next step,' ${c1} warned, tightening their grip on the equipment.`,
      `'${c1}, this changes everything we thought we understood,' ${c2} remarked as the data confirmed their suspicions.`,
    ];

    const actionBank = [
      `Shadows lengthened across the walls as an electric hum resonated through the structural pillars.`,
      `The atmospheric pressure shifted noticeably, condensing their breath into visible vapor.`,
      `Every dial on the secondary interface began registering erratic, unprecedented values.`,
      `Together, they moved toward the inner threshold, navigating the narrow corridor with measured steps.`,
      `A low resonance vibrated through the floorboards, signaling that the mechanism had been activated.`,
      `The ambient light flickered momentarily, casting long, dramatic silhouettes across the interior.`,
      `Examining the artifact closely, ${c1} noted the intricate craftsmanship that had remained undisturbed for decades.`,
      `${c2} cross-referenced the coordinates with the original blueprints, finding an exact match.`,
      `A subtle click echoed through the chamber as the locking mechanism smoothly disengaged.`,
      `Outside, the elements raged against the reinforced glass, but inside, absolute concentration took over.`,
    ];

    const shuffledD = rng.shuffle(dialogueBank);
    const shuffledA = rng.shuffle(actionBank);

    let dIdx = 0;
    let aIdx = 0;
    while (sents.length < sentencesNeeded - 2) {
      if (sents.length % 2 === 0 && dIdx < shuffledD.length) {
        sents.push(shuffledD[dIdx++]);
      } else if (aIdx < shuffledA.length) {
        sents.push(shuffledA[aIdx++]);
      } else {
        sents.push(`${c1} and ${c2} pressed forward, determined to uncover the truth behind the mystery.`);
      }
    }

    // Climax / Cliffhanger
    if (!isLast) {
      const cliffhangers = [
        `Just as ${c1} reached for the master switch, a sudden sound from the shadows froze both of them in place... Follow right now for Part ${pNum + 1} to see what happened next!`,
        `Before ${c2} could answer, the primary monitor flashed with an urgent countdown... Follow for Part ${pNum + 1} as the revelation unfolds!`,
        `As the final barrier slid open, what they saw waiting inside changed everything... Follow right now for Part ${pNum + 1}!`,
      ];
      sents.push(rng.choice(cliffhangers));
    } else {
      const resolutions = [
        `Standing side by side, ${c1} and ${c2} looked upon what they had accomplished, knowing they had altered the course of tomorrow.`,
        `Against all odds, their perseverance had unlocked a truth that would resonate for generations to come.`,
        `As dawn broke over the horizon, peace and clarity finally settled over ${setting}.`,
      ];
      sents.push(rng.choice(resolutions));
      const ctas = [
        `Save this video right now and follow for more daily ${effectiveCat.toLowerCase()} stories!`,
        `What would you have done in ${c1}'s place? Drop your thoughts in the comments and follow for more!`,
        `Share this with someone who loves a great ${effectiveCat.toLowerCase()} story, and follow for daily adventures!`,
      ];
      sents.push(rng.choice(ctas));
    }

    const scriptText = sents.join(" ");

    // Partition sentences cleanly into numImages scenes
    const scenes: SceneItem[] = [];
    const nSents = sents.length;
    for (let sIdx = 0; sIdx < clampedImages; sIdx++) {
      const start = Math.floor((sIdx * nSents) / clampedImages);
      let end = Math.floor(((sIdx + 1) * nSents) / clampedImages);
      if (start === end) end = Math.min(nSents, start + 1);
      const chunk = sents.slice(start, end);
      const sceneText = chunk.length > 0 ? chunk.join(" ") : sents[Math.min(sIdx, nSents - 1)];

      const vPrompt = buildCleanVisualPrompt(
        sceneText,
        `${c1} and ${c2}, ${setting}`,
        sceneStyle
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
      sentences: sents,
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
    Trending: ["viral", "fyp", "storytime", "foryou", "trending", "explore"],
  };

  const hashtags = categoryTags[effectiveCat] || categoryTags["Trending"];
  const factId = `ml_${effectiveCat.toLowerCase()}_${seedVal}`;

  return {
    category: effectiveCat,
    factId,
    overallTitle: baseTitle,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
    hashtags,
    latent_score: latentNorm,
    source: "user_trained_onnx_ml_model",
  };
}
