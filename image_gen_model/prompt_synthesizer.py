"""
=============================================================================
  STORY SCENE PROMPT SYNTHESIZER
  Translates conversational story script narration into rich, cinematic
  visual prompts that image generation models can accurately render.
=============================================================================
"""

import re
from typing import Dict, List, Optional, Tuple

# Conversational fillers, video hooks, and narration noise to strip
FILLER_PATTERNS = [
    r"\bwelcome\s+(?:back\s+)?to\s+(?:part\s+\d+|our\s+video|the\s+channel)\b[!,.]?",
    r"\bpart\s+\d+[:\s-]*\b",
    r"\b(?:today\s+)?we\s+will\s+(?:explore|uncover|look\s+at|discover|talk\s+about)\b",
    r"\bin\s+this\s+(?:video|part|episode|short|reel)\b",
    r"\bdid\s+you\s+know(?:\s+that)?\b",
    r"\bhave\s+you\s+ever\s+wondered\b",
    r"\bwatch\s+(?:until|till)\s+the\s+end\b",
    r"\blike\s+and\s+subscribe\b",
    r"\bcomment\s+down\s+below\b",
    r"\bthe\s+truth\s+will\s+shock\s+you\b",
    r"\bnumber\s+\d+[:\s]*\b",
    r"\blet'?s\s+dive\s+in\b",
    r"\bstay\s+tuned\b",
]

GENRE_VISUAL_STYLES: Dict[str, Dict[str, str]] = {
    "Action": {
        "lighting": "explosive dynamic rim lighting, flying orange sparks, intense cinematic contrast, atmospheric battle haze",
        "camera": "wide-angle dynamic action shot, sweeping cinematic perspective, high-speed tracking camera",
        "keywords": ["action", "battle", "fight", "chase", "combat", "explosion", "warzone", "infiltrate", "rooftop"],
        "suffix": "Hollywood blockbuster action cinematography, high-octane scene, dynamic motion, debris and sparks, 8k octane render",
    },
    "Horror": {
        "lighting": "chilling moonlight piercing cold shadows, volumetric supernatural mist, dim flickering amber candlelight casting long terrifying silhouettes",
        "camera": "creepy Dutch angle, wide eerie atmospheric perspective, 35mm horror movie film still",
        "keywords": ["abandoned", "mist", "shadows", "darkness", "ghost", "spectral", "creepy", "haunted", "apparition", "phantom", "demon", "asylum", "horror"],
        "suffix": "spine-chilling horror masterpiece, terrifying paranormal presence, pale ghostly apparition with haunting hollow dark eyes, James Wan and Guillermo del Toro cinematography, 8k atmospheric dread, terrifyingly creepy scene",
    },
    "Mystery": {
        "lighting": "moody chiaroscuro lighting, heavy atmospheric fog, warm streetlamp glow reflecting on wet cobblestones",
        "camera": "cinematic film still, 35mm lens, shallow depth of field",
        "keywords": ["fog", "detective", "shadow", "rain", "clue", "silhouette", "alley"],
        "suffix": "cinematic neo-noir aesthetic, 8k UHD, ultra-detailed",
    },
    "Sci-Fi": {
        "lighting": "vibrant neon glow, cyan and magenta reflections, atmospheric haze, holographic illumination",
        "camera": "wide cinematic establishing shot, anamorphic lens flare",
        "keywords": ["cyberpunk", "hologram", "futuristic", "skyscraper", "neon", "robot", "spaceship"],
        "suffix": "Blade Runner aesthetic, Unreal Engine 5 render, sharp focus, 8k",
    },
    "Fantasy": {
        "lighting": "ethereal golden god rays, glowing magical particles, luminous enchanted dusk",
        "camera": "sweeping grand cinematic scale, concept art masterpiece",
        "keywords": ["ancient", "castle", "magic", "dragon", "enchanted", "forest", "fortress"],
        "suffix": "ArtStation trending, Lord of the Rings aesthetic, photorealistic, 8k",
    },
    "Historical": {
        "lighting": "dramatic late afternoon sunlight, dusty golden rays, authentic period atmospheric haze",
        "camera": "historical epic movie still, Panavision 70mm cinematography",
        "keywords": ["ancient", "temple", "warrior", "emperor", "monument", "stone", "ruins"],
        "suffix": "award-winning historical cinematography, highly detailed textures, 8k",
    },
    "Educational": {
        "lighting": "crystal clear studio lighting, brilliant celestial glow, vivid high contrast",
        "camera": "macro documentary photography, National Geographic style",
        "keywords": ["cosmos", "galaxy", "laboratory", "specimen", "microscope", "earth", "nature"],
        "suffix": "National Geographic documentary photography, ultra-sharp detail, 8k UHD",
    },
    "Motivational": {
        "lighting": "triumphant golden hour sunrise, radiant sunlight breaking through mountain mist",
        "camera": "heroic low-angle perspective, wide panoramic vista",
        "keywords": ["summit", "peak", "athlete", "horizon", "sunrise", "champion", "mountain"],
        "suffix": "inspirational cinematic film still, breathtaking scenery, 8k",
    },
    "Comedy": {
        "lighting": "bright cheerful daylight, warm vibrant color palette, clear expressive illumination",
        "camera": "medium expressive character shot, Pixar style or crisp portrait",
        "keywords": ["expressive", "playful", "colorful", "surprised", "funny", "smiling"],
        "suffix": "vibrant colors, clean sharp lighting, delightful expression",
    },
}


def clean_narration(text: str) -> str:
    """Removes conversational filler, greetings, quantity multipliers, medical/injury triggers, and call-to-actions."""
    clean = text.strip()
    for pat in FILLER_PATTERNS:
        clean = re.sub(pat, "", clean, flags=re.IGNORECASE)
    # Remove quantity multipliers like 'eighteen times', '300 doors', '5000 times' that confuse diffusion models into duplicating eyes/limbs
    clean = re.sub(r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b", "", clean, flags=re.IGNORECASE)
    # Aggressively filter physical trauma, injury, hospital, and medical deformity keywords that trigger mutilated/distorted face renders
    clean = re.sub(
        r"\b(?:spinal mobility|highway crash|car crash|crash|paralysis|paralyzed|wheelchair|crutches|rehabilitation|hospital|amputation|injured|injury|deformity|deformed|broken|surgery|disease|sick|illness|twisted|severed|bleeding|wound)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    # Remove markdown symbols and extra punctuation
    clean = re.sub(r'["\'*_#`~]', "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def infer_genre(category: str, topic: str, text: str) -> str:
    """Identifies the dominant storytelling genre from context."""
    combined = f"{category} {topic} {text}".lower()
    if any(w in combined for w in ["action", "combat", "fight", "battle", "chase", "warzone", "tactical", "stunt", "explosion", "gun", "operative", "infiltrat"]):
        return "Action"
    if any(w in combined for w in ["horror", "scary", "ghost", "creepy", "haunted", "blood", "monster", "demon", "abandoned"]):
        return "Horror"
    if any(w in combined for w in ["detective", "mystery", "crime", "secret", "clue", "murder", "unsolved"]):
        return "Mystery"
    if any(w in combined for w in ["scifi", "tech", "cyber", "ai", "future", "robot", "space", "alien", "neon"]):
        return "Sci-Fi"
    if any(w in combined for w in ["fantasy", "magic", "dragon", "wizard", "spell", "myth", "kingdom", "sword"]):
        return "Fantasy"
    if any(w in combined for w in ["history", "ancient", "war", "century", "empire", "king", "pharaoh", "gladiator"]):
        return "Historical"
    if any(w in combined for w in ["motivat", "success", "inspire", "athlete", "champion", "discipline", "hard work"]):
        return "Motivational"
    if any(w in combined for w in ["funny", "comedy", "hilarious", "laugh", "prank", "humor"]):
        return "Comedy"
    return "Educational"


CHARACTER_STYLE_PRESETS: Dict[str, Dict[str, str]] = {
    "Retro Comic": {
        "style_prefix": "vintage retro comic book art panel, classic graphic novel illustration, bold black ink contour lines, pop-art halftone dots",
        "character": "illustrated superhero in dynamic comic action stance",
        "lighting": "dramatic comic noir lighting, stylized shadows, halftone print texture",
        "suffix": "detailed cross-hatching, classic comic book aesthetic, 8k comic artwork",
        "horror_style": "vintage retro horror comic book panel, Tales from the Crypt comic style, bold black ink contour lines, halftone print texture, creepy spectral entity with hollow dark eyes, eerie comic noir shadows",
    },
    "Anime": {
        "style_prefix": "Japanese anime movie still, beautiful 2D anime illustration, clean line art, Makoto Shinkai aesthetic",
        "character": "expressive anime protagonist in dynamic stance, symmetrical anime face",
        "lighting": "vibrant anime lighting, atmospheric god rays, glowing embers",
        "suffix": "crisp line art, beautiful high quality Japanese animation scenery, unified anime still",
        "horror_style": "dark psychological horror anime movie still, creepy hand-drawn anime aesthetic, pale spectral apparition with hollow haunting eyes, eerie shadowy entity",
    },
    "Disney 3D": {
        "style_prefix": "Pixar Disney 3D animation style, beautifully sculpted 3D animated character, smooth CGI render",
        "character": "expressive 3D animated character with symmetrical charming features",
        "lighting": "warm cinematic studio 3D lighting, subsurface scattering, soft volumetric rim light",
        "suffix": "Pixar 3D animation movie still, Unreal Engine 5 Octane render 8k, polished animated scene",
        "horror_style": "spooky dark 3D animation, stylized haunted scene, creepy glowing apparitions, moody volumetric shadows, Tim Burton Pixar aesthetic",
    },
    "Mecha": {
        "style_prefix": "cyberpunk mecha concept art, sleek futuristic exoskeleton armor, glowing cyber helmet",
        "character": "cyber operative in tactical mecha armor, symmetrical anatomy",
        "lighting": "neon reflections in the rain, atmospheric cyan and magenta haze, dramatic sci-fi lighting",
        "suffix": "cinematic sci-fi mecha concept art, intricate mechanical armor, sharp focus, 8k wide scene",
        "horror_style": "biomechanical horror mecha concept art, corrupted cybernetic entity with glowing malevolent visor, ominous dark industrial mist",
    },
    "Dark Fantasy": {
        "style_prefix": "dark fantasy cinematic digital concept art, Elden Ring and Witcher aesthetic, gothic painterly illustration",
        "character": "medieval knight in ornate dark plate armor, cohesive concept art character",
        "lighting": "volumetric dark mist, glowing magical runes, dramatic torchlight and moonlit deep shadows",
        "suffix": "dark fantasy concept art, ArtStation trending, seamless painterly rendering",
        "horror_style": "grim dark fantasy horror art, terrifying necromantic specter, cursed undead knight with glowing malevolent eyes, gothic graveyard mist",
    },
    "Realism": {
        "style_prefix": "cinematic 35mm film still, photorealistic wide establishing shot",
        "character": "authentic human with symmetrical facial features and natural posture",
        "lighting": "dramatic natural rim lighting, volumetric atmospheric depth",
        "suffix": "photorealistic 8k UHD, award-winning cinematic storytelling, natural skin texture, masterpiece",
        "horror_style": "cinematic horror film still, terrifyingly creepy atmosphere, pale spectral apparition with hollow haunting dark eyes, creepy ghostly face, eerie shadowy entity, deeply unnerving paranormal dread, 35mm film grain, 8k",
    },
}


def synthesize_scene_prompt(
    script_sentence: str,
    topic: str = "",
    category: str = "Interesting Facts",
    aspect_ratio: str = "9:16",
    style_preset: Optional[str] = "Realism",
) -> str:
    """
    Transforms any story script sentence into a rich, style-accurate,
    scene-specific prompt that image generators will faithfully render.
    CRITICAL: Keeps total tokens under 70 so CLIP never truncates visual style.
    Style keywords appear at the VERY START of the prompt for maximum diffusion weight.
    """
    clean = clean_narration(script_sentence)
    genre = infer_genre(category, topic, script_sentence)
    genre_style = GENRE_VISUAL_STYLES.get(genre, GENRE_VISUAL_STYLES["Action"] if genre == "Action" else GENRE_VISUAL_STYLES["Horror"])

    # Fallback to topic if script sentence was mostly filler
    visual_core = clean if len(clean) > 8 else clean_narration(topic)
    if not visual_core or len(visual_core) < 4:
        visual_core = f"{category} scene, {topic}"

    # Truncate visual_core if excessively long to preserve CLIP token budget
    words = visual_core.split()
    if len(words) > 18:
        visual_core = " ".join(words[:18])

    # 1. Match style preset if specified (e.g. Retro Comic, Anime, Disney 3D, Realism, Mecha, Dark Fantasy)
    matched_preset = None
    if style_preset:
        for k, v in CHARACTER_STYLE_PRESETS.items():
            if k.lower() in style_preset.lower() or style_preset.lower() in k.lower():
                matched_preset = v
                break

    # Default to Realism if no preset matched
    if matched_preset is None:
        matched_preset = CHARACTER_STYLE_PRESETS["Realism"]

    # 2. Check if this is a horror narrative
    is_horror = (
        genre == "Horror"
        or "horror" in category.lower()
        or any(w in f"{script_sentence} {topic}".lower() for w in ["ghost", "specter", "haunt", "demon", "creepy", "phantom", "apparition", "asylum", "curse", "shadowy figure", "entity"])
    )

    framing_tag = "vertical 9:16 composition" if "9:16" in aspect_ratio else "widescreen 16:9 composition"

    # Assemble compact, high-impact prompt where STYLE ALWAYS COMES FIRST
    if is_horror:
        style_lead = matched_preset.get("horror_style", matched_preset["style_prefix"])
        prompt_parts = [
            style_lead,
            f"scene of {visual_core}",
            framing_tag,
            matched_preset["lighting"],
        ]
    else:
        prompt_parts = [
            matched_preset["style_prefix"],
            f"scene depicting {visual_core}",
            matched_preset["character"],
            framing_tag,
            matched_preset["lighting"],
            matched_preset["suffix"],
        ]

    # Clean and assemble - keep under 65 words (~70 tokens)
    full_prompt = ", ".join(p for p in prompt_parts if p)
    tokens_approx = full_prompt.split()
    if len(tokens_approx) > 55:
        full_prompt = " ".join(tokens_approx[:55])

    return full_prompt

