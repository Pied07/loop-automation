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
  if (!weights || !weights.coefficient) {
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

export function buildCleanVisualPrompt(sceneText: string, fallbackSubject: string, styleDescriptor: string): string {
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

  const isHorror = /horror|haunted|ghost|demon|creepy|paranormal|nightmare|asylum|spectral|phantom/i.test(`${sceneText} ${fallbackSubject}`) && !/romance|love|heart|dating|comedy|food/i.test(`${fallbackSubject} ${styleDescriptor}`);
  const isRomance = /romance|love|heart|dating|relationship|soulmate|affection/i.test(`${fallbackSubject} ${styleDescriptor}`);
  const isRealism = /realism|photoreal|35mm/i.test(styleDescriptor);
  const isAnime = /anime|manga|ghibli/i.test(styleDescriptor);
  const isDisney = /disney|pixar|3d/i.test(styleDescriptor);

  let styleTag = "";
  if (isHorror) {
    styleTag = "cinematic horror film still, chilling atmospheric lighting, deep shadows, 35mm film photography, 8k";
  } else if (isRomance) {
    styleTag = "warm golden hour cinematic romance still, soft sunset bokeh, intimate natural lighting, 35mm film photography, 8k";
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

// ─── PHONOTACTIC ML CHARACTER NAME & ROLE GENERATOR (FROM SCRATCH) ─────────

const ONSET_CLUSTERS = [
  "B", "C", "D", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V", "Z",
  "Ch", "Sh", "Th", "Al", "El", "Mar", "Luc", "Dan", "Val", "Kael", "Finn", "Tor", "Zan",
  "Cor", "Frey", "Cyn", "Ast", "Joc", "Mor", "Ren", "Soren", "Dax", "Cass"
];
const NUCLEUS_VOWELS = ["a", "e", "i", "o", "u", "ia", "ea", "ai", "au", "ae"];
const CODA_CONSONANTS = ["b", "c", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "th", "st", "nd", "ld", "nt"];
const TERMINAL_MORPHS = ["a", "e", "ia", "en", "an", "on", "is", "us", "iel", "ian", "or", "ar", "er", "os", "lyn", "na", "ra", "la", "el"];

function generateMLCharacterName(latentVector: Float32Array, seed: number, charIdx: number = 0): string {
  const startIdx = (charIdx * 16) % latentVector.length;
  let latentWeight = 0;
  for (let i = 0; i < Math.min(16, latentVector.length - startIdx); i++) {
    latentWeight += Math.abs(latentVector[startIdx + i]) * (i + 1);
  }
  const rng = createPseudoRandom(seed + Math.floor(latentWeight * 1000) + charIdx * 7919);

  const c1 = rng.choice(ONSET_CLUSTERS);
  const v1 = rng.choice(NUCLEUS_VOWELS);
  const m = rng.choice(CODA_CONSONANTS);
  const end = rng.choice(TERMINAL_MORPHS);

  let name = `${c1}${v1}${m}${end}`;
  name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (name.length > 8) {
    name = name.slice(0, 7);
  }
  return name;
}

function generateMLCharacterRole(category: string, latentVector: Float32Array, seed: number, charIdx: number = 0): string {
  const rng = createPseudoRandom(seed + Math.floor(Math.abs(latentVector[charIdx % latentVector.length]) * 1000) + charIdx * 513);

  const domainFields: Record<string, string[]> = {
    Adventure: ["subterranean", "deep-cavern", "high-altitude", "glacial", "archaeological", "uncharted terrain", "expedition", "marine salvage"],
    Horror: ["acoustic", "night-shift", "forensic", "archaic archive", "historical document", "frequency", "field investigation", "nocturnal"],
    Action: ["tactical rescue", "perimeter defense", "extraction", "reconnaissance", "cybersecurity", "counter-surveillance", "incursion"],
    Romance: ["botanical", "vintage archive", "acoustic music", "art restoration", "literary", "landscape photography", "architectural"],
    Motivational: ["endurance performance", "athletic resilience", "propulsion engineering", "master craftsmanship", "mental conditioning"],
    Educational: ["quantum physics", "neurobiology", "deep-core geology", "astrophysics", "bioacoustic", "planetary science"],
    Comedy: ["specialty bakery", "express delivery", "stage illusion", "smart-home setup", "event coordination"],
    Food: ["artisan pasta", "midnight culinary", "fermentation science", "wood-fired hearth", "open-flame seasoning"],
    Music: ["analog tape mastering", "modular synthesizer", "acoustic chamber", "orchestral arrangement", "vinyl preservation"],
    Trending: ["digital forensics", "investigative livestream", "cyber whistleblower", "independent broadcast", "data verification"],
  };

  const titles = ["specialist", "researcher", "analyst", "surveyor", "director", "technician", "navigator", "innovator", "coordinator", "strategist"];

  const fields = domainFields[category] || domainFields["Trending"];
  const f = rng.choice(fields);
  const t = rng.choice(titles);
  const article = "aeiou".includes(f[0].toLowerCase()) ? "an" : "a";
  return `${article} ${f} ${t}`;
}

function generateMLSetting(category: string, prompt: string, latentVector: Float32Array, seed: number): string {
  if (prompt) {
    const lowP = prompt.toLowerCase();
    for (const marker of [" in ", " at ", " inside ", " on ", " near ", " beneath ", " through "]) {
      if (lowP.includes(marker)) {
        const customSet = prompt.slice(lowP.indexOf(marker) + marker.length).trim();
        if (customSet.length >= 4 && customSet.split(/\s+/).length <= 10) {
          return customSet;
        }
      }
    }
    if (prompt.split(/\s+/).length <= 7 && !["make", "generate", "create", "video", "story"].some((w) => lowP.includes(w))) {
      return prompt;
    }
  }

  const rng = createPseudoRandom(seed + Math.floor(Math.abs(latentVector[16] || 0) * 1000));

  const baseStructures: Record<string, string[]> = {
    Adventure: ["an uncharted subterranean cavern", "a lost granite sanctuary", "a volcanic fissure labyrinth", "a prehistoric sinkhole ecosystem", "a fog-shrouded glacial ravine"],
    Horror: ["an abandoned coastal relay tower", "the subterranean vaults beneath a 19th-century asylum", "an isolated broadcast post during a blackout", "a derelict vessel drifting in silent waters"],
    Action: ["a rain-slicked skyscraper helipad", "a fortified offshore server platform", "a high-speed transit tunnel under surveillance", "an encrypted black-site industrial facility"],
    Romance: ["a cobblestone courtyard bathed in amber lantern glow", "a quiet canalside bookshop in late autumn", "a windswept clifftop terrace overlooking the sea", "an overgrown conservatory under twilight"],
    Motivational: ["a solitary training center before dawn", "the rocky switchbacks of an unforgiving mountain", "an austere workshop lit long past midnight", "the grueling final mile of a championship course"],
    Educational: ["a high-altitude optical observatory", "a sterile cleanroom housing laser interferometers", "a deep-sea research vessel examining tectonic trenches", "a particle physics laboratory monitoring collisions"],
    Comedy: ["a bustling specialty bakery facing a deadline", "a wildly malfunctioning automated smart house", "an overbooked delivery hub in peak traffic", "a stage rehearsal spiraling into complete chaos"],
    Food: ["a midnight ramen shop in a quiet neon alley", "a centuries-old rustic flour mill in Tuscany", "a high-tempo Michelin kitchen during dinner rush", "a traditional smokehouse seasoning heirloom broths"],
    Music: ["a dimly lit Abbey Road mastering suite", "a subterranean jazz vault echoing with brass", "a high-ceilinged acoustic stone chamber", "a modular synth workspace surrounded by analog oscillators"],
    Trending: ["a high-tech investigative creator studio", "the control room of a viral live-stream event", "an encrypted data center analyzing leaked archives", "a breaking broadcast newsroom at midnight"],
  };

  const modifiers = [
    "wrapped in perpetual mist and echoing with distant resonance",
    "where atmospheric pressure drops noticeably with every step",
    "illuminated only by the hypnotic glow of auxiliary monitors",
    "untouched by weather or outside observers for decades",
    "pulsing with high-frequency static and unexplained readings",
    "standing frozen in time beneath heavy seasonal shadows",
  ];

  const structures = baseStructures[category] || baseStructures["Trending"];
  return `${rng.choice(structures)} ${rng.choice(modifiers)}`;
}

// ─── RICH CATEGORY-SPECIFIC NARRATIVE DATA ────────────────────────────────

const GENRE_NARRATIVE_DATA: Record<string, {
  openings: string[];
  incitings: string[];
  dialogues: string[];
  actions: string[];
  escalations: string[];
  cliffhangers: string[];
  resolutions: string[];
  ctas: string[];
}> = {
  Adventure: {
    openings: [
      "When {c1} first stepped inside {setting}, the stillness in the air felt heavy with centuries of silence.",
      "No modern map had ever recorded {setting}, yet {c1} and {c2} stood at the precipice of its hidden entrance.",
      "The expedition logs had strictly warned against approaching {setting}, but {c1} knew history favored the bold.",
      "Deep within {setting}, {c1} caught sight of weathered markers half-buried beneath forgotten stone.",
      "It was supposed to be a standard terrain survey when {c1} and {c2} arrived at {setting}.",
      "Before dawn broke over the horizon, {c1} and {c2} secured their safety lines at the threshold of {setting}.",
      "Every survival instinct told {c2} to turn back, but the entrance to {setting} pulled them inexorably inward.",
      "The wind howled across the ridges of {setting}, carrying the distant echo of an unrecorded cavern.",
    ],
    incitings: [
      "Without warning, an unexpected inscription emerged on the bedrock, glowing faintly under the lantern light.",
      "A sudden shift in the magnetic readings caused {c1}'s navigation instruments to deviate wildly.",
      "A loose flagstone gave way underfoot, revealing a subterranean passage descending into pure darkness.",
      "A resonant metallic hum vibrated through the living rock, breaking the long-standing silence.",
      "Examining the weathered cliffside, {c2} noticed a sequence of geometric carvings matching no known civilization.",
      "A sudden gust of warm subterranean air rushed up from the chasm, carrying the scent of ancient mineral salts.",
    ],
    dialogues: [
      "'{c2}, take a look at these carving patterns right now,' {c1} urged, sweeping the beam across the archway.",
      "'{c1}, are you hearing that rhythmic pulse below us?' {c2} whispered, crouching near the fissure.",
      "'{c1}, the geological strata here doesn't make any sense,' {c2} remarked as the density meter spiked.",
      "'We need to be extremely deliberate with our next step,' {c1} warned, testing the stability of the ledge.",
      "'If these markings are authentic,' {c2} murmured, 'this expedition just rewrote modern history.'",
      "'{c1}, look down into the trench—there is light reflecting off something artificial,' {c2} pointed out.",
      "'Hold your position,' {c1} signaled quietly, 'the ground ahead is hollowed out.'",
      "'{c2}, check the altimeter—we have descended far below the valley floor,' {c1} whispered.",
      "'Trust your instincts,' {c2} replied, 'we did not come this far to turn back now.'",
      "'{c1}, whatever created this pathway wanted it hidden from the outside world,' {c2} cautioned.",
    ],
    actions: [
      "Brushing centuries of moss from the lintel, {c1} uncovered a series of interlocking stone gears.",
      "Shadows lengthened across the cavern walls as their headlamps cut through the subterranean mist.",
      "{c2} carefully anchored the secondary rappel line into a fissure of solid granite.",
      "Navigating across the narrow natural bridge, both explorers kept their weight balanced against the damp rock.",
      "{c1} pried loose a calcified stone tablet, revealing pristine gold leaf inscriptions preserved underneath.",
      "The temperature dropped several degrees as they entered a vaulted chamber supported by monolithic basalt pillars.",
      "{c2} cross-referenced the coordinates with the expedition's aerial lidar scans, pinpointing their exact depth.",
      "Water dripped from towering stalactites in a slow, hypnotic cadence that measured their advance.",
      "Carefully bypassing a collapsed section of the walkway, {c1} extended a hand to guide {c2} across the gap.",
      "A subterranean stream cut across their path, its crystal-clear water rushing toward an unseen cataract.",
      "The beam of {c1}'s halogen lamp revealed towering stone statues carved directly into the living rock.",
      "Every breath formed pale wisps in the chill air as they approached the inner sanctuary threshold.",
      "{c2} wiped condensation from the lens of the field camera, documenting every inch of the prehistoric masonry.",
      "A counterweight groaned deep inside the subterranean wall, shifting tons of stone with ancient precision.",
      "The air tasted of ozone and dry limestone, untouched by weather or sunlight for millennia.",
      "Carefully tracing the groove in the stone floor, {c1} discovered a track designed for an ancient rolling barrier.",
      "{c2} examined the mineral crystallization on the ceiling, realizing this chamber had remained dry for five thousand years.",
      "Stepping over ancient aqueduct channels, {c1} noted how the acoustics amplified even the gentlest footstep.",
    ],
    escalations: [
      "A sudden tremor rattled the cavern roof, sending a cascade of loose pebbles tumbling into the abyss.",
      "The floor beneath their boots tilted subtly by a fraction of an inch, activating a series of dormant mechanisms.",
      "The radio link to base camp hissed with static before cutting out entirely into absolute silence.",
      "Looking back along the corridor, they realized the path they had just traversed had been sealed by a sliding slab.",
      "A sudden updraft extinguished their auxiliary flare, leaving only the focused cones of their headlamps.",
      "The rhythmic thrum beneath their feet grew stronger, vibrating in harmony with the stone walls.",
      "An intricate set of bronze counterweights began spinning overhead, rattling the ancient iron chains.",
      "A low hydraulic hiss echoed through the limestone channels as ancient water valves shifted into place.",
    ],
    cliffhangers: [
      "As the final stone barrier slid back into the rock face, what lay waiting in the illuminated chamber froze both of them in place... Follow for Part {p_num + 1} to witness the discovery!",
      "Just as {c1} reached to grasp the central cylinder, a low resonant chord echoed from the ceiling... Follow right now for Part {p_num + 1}!",
      "Before {c2} could decipher the final glyph, the entire floor began descending into a subterranean vault... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "Standing together at the edge of the great hall, {c1} and {c2} gazed upon the forgotten city, knowing they had uncovered history.",
      "Against all odds and through sheer determination, their expedition had solved a riddle that had baffled explorers for generations.",
      "As morning sunlight finally penetrated the cavern entrance, {c1} and {c2} carried the discovery back to the world above.",
    ],
    ctas: [
      "Would you have had the courage to step inside? Let us know in the comments and follow for more epic adventure stories!",
      "Share this with someone who loves wilderness exploration, and follow for daily untold expeditions!",
      "Drop a like if you would explore this lost sanctuary, and follow for the next real discovery!",
    ],
  },

  Horror: {
    openings: [
      "At precisely 3:17 AM, {c1} was cataloging analog archives in {setting} when the silence suddenly warped into a low frequency carrier tone.",
      "No one enters {setting} after dusk, but {c1} and {c2} needed answers that the daytime would never yield.",
      "When {c1} stepped inside {setting}, an icy chill settled over the room that had nothing to do with the winter draft.",
      "The warning posted outside {setting} had faded decades ago, but the claw marks along the doorframe were still razor-sharp.",
      "It was supposed to be an empty night shift for {c1} and {c2} inside {setting}.",
      "Through the fog surrounding {setting}, {c1} noticed a single flickering light in a wing that had been disconnected since 1974.",
    ],
    incitings: [
      "Through the layer of static hiss, a raspy voice began reading coordinates—coordinates pinpointing {c1}'s exact desk.",
      "Without warning, every monitor in the room violently clipped into monochrome white noise.",
      "The ambient temperature plummeted twenty degrees in seconds, condensing their breath into thick white plumes.",
      "Three slow, heavy knocks sounded from the inside of a double-paned window looking out into pure empty darkness.",
      "The auxiliary tape machine clicked on of its own accord, playing back a recording of their own voices from thirty seconds earlier.",
      "Looking toward the perimeter corridor, {c2} saw shadows stretching forward against the natural direction of the lamp.",
    ],
    dialogues: [
      "'{c2}, look at the audio input right now,' {c1} whispered, his throat completely dry.",
      "'Do not turn around, {c1},' {c2} breathed softly, 'whatever is standing behind the partition is waiting for us to react.'",
      "'{c1}, the microphone is picking up heavy breathing from inside this locked room,' {c2} stated in terror.",
      "'We need to reach the exterior fire exit before the hallway light goes out,' {c1} urged under his breath.",
      "'{c2}, did you hear that? Someone just whispered your full name right next to my ear,' {c1} said, backing against the wall.",
      "'Keep your eyes on the doorway,' {c2} warned, 'the shadow is moving even though the light source is stationary.'",
      "'{c1}, unplug the power feed right now—it is feeding on the electrical current!' {c2} yelled.",
      "'Look at the floorboards,' {c1} shuddered, 'there are wet footprints appearing one by one in the dust.'",
    ],
    actions: [
      "Every analog needle on the console pinned violently into the red as a metallic odor filled the air.",
      "The hanging incandescent bulb swung in erratic arcs, casting jagged silhouettes across the flaking walls.",
      "{c1} reached for the door handle, only to find the brass freezing to the touch and locked from the other side.",
      "A rhythmic tapping began behind the drywall, pacing their exact movements step for step.",
      "{c2} shone the flashlight down the spiral stairwell, illuminating empty steps where dust motes swirled unnaturally.",
      "The radio speakers crackled with the sound of someone frantically turning pages in a book that lay on their own table.",
      "Static electricity surged through the room, making every hair on their arms stand upright.",
      "A slow draft carried the pungent smell of ozone and damp earth through the sealed vents.",
      "{c1} wiped condensation from the glass booth, revealing the distorted silhouette of a figure standing motionless in the courtyard.",
      "The fluorescent tubes overhead flickered twice, died simultaneously, and plunged the space into pitch-black isolation.",
      "A sharp metallic screech echoed down the elevator shaft as severed cables swayed in the dark.",
      "Behind them, the brass key in the deadbolt began turning slowly, inch by inch, without any human hand touching it.",
    ],
    escalations: [
      "The sound of dragging footsteps accelerated down the hallway, stopping dead at the threshold.",
      "The emergency exit sign buzzed violently, then popped, showering the carpet in sparks.",
      "A handprint condensed onto the inside of the glass partition, right at eye level.",
      "The heavy iron doors at both ends of the corridor slammed shut with concussive force.",
      "A low, guttural vibration shook the glass cabinets, rattling specimen jars until the shelves fractured.",
      "The voice on the intercom switched to a clear, familiar whisper: 'We can hear your heart racing.'",
    ],
    cliffhangers: [
      "As {c1} reached to break the emergency glass, the doorknob turned slowly from the outside... Follow right now for Part {p_num + 1}!",
      "Before {c2} could scream, the shadow detached itself from the wall and stepped into the light... Follow for Part {p_num + 1}!",
      "As the flashlight battery flickered to zero, two glowing eyes opened in the ceiling rafters... Follow right now for Part {p_num + 1}!",
    ],
    resolutions: [
      "Bursting through the heavy exterior doors into the freezing dawn, {c1} and {c2} vowed never to speak of what they witnessed.",
      "As the morning sun pierced the heavy mist, the silence returned to {setting}, guarding its dark secret for another lifetime.",
      "Against all odds, they escaped with the audio proof that what happened inside was terrifyingly real.",
    ],
    ctas: [
      "Are you watching this in the dark? Save this video right now and follow for more true chilling horror!",
      "Would you have stayed or run? Drop your reaction in the comments and follow for daily true nightmares!",
      "Share this with someone who loves terrifying mysteries, and follow for more untold horror stories!",
    ],
  },

  Action: {
    openings: [
      "The countdown was at sixty seconds when {c1} and {c2} breached the perimeter of {setting}.",
      "Under the cover of a torrential downpour, {c1} secured a tactical line atop {setting}.",
      "Sirens wailed in the distance as {c1} and {c2} sprinted toward the rendezvous point inside {setting}.",
      "High above the neon glow of the city, {c1} monitored the tactical feeds leading into {setting}.",
    ],
    incitings: [
      "A sudden alert on the encrypted terminal confirmed that their extraction window had been compromised.",
      "Red laser designators swept across the steel beams, signaling an incoming tactical squad.",
      "The heavy steel blast doors began descending rapidly, cutting off their primary route.",
      "An EMP pulse detonated across the grid, instantly disabling all motorized transit in the sector.",
    ],
    dialogues: [
      "'{c2}, trigger the override sequence on my mark!' {c1} yelled over the roar of the engines.",
      "'{c1}, we have three bogeys closing in fast from the eastern corridor,' {c2} reported calmly.",
      "'Stick to the plan,' {c1} barked, 'we only get one shot at crossing this expanse.'",
      "'{c2}, cut the power relay right now—we need darkness to slip past the sensors,' {c1} ordered.",
      "'Hold on tight,' {c2} warned as the cable winch began spinning at maximum velocity.",
    ],
    actions: [
      "{c1} slid across the slick catwalk, firing a tether line into the reinforced structural girder.",
      "{c2} bypassed the digital security lock with seconds to spare, kicking the escape hatch open.",
      "Glass shattered outward as both operatives leaped through the observation window into the void.",
      "Tires screeched against wet asphalt as their extraction vehicle skidded into position.",
      "{c1} deployed an acoustic decoy, drawing perimeter sentries away from the central mainframe.",
      "The shockwave from the secondary breach rattled the concrete walls as they secured the hard drive.",
    ],
    escalations: [
      "A secondary alarm sounded, initiating a full sector lockdown with automated perimeter turrets.",
      "The support cables groaned under extreme tension, snapping one by one above the abyss.",
      "An armored transport vehicle crashed through the barrier, blocking their primary escape corridor.",
    ],
    cliffhangers: [
      "Just as {c1} leaped for the skid of the evacuation chopper, an explosive charge detonated beneath them... Follow for Part {p_num + 1}!",
      "Before {c2} could initiate the bypass, the blast door locked and armed sentries surrounded them... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "Accelerating into the dawn mist with the encrypted package secured, {c1} and {c2} completed the impossible mission.",
      "Standing on the rooftop as the sunrise broke, they looked down at the neutralized threat, mission accomplished.",
    ],
    ctas: [
      "Hit follow right now for more high-octane tactical thrillers and daily action stories!",
      "Drop a comment if you love thrilling spy missions, and share with an adrenaline junkie!",
    ],
  },

  Romance: {
    openings: [
      "It felt like destiny had orchestrated the rainy afternoon when {c1} bumped into {c2} inside {setting}.",
      "Under the warm amber streetlamps of {setting}, {c1} caught a glimpse of a smile they would never forget.",
      "In all the years {c1} had frequented {setting}, no one had ever noticed the subtle melody quite like {c2}.",
      "A sudden shower had driven both {c1} and {c2} under the protective awning of {setting}.",
    ],
    incitings: [
      "As their hands accidentally brushed against the same vintage manuscript, a spark of recognition passed between them.",
      "A soft melody began playing from an antique gramophone, freezing both of them in quiet reverie.",
      "{c2} looked up with eyes full of unspoken emotion, breaking down every defense {c1} had built.",
      "A forgotten letter slipped from between the pages, carrying a message that mirrored their exact feelings.",
    ],
    dialogues: [
      "'{c2}, I think I have been searching for this conversation my whole life,' {c1} said softly.",
      "'Do you ever feel like some people were meant to cross paths, {c1}?' {c2} asked, looking up.",
      "'I thought I knew what I wanted,' {c1} murmured, 'until I met you in {setting}.'",
      "'{c1}, stay for just one more coffee—let the rain keep pouring,' {c2} smiled gently.",
      "'Some moments are worth holding onto forever,' {c1} whispered, stepping closer.",
    ],
    actions: [
      "{c1} gently offered {c2} the warmth of their umbrella as autumn leaves swirled across the cobblestones.",
      "Together, they shared a quiet laugh that made all the noise of the bustling city fade into nothingness.",
      "{c2} traced the delicate rim of the porcelain teacup, listening intently to {c1}'s childhood dreams.",
      "The soft piano chords drifted through the candlelit room as their gazes locked across the table.",
      "Walking side by side through the mist, their shoulders brushed with an electric tenderness.",
    ],
    escalations: [
      "A sudden reminder of the morning train made both of them realize how precious their remaining hours were.",
      "Neither wanted the night to end, even as the cathedral bells chimed midnight across the city.",
      "An unspoken truth lingered between them, ready to change their futures forever.",
    ],
    cliffhangers: [
      "Just as {c1} took {c2}'s hand to confess everything, the station loudspeaker announced the final departure... Follow for Part {p_num + 1}!",
      "As {c2} leaned in with a tear forming in her eye, she whispered four words that changed everything... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "Under the starlit sky, {c1} and {c2} realized that distance was no match for a love written in the stars.",
      "Holding hands as the morning light bathed {setting}, they stepped forward into a shared future full of hope.",
    ],
    ctas: [
      "Do you believe in soulmates? Share this with someone who holds your heart and follow for more sweet love stories!",
      "Double tap if this made your heart melt, and follow for daily romantic tales!",
    ],
  },

  Motivational: {
    openings: [
      "While the rest of the world was fast asleep, {c1} was already putting in the work inside {setting}.",
      "Every champion was once a contender who refused to give up, and {c1} remembered that every time they stepped into {setting}.",
      "They told {c1} that the dream was impossible, but greatness is built in the dark corners of {setting}.",
      "There were no shortcuts on the journey that brought {c1} and {c2} to the grueling threshold of {setting}.",
    ],
    incitings: [
      "When fatigue threatened to break their spirit, {c1} locked eyes with the reflection in the mirror and found another gear.",
      "A sudden setback shattered months of preparation, forcing {c1} to make a definitive choice: quit or conquer.",
      "The voice of doubt whispered that it was time to stop, but {c2}'s unwavering encouragement reignited the fire.",
      "Looking up at the towering mountain peak, {c1} realized that the only opponent that mattered was inside their own head.",
    ],
    dialogues: [
      "'{c2}, pain is temporary, but regret lasts forever,' {c1} said through gritted teeth.",
      "'{c1}, you didn't sacrifice every weekend to quit at the ninety percent mark,' {c2} insisted.",
      "'Dig deeper,' {c1} told themselves, 'the version of you that wins is forged right here.'",
      "'{c1}, let everyone else sleep in—we are rewriting our destiny today,' {c2} shouted.",
      "'Never let someone who gave up on their dreams tell you how to live yours,' {c1} declared.",
    ],
    actions: [
      "With sweat stinging their eyes, {c1} gripped the barbell and drove through one more punishing repetition.",
      "{c2} timed the split seconds on the stopwatch, nodding with fierce approval as the pace accelerated.",
      "Every muscle screamed for rest, but discipline overpowered the instinct to surrender.",
      "Lacing up worn sneakers in the pre-dawn cold, {c1} embraced the solitude that precedes triumph.",
      "Dust and chalk filled the air as {c1} pushed through the physical barrier that stops the average person.",
    ],
    escalations: [
      "Cramps seized their legs with three miles remaining, turning every stride into a mental war.",
      "The crowd's doubts had echoed for months, but now only the sound of pounding footsteps remained.",
      "This was the exact moment where ninety-nine percent turn around—and where the one percent keep climbing.",
    ],
    cliffhangers: [
      "With the timer ticking down to the final three seconds, {c1} summoned every ounce of willpower for the final push... Follow for Part {p_num + 1}!",
      "As {c1} staggered to the edge of the final obstacle, they looked up at the impossible height... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "Crossing the finish line with arms raised to the heavens, {c1} proved that relentless dedication conquers every obstacle.",
      "Standing on the summit as the sun bathed the valley below, they knew the sacrifice had been worth every single second.",
    ],
    ctas: [
      "Save this video right now for whenever you feel like quitting, and follow for daily relentless motivation!",
      "Tag someone who needs to hear this today, and follow to build an unbreakable mindset!",
    ],
  },

  Educational: {
    openings: [
      "Few people realize what is truly taking place beneath the surface inside {setting}.",
      "When scientists first aimed their sensors at {setting}, the data shocked the entire global research community.",
      "Deep within {setting}, a natural phenomenon occurs that defies classical textbook physics.",
      "For over a century, researchers believed they understood {setting}—until modern instruments proved them wrong.",
    ],
    incitings: [
      "A sudden anomaly in the spectral analysis revealed atomic behavior never before documented in nature.",
      "The gravitational sensors registered a micro-oscillation that synchronized with deep cosmic events.",
      "Examining the core samples, {c1} identified mineral isotopes that originated outside our solar system.",
      "The data confirmed a shocking reality: the process was accelerating at an exponential rate.",
    ],
    dialogues: [
      "'{c2}, calibrate the spectrometer again—these values cannot be a measurement error,' {c1} urged.",
      "'{c1}, this completely challenges our understanding of thermodynamics,' {c2} explained excitedly.",
      "'Look at this molecular breakdown,' {c1} noted, 'it self-organizes without any external heat source.'",
      "'{c2}, if this hypothesis holds, we just uncovered a fundamental rule of planetary evolution,' {c1} stated.",
    ],
    actions: [
      "{c1} carefully adjusted the optical laser alignment, focusing the beam onto the microscopic crystal lattice.",
      "{c2} logged the real-time telemetry onto the scientific ledger, preserving the rare event.",
      "The sensor array illuminated the dark laboratory with glowing blue pulses of Cherenkov radiation.",
      "Isolating the vacuum chamber, they watched the particles suspended in electromagnetic equilibrium.",
      "{c1} cross-referenced the orbital telescope feeds with the terrestrial ground readings.",
    ],
    escalations: [
      "The reaction began producing more energy than it was consuming, triggering safety interlocks across the bay.",
      "A secondary wave of particles swept through the detectors, confirming the theoretical prediction.",
    ],
    cliffhangers: [
      "Just as the final equation resolved on the monitor, {c1} realized the terrifying implication for our planet... Follow for Part {p_num + 1}!",
      "Before {c2} could publish the findings, the primary satellite feed transmitted a bizarre signal... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "This historic breakthrough reshaped science forever, opening a new frontier of exploration for humanity.",
      "By questioning what was accepted as truth, {c1} and {c2} proved that the universe still holds countless wonders.",
    ],
    ctas: [
      "Did you know about this phenomenon? Share your thoughts in the comments and follow for daily mind-blowing facts!",
      "Share this with a science lover and follow for more fascinating discoveries!",
    ],
  },

  Comedy: {
    openings: [
      "It was meant to be a simple, foolproof task when {c1} and {c2} walked into {setting}.",
      "Rule number one of working inside {setting}: never, under any circumstances, let {c1} touch the main control lever.",
      "Everything was going completely fine in {setting}—until {c1} decided to 'improve efficiency'.",
      "Nobody expected the catastrophic chain of events that started with one dropped teaspoon inside {setting}.",
    ],
    incitings: [
      "A loud popping sound from the back room heralded the sudden eruption of two hundred gallons of batter.",
      "The smart-home automation system announced that it had upgraded itself and no longer recognized humans.",
      "{c1} accidentally leaned against the emergency fire sprinkler test lever with both hands full.",
      "A rogue mechanical vacuum cleaner gained sentience and began herding all the guests into the pantry.",
    ],
    dialogues: [
      "'{c2}, whatever you do, do not make sudden movements toward that cake,' {c1} warned in panic.",
      "'{c1}, why is the coffee machine speaking fluent French and demanding respect?' {c2} shouted over the siren.",
      "'I thought you said you knew how to turn it off!' {c1} screamed while sliding across the foam.",
      "'{c2}, on a scale of one to ten, how mad would you be if I told you the door handle came off?' {c1} whispered.",
    ],
    actions: [
      "{c1} attempted a heroic leap across the puddle, only to execute a majestic slow-motion belly flop.",
      "{c2} frantically used a serving tray as a riot shield against flying pastry dough.",
      "The automatic conveyor belt surged to turbo speed, launching croissants like artillery shells.",
      "Both of them stood frozen as the towering pyramid of delicate champagne glasses wobbled perilously.",
      "{c1} tried to play it cool as smoke puffed gracefully from the toaster into their hair.",
    ],
    escalations: [
      "Just when they thought the chaos had peaked, the automatic floor polisher joined the fray at maximum velocity.",
      "The VIP client walked in through the front door right as the powdered sugar explosion reached full blossom.",
    ],
    cliffhangers: [
      "As the smoke cleared, {c1} looked at {c2} covered in frosting right as the boss walked in... Follow for Part {p_num + 1}!",
      "Before {c2} could pull the emergency plug, the wedding cake began tilting directly toward the mayor... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "Somehow, the disastrous cake became a viral sensation, and orders flooded in faster than they could bake.",
      "Looking at the hilarious mess all around them, {c1} and {c2} couldn't help but collapse into uncontrollable laughter.",
    ],
    ctas: [
      "Tag a clumsy friend who would totally do this! Follow for more daily hilarious disasters!",
      "Drop a laughing emoji in the comments and follow for the funniest moments every day!",
    ],
  },

  Food: {
    openings: [
      "Before the city stirs, {c1} is already firing up the centuries-old hearth inside {setting}.",
      "There is an ancient culinary secret passed down for five generations inside the quiet kitchen of {setting}.",
      "True gastronomy is not just cooking; it is alchemy, and {c1} mastered it through decades of sacrifice in {setting}.",
      "The aroma of toasted spices and caramelized aromatics drifted into the morning air of {setting}.",
    ],
    incitings: [
      "A sudden sizzle from the seasoned cast-iron skillet signaled that the temperature had reached the golden threshold.",
      "Testing the ferment of the heirloom sourdough, {c1} noticed a rich floral aroma that occurs only once a decade.",
      "{c2} unveiled a basket of rare truffles harvested hours earlier from the misty oak forests.",
      "The reduction broth achieved that deep, glossy amber hue that defines culinary perfection.",
    ],
    dialogues: [
      "'{c2}, smell this reduction—thirty-six hours of gentle simmering just unlocked the umami,' {c1} smiled.",
      "'{c1}, the balance between acid and fat in this emulsion is unlike anything I have tasted,' {c2} marveled.",
      "'Never rush the flame,' {c1} advised, 'great food requires the patience of an artisan.'",
      "'{c2}, taste this right from the wooden spoon before we plate the course,' {c1} offered.",
    ],
    actions: [
      "{c1} rolled the silky pasta dough with practiced grace, stretching it paper-thin against the wooden flour board.",
      "A cloud of fragrant steam rose as fresh rosemary and garlic butter were spooned over the searing roast.",
      "{c2} delicately plated the micro-herbs using culinary tweezers, treating each leaf as a brushstroke.",
      "The crunch of the golden sourdough crust echoed through the quiet kitchen like music.",
      "Flames danced high above the wok as {c1} tossed the ingredients with lightning-fast wrist snaps.",
    ],
    escalations: [
      "With the dining room fully booked and food critics seated at table four, every plate had to be pure artistry.",
      "The timer chimed for the delicate souffle, demanding split-second precision from the entire kitchen brigade.",
    ],
    cliffhangers: [
      "As the world's most feared food critic took the first bite, the entire kitchen held its breath... Follow for Part {p_num + 1}!",
      "Just as {c1} presented the centerpiece dish, the head chef raised an eyebrow... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "The standing ovation from the dining room proved that cooking with love and tradition transcends all boundaries.",
      "Savoring a quiet bowl at midnight after a triumphant service, {c1} and {c2} celebrated the timeless joy of food.",
    ],
    ctas: [
      "Are you hungry yet? Save this video right now and follow for more mouthwatering culinary stories!",
      "Drop your favorite dish in the comments and follow for daily artisan food recipes!",
    ],
  },

  Music: {
    openings: [
      "Inside the soundproof sanctum of {setting}, {c1} sat waiting for the muse that only strikes in the dead of night.",
      "The vintage magnetic tape machines in {setting} had captured the greatest recordings of the twentieth century.",
      "Music is the language of the soul, and {c1} and {c2} were about to write their masterwork in {setting}.",
      "A lone acoustic guitar resonated through the vaulted ceiling of {setting}, carrying pure harmonic warmth.",
    ],
    incitings: [
      "A sudden chord modulation played on the grand piano unlocked the chorus melody they had sought for months.",
      "The analog tape echo caught a feedback loop that generated a hypnotic, otherworldly shimmer.",
      "{c2} layered a soaring cello motif over the driving rhythm track, sending shivers down their spines.",
      "The needle dropped onto the fresh acetate test pressing, filling the room with rich analog depth.",
    ],
    dialogues: [
      "'{c2}, listen to the air in that microphone track—it has an emotional honesty you cannot fake,' {c1} whispered.",
      "'{c1}, let the groove breathe—the silence between the notes is where the magic lives,' {c2} smiled.",
      "'Turn off the digital tuners,' {c1} urged, 'imperfection is what gives music its heartbeat.'",
      "'{c2}, that vocal take was perfection—do not touch a single fader,' {c1} stated with chills.",
    ],
    actions: [
      "{c1} gently manipulated the vintage tube preamplifiers, dialed in the warm saturation of classic tape.",
      "{c2} closed her eyes as her fingers danced across the ivory keys in a flurry of expressive arpeggios.",
      "The VU meters danced in smooth synchrony as the brass section laid down a blistering crescendo.",
      "A lone trumpet solo soared above the atmospheric synth pads, echoing like a voice in the dark.",
      "Slipping the studio monitor headphones on, they immersed themselves in the three-dimensional stereo landscape.",
    ],
    escalations: [
      "With thirty minutes remaining before the tape ran out, the entire ensemble locked into an undeniable pocket.",
      "The final chorus swelled to an overwhelming peak, rattling the studio glass in harmonic glory.",
    ],
    cliffhangers: [
      "As the final chord decayed into the room reverb, the producer bolted out of his chair... Follow for Part {p_num + 1}!",
      "Before the playback finished, a famous record executive walked through the studio door... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "That midnight recording session produced a track that would touch millions of hearts around the world.",
      "Listening to the master track in silence, {c1} and {c2} knew they had created something truly timeless.",
    ],
    ctas: [
      "Put your headphones on and feel the music! Save this video and follow for daily melodic masterpieces!",
      "What song gives you goosebumps every time? Let us know in the comments and follow for more!",
    ],
  },

  Trending: {
    openings: [
      "The digital trail was supposed to have been scrubbed clean, but {c1} found the archive inside {setting}.",
      "When the whistleblower reached out to {c1} and {c2}, they agreed to meet only inside the seclusion of {setting}.",
      "A story broke at midnight that the mainstream channels refused to touch, but {c1} pursued it inside {setting}.",
      "Inside the encrypted servers of {setting}, a massive data leak was unfolding in real time.",
    ],
    incitings: [
      "A hidden folder surfaced on the encrypted server, containing unredacted footage that verified their theories.",
      "The live-stream viewer count exploded past two million as breaking documents began leaking into the feed.",
      "A sudden satellite feed interception showed footage that had been suppressed for fifteen years.",
      "The digital forensics scanner flagged an anomalous digital signature originating from inside the building.",
    ],
    dialogues: [
      "'{c2}, verify this cryptographic hash immediately—if this is genuine, it exposes the entire network,' {c1} said.",
      "'{c1}, our stream is being packet-sniffed from three overseas locations,' {c2} reported urgently.",
      "'Back up the drives to cold storage right now,' {c1} insisted, 'before the server connection gets terminated.'",
      "'{c2}, the world deserves to see this evidence without filters,' {c1} declared.",
    ],
    actions: [
      "{c1} plugged the physical air-gapped drive into the workstation, transferring the encrypted evidence.",
      "{c2} adjusted the multi-cam livestream broadcast as comments flooded the chat at thousands per second.",
      "Monitors flickered across the command desk as the live data visualization mapped the global traffic.",
      "A red alert flashed on the firewall monitor, signaling an aggressive brute-force penetration attempt.",
      "{c1} spoke directly into the studio microphone, delivering the facts clearly and without compromise.",
    ],
    escalations: [
      "The main internet uplink severed abruptly, forcing them to switch to an emergency satellite transponder.",
      "A blackout cascaded through the neighborhood block, leaving only their battery-backed generator running.",
    ],
    cliffhangers: [
      "Just as {c1} hit the publish button to send the dossier worldwide, the studio power cut... Follow for Part {p_num + 1}!",
      "Before {c2} could reveal the identity of the source, a phone in the studio began ringing... Follow for Part {p_num + 1}!",
    ],
    resolutions: [
      "The revelation spread across every corner of the internet, sparking a global conversation and demanding justice.",
      "Against relentless pressure, the truth was brought to light, proving that dedicated creators can change the world.",
    ],
    ctas: [
      "What do you think really happened? Drop your opinion below before this gets taken down, and follow for updates!",
      "Share this video immediately to spread awareness, and follow for daily uncensored investigations!",
    ],
  },
};

function generateProceduralBeat(
  c1: string,
  c2: string,
  setting: string,
  category: string,
  rng: ReturnType<typeof createPseudoRandom>
): string {
  if (category === "Adventure") {
    const verbs = ["carefully navigated", "surveyed the perimeter of", "closely examined", "illuminated a concealed niche in", "cleared debris from"];
    const features = ["an ancient stone lintel", "a subterranean fault line", "a network of copper conduit tracks", "a calcified relief carving", "a forgotten drainage sluice", "a weathered surveyor's mark"];
    const effects = ["noting how the subterranean echoes carried faint vibrations", "realizing the craftsmanship matched no recorded civilization", "as the ambient humidity condensed on their equipment", "finding traces of an earlier expedition that vanished decades ago"];
    return `${c1} ${rng.choice(verbs)} ${rng.choice(features)} inside ${setting}, ${rng.choice(effects)}.`;
  } else if (category === "Horror") {
    const observations = ["noticed a sudden drop in room temperature", "heard the faint rhythm of deliberate breathing nearby", "watched the shadows lengthen against the natural lighting", "felt an icy draft sweep through the sealed doorway", "spotted faint claw indentations along the wooden baseboard"];
    const reactions = ["sending a visceral jolt of adrenaline down their spine", "freezing both of them in absolute, breathless silence", "making the hair on the back of their neck stand on end", "confirming their worst fears that they were not alone"];
    return `Passing deeper into ${setting}, ${c2} ${rng.choice(observations)}, ${rng.choice(reactions)}.`;
  } else if (category === "Action") {
    const moves = ["breached the secondary doorway", "sprinted across the exposed catwalk", "checked the weapon slide and tactical feed", "scanned the heat signatures through the smoke", "secured the perimeter anchor line"];
    const contexts = ["as emergency klaxons pulsed rhythmically in the ceiling", "while surveillance drones circled aggressively overhead", "matching their breathing to the rapid tempo of the countdown", "with tactical precision honed through years of covert field work"];
    return `With seconds slipping away, ${c1} ${rng.choice(moves)} inside ${setting}, ${rng.choice(contexts)}.`;
  } else if (category === "Romance") {
    const tenderActions = ["paused to admire the quiet glow of twilight", "shared an unspoken glance full of deep understanding", "listened to the gentle rhythm of the rain outside", "reminisced about the chance encounter that brought them together"];
    const atmospheres = ["feeling as though the rest of the world had melted away", "knowing in their hearts that this evening would change everything", "finding solace in the warm comfort of each other's presence", "cherishing every fragile second before the dawn arrived"];
    return `Standing together in ${setting}, ${c1} and ${c2} ${rng.choice(tenderActions)}, ${rng.choice(atmospheres)}.`;
  } else if (category === "Motivational") {
    const grits = ["pushed through the burning sensation in their lungs", "refocused their mental energy on the ultimate objective", "ignored the rising fatigue that tempted them to slow down", "remembered every single person who said they would never make it"];
    const triumphs = ["forging an unbreakable standard of excellence", "proving that consistency defeats raw talent every time", "refusing to accept anything less than total victory", "channeling the struggle into pure, unstoppable momentum"];
    return `Facing the grueling challenge of ${setting}, ${c1} ${rng.choice(grits)}, ${rng.choice(triumphs)}.`;
  } else if (category === "Educational") {
    const sciences = ["calibrated the optical sensors to eliminate atmospheric distortion", "cross-checked the real-time telemetry against historical baselines", "analyzed the frequency distribution of the unexpected signal", "isolated the thermal variance detected across the test zone"];
    const insights = ["revealing an intricate mathematical pattern woven into the phenomena", "providing definitive proof for a theory proposed decades earlier", "shedding new light on the fundamental mechanics of the cosmos", "demonstrating that nature often conceals its greatest secrets in plain sight"];
    return `Working methodically inside ${setting}, ${c1} and ${c2} ${rng.choice(sciences)}, ${rng.choice(insights)}.`;
  } else if (category === "Food") {
    const cooks = ["tasted the slow-simmered emulsion for the final balance of acidity", "adjusted the hearth embers to maintain a constant gentle heat", "scattered freshly crushed sea salt and toasted herbs over the dish", "observed the golden caramelization forming along the edges"];
    const flavors = ["releasing an intoxicating aroma that filled the entire space", "bringing centuries of culinary tradition into a single sublime bite", "achieving a harmony of textures that delighted every sense", "showcasing the uncompromising standard of genuine artisan craftsmanship"];
    return `At the heart of ${setting}, ${c1} ${rng.choice(cooks)}, ${rng.choice(flavors)}.`;
  } else if (category === "Music") {
    const melodies = ["tweaked the analog bias control on the master tape deck", "listened to the lush harmonic decay within the acoustic chamber", "blended the warm tube saturation into the rhythm track", "adjusted the vintage microphone positioning by a fraction of an inch"];
    const resonances = ["capturing a raw emotional resonance that digital plugins could never recreate", "letting the natural reverb of the room wrap around the melody", "creating a sonic atmosphere that pulled the listener straight into the song", "letting the instruments breathe together as one cohesive voice"];
    return `Late into the night inside ${setting}, ${c2} ${rng.choice(melodies)}, ${rng.choice(resonances)}.`;
  } else if (category === "Comedy") {
    const mishaps = ["tripped over a stray extension cord while trying to look dignified", "watched in horror as the automatic gadget began whistling aggressively", "attempted to fix the loose hinge, only to detach the entire counter", "pretended that the sudden loud explosion was completely intentional"];
    const punchlines = ["prompting an incredulous stare that spoke a thousand words", "causing nearby onlookers to erupt into uncontrollable giggles", "ensuring that neither of them would ever live down this catastrophe", "sealing their reputation as the most chaotic duo in town"];
    return `In the middle of ${setting}, ${c1} ${rng.choice(mishaps)}, ${rng.choice(punchlines)}.`;
  } else {
    const cyber = ["monitored the real-time geographic distribution of the incoming traffic", "verified the digital cryptographic certificate across multiple nodes", "isolated the broadcast feed to protect the whistleblower's identity", "compiled the timestamped video evidence into an unalterable package"];
    const impacts = ["watching the viral wave sweep across social media networks", "knowing that once this information was public, there was no going back", "holding the undeniable receipts that the public had demanded for years", "demonstrating the unprecedented power of decentralized digital journalism"];
    return `Working under intense pressure inside ${setting}, ${c1} ${rng.choice(cyber)}, ${rng.choice(impacts)}.`;
  }
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
  const customTag = (params.customTag || "").trim();
  const duration = params.duration || 60;
  const numImages = params.numImages || 5;
  const numParts = params.numParts || 1;
  const sceneStyle = params.sceneStyle || "Realism";
  const seedVal = params.seed || (Math.floor(Math.random() * 1000000) + 1);

  const rng = createPseudoRandom(seedVal);
  const clampedDuration = Math.max(30, Math.min(300, duration));
  const clampedImages = Math.max(1, Math.min(20, numImages));
  const clampedParts = Math.max(1, Math.min(5, numParts));

  // Run neural model forward inference on TF-IDF representation
  const semanticInput = `${effectiveCat} ${customTag} ${prompt}`.trim();
  const vocab = (configData as any)?.vocabulary || {};
  const idf = (configData as any)?.idf || [];
  const tfidfVec = vectorizeText(semanticInput, vocab, idf, 512);
  const latentVector = neuralMLPForward(tfidfVec, weightsData as any);

  let latentSum = 0;
  for (let i = 0; i < latentVector.length; i++) {
    latentSum += latentVector[i];
  }
  const latentScore = latentVector.length > 0 ? latentSum / latentVector.length : 0.05;

  // 1. Generate Setting from Scratch
  const setting = generateMLSetting(effectiveCat, prompt, latentVector, seedVal);

  // 2. Generate Character Names & Roles from Scratch using ML Phonotactics
  let extractedNames: string[] = [];
  if (prompt) {
    const rawMatches = prompt.match(/\b[A-Z][a-z]+\b/g) || [];
    extractedNames = rawMatches.filter((w) => !["The", "A", "An", "Part", "Video", "When", "And", "Into", "For", "From", "With", "About", "This", "That", "Untold", "Story", "Mystery", "Secret", "Triangle", "Bermuda", "Atlantic", "Pacific", "Mountain", "Andes", "Ocean", "Valley"].includes(w) && !setting.toLowerCase().includes(w.toLowerCase()));
  }

  let c1 = "";
  let c2 = "";
  if (extractedNames.length >= 2) {
    c1 = extractedNames[0];
    c2 = extractedNames[1];
  } else if (extractedNames.length === 1) {
    c1 = extractedNames[0];
    c2 = generateMLCharacterName(latentVector, seedVal, 1);
  } else {
    // Generate names mathematically from scratch
    c1 = generateMLCharacterName(latentVector, seedVal, 0);
    c2 = generateMLCharacterName(latentVector, seedVal, 1);
    if (c1.toLowerCase() === c2.toLowerCase()) {
      c2 = generateMLCharacterName(latentVector, seedVal + 33, 2);
    }
  }

  // 3. Synthesize Procedural Multi-part Script Calibrated to Duration
  const targetWordsPerPart = Math.floor(clampedDuration * 2.4);
  const sentencesNeeded = Math.max(6, Math.min(28, Math.round(targetWordsPerPart / 14)));

  const genreData = GENRE_NARRATIVE_DATA[effectiveCat] || GENRE_NARRATIVE_DATA["Trending"];
  const partsData: StoryPart[] = [];
  let baseTitle = "";
  if (prompt) {
    baseTitle = prompt.slice(0, 45);
  } else if (effectiveCat === "Romance") {
    baseTitle = `${c1} and ${c2}'s Love Story`;
  } else if (effectiveCat === "Comedy") {
    baseTitle = `${c1} and ${c2}'s Misadventure`;
  } else if (effectiveCat === "Motivational") {
    baseTitle = `${c1} and ${c2}: The Unstoppable Journey`;
  } else if (effectiveCat === "Action") {
    baseTitle = `${c1} and ${c2}: High-Stakes Mission`;
  } else if (effectiveCat === "Educational") {
    baseTitle = `${c1} and ${c2}: The Untold Discovery`;
  } else if (effectiveCat === "Food") {
    baseTitle = `${c1} and ${c2}: The Culinary Quest`;
  } else if (effectiveCat === "Music") {
    baseTitle = `${c1} and ${c2}: The Lost Harmony`;
  } else {
    baseTitle = `${c1} and ${c2}: The Mystery of ${effectiveCat}`;
  }

  const globalUsedSignatures = new Set<string>();

  for (let pIdx = 0; pIdx < clampedParts; pIdx++) {
    const pNum = pIdx + 1;
    const isLast = (pNum === clampedParts);
    const sents: string[] = [];

    function addSentence(rawText: string): boolean {
      const formatted = rawText
        .replace(/\{c1\}/g, c1)
        .replace(/\{c2\}/g, c2)
        .replace(/\{setting\}/g, setting)
        .replace(/\{p_num \+ 1\}/g, String(pNum + 1))
        .replace(/\{p_num\}/g, String(pNum));
      const clean = formatted.replace(/\s+/g, " ").trim();
      if (!clean) return false;
      const sig = clean.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
      if (globalUsedSignatures.has(sig)) return false;
      globalUsedSignatures.add(sig);
      sents.push(clean);
      return true;
    }

    // Phase 1: Opening Hook
    if (pNum === 1) {
      const shuffledOpenings = rng.shuffle(genreData.openings);
      for (const op of shuffledOpenings) {
        if (addSentence(op)) break;
      }
    } else {
      const continuationHooks: Record<string, string> = {
        Romance: `Welcome back to Part ${pNum}. Returning to ${setting}, the unspoken connection between ${c1} and ${c2} had only deepened with every passing moment.`,
        Horror: `Welcome back to Part ${pNum}. Inside ${setting}, the shadows had lengthened, and the silence now held an unmistakable, chilling presence.`,
        Comedy: `Welcome back to Part ${pNum}. Just when ${c1} thought things couldn't get more out of hand inside ${setting}, the chaos doubled.`,
        Motivational: `Welcome back to Part ${pNum}. Back at ${setting}, the challenge was steeper than ever, but neither ${c1} nor ${c2} was willing to surrender.`,
        Action: `Welcome back to Part ${pNum}. The situation inside ${setting} had escalated into an all-out tactical race against time for ${c1} and ${c2}.`,
        Educational: `Welcome back to Part ${pNum}. Delving further into ${setting}, ${c1} and ${c2} uncovered data pointing toward an even more astonishing breakthrough.`,
        Food: `Welcome back to Part ${pNum}. Back inside the kitchen of ${setting}, ${c1} and ${c2} prepared to face the ultimate culinary trial.`,
        Music: `Welcome back to Part ${pNum}. Inside the studio at ${setting}, the melody ${c1} and {c2} were crafting was taking on a life of its own.`,
      };
      const hookLine = continuationHooks[effectiveCat] || `Welcome back to Part ${pNum}. Returning to ${setting}, ${c1} and ${c2} were ready to face whatever lay ahead.`;
      addSentence(hookLine);
    }

    // Phase 2: Inciting Incident / Catalyst
    const shuffledIncitings = rng.shuffle(genreData.incitings);
    for (const inc of shuffledIncitings) {
      if (addSentence(inc)) break;
    }

    // Phase 3 & 4: Deep Multi-Beat Narrative Arc
    const shuffledDialogue = rng.shuffle(genreData.dialogues);
    const shuffledActions = rng.shuffle(genreData.actions);
    const shuffledEscalations = rng.shuffle(genreData.escalations);

    let dIdx = 0;
    let aIdx = 0;
    let eIdx = 0;
    const targetBodySentences = sentencesNeeded - (isLast ? 2 : 1);
    let stepCounter = 0;

    while (sents.length < targetBodySentences) {
      stepCounter++;
      let added = false;
      const cyclePhase = sents.length % 4;

      if (cyclePhase === 0 && aIdx < shuffledActions.length) {
        added = addSentence(shuffledActions[aIdx++]);
      } else if (cyclePhase === 1 && dIdx < shuffledDialogue.length) {
        added = addSentence(shuffledDialogue[dIdx++]);
      } else if (cyclePhase === 2 && aIdx < shuffledActions.length) {
        added = addSentence(shuffledActions[aIdx++]);
      } else if (cyclePhase === 3 && eIdx < shuffledEscalations.length) {
        added = addSentence(shuffledEscalations[eIdx++]);
      }

      if (!added) {
        const banks = [
          { b: shuffledActions, get: () => aIdx, inc: () => aIdx++ },
          { b: shuffledDialogue, get: () => dIdx, inc: () => dIdx++ },
          { b: shuffledEscalations, get: () => eIdx, inc: () => eIdx++ },
        ];
        for (const item of banks) {
          while (item.get() < item.b.length) {
            const line = item.b[item.get()];
            item.inc();
            if (addSentence(line)) {
              added = true;
              break;
            }
          }
          if (added) break;
        }
      }

      if (!added) {
        const proceduralBeat = generateProceduralBeat(c1, c2, setting, effectiveCat, rng);
        addSentence(proceduralBeat);
      }

      if (stepCounter > 80) break;
    }

    // Phase 5: Climax / Cliffhanger / Resolution
    if (!isLast) {
      const shuffledCliffhangers = rng.shuffle(genreData.cliffhangers);
      for (const cl of shuffledCliffhangers) {
        if (addSentence(cl)) break;
      }
    } else {
      const shuffledResolutions = rng.shuffle(genreData.resolutions);
      for (const res of shuffledResolutions) {
        if (addSentence(res)) break;
      }
      const shuffledCtas = rng.shuffle(genreData.ctas);
      for (const cta of shuffledCtas) {
        if (addSentence(cta)) break;
      }
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

    partsData.push({
      partNumber: pNum,
      title: clampedParts > 1 ? `${baseTitle} (Part ${pNum}/${clampedParts})` : baseTitle,
      script: scriptText,
      sentences: sents,
      scenes,
      isLastPart: isLast,
    });
  }

  const catLower = effectiveCat.toLowerCase().replace(/\s+/g, "");
  const hashtags = [catLower, "storytime", "viral", "fyp", "trending", "explore"];

  return {
    category: effectiveCat,
    factId: `ml_${catLower}_${seedVal % 99999}`,
    overallTitle: partsData[0]?.title || `${effectiveCat} Chronicles`,
    numParts: clampedParts,
    durationPerPart: clampedDuration,
    parts: partsData,
    hashtags,
    latent_score: latentScore,
    source: "user_trained_onnx_ml_model",
  };
}
