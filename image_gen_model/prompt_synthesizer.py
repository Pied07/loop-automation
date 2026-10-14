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
    "Horror": {
        "lighting": "dim flickering amber candlelight, volumetric ominous mist, cold moonlight filtering through cracks, dramatic deep shadows",
        "camera": "creepy Dutch angle, wide atmospheric shot, 35mm horror film still",
        "keywords": ["abandoned", "mist", "shadows", "darkness", "decay", "silence", "lantern", "haunted"],
        "suffix": "masterpiece, suspense thriller cinematography, hyper-detailed, photorealistic, 8k",
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
    """Removes conversational filler, greetings, quantity multipliers, and call-to-actions."""
    clean = text.strip()
    for pat in FILLER_PATTERNS:
        clean = re.sub(pat, "", clean, flags=re.IGNORECASE)
    # Remove quantity multipliers like 'eighteen times', '300 doors', '5000 times' that confuse diffusion models into duplicating eyes/limbs
    clean = re.sub(r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b", "", clean, flags=re.IGNORECASE)
    # Remove markdown symbols and extra punctuation
    clean = re.sub(r'["\'*_#`~]', "", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def infer_genre(category: str, topic: str, text: str) -> str:
    """Identifies the dominant storytelling genre from context."""
    combined = f"{category} {topic} {text}".lower()
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
    "Realism": {
        "char_prompt": "highly detailed realistic person with symmetrical facial features, authentic human skin texture, natural detailed eyes, sharp focused gaze, anatomically correct human face",
        "lighting": "cinematic film still, 35mm photograph, dramatic natural rim lighting, shallow depth of field",
        "suffix": "photorealistic 8k UHD, award-winning cinematography, photoreal human character, natural facial symmetry, flawless face anatomy, masterpiece",
    },
    "Anime": {
        "char_prompt": "masterpiece anime character with symmetrical detailed expressive eyes, crisp line art, beautiful facial symmetry, dynamic hair",
        "lighting": "Studio Ghibli aesthetic, vibrant anime lighting, lush hand-painted scenery, atmospheric glow",
        "suffix": "Makoto Shinkai anime style, crisp line art, beautiful high quality Japanese animation, 8k",
    },
    "Disney 3D": {
        "char_prompt": "adorable Disney Pixar 3D animated character, charming symmetrical facial features, cute stylized person, natural expressive eyes",
        "lighting": "subsurface scattering, warm studio 3d lighting, soft cinematic rim light",
        "suffix": "Pixar 3D animation movie still, Unreal Engine 5 render, Octane render 8k, adorable character",
    },
    "Mecha": {
        "char_prompt": "futuristic cyberpunk hero wearing glowing high-tech mecha exoskeleton armor, sharp symmetrical cybernetic helmet",
        "lighting": "neon reflections in the rain, atmospheric cyan and magenta haze, dramatic sci-fi lighting",
        "suffix": "cinematic sci-fi mecha aesthetic, intricate mechanical armor, sharp focus, 8k",
    },
    "Dark Fantasy": {
        "char_prompt": "epic medieval fantasy warrior knight with symmetrical facial structure, intricately engraved steel armor and flowing cape",
        "lighting": "volumetric dark mist, glowing magical runes, dramatic torchlight and deep shadows",
        "suffix": "dark fantasy concept art, Elden Ring and Witcher aesthetic, ArtStation trending, 8k masterpiece",
    },
    "Retro Comic": {
        "char_prompt": "vintage graphic novel comic book character, heroic pose, symmetrical bold ink illustration",
        "lighting": "retro pop-art halftone colors, bold black contour lines, dramatic comic noir shadows",
        "suffix": "classic superhero comic book cover, detailed cross-hatching, vintage comic art, 8k",
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
    Transforms any story script sentence into a rich, photorealistic,
    scene-specific prompt that image generators will faithfully render,
    centered around expressive characters and the user's chosen art style.
    """
    clean = clean_narration(script_sentence)
    genre = infer_genre(category, topic, script_sentence)
    genre_style = GENRE_VISUAL_STYLES.get(genre, GENRE_VISUAL_STYLES["Horror"])

    # Fallback to topic if script sentence was mostly filler
    visual_core = clean if len(clean) > 8 else clean_narration(topic)
    if not visual_core or len(visual_core) < 4:
        visual_core = f"{category} scene, {topic}"

    # Aspect framing
    framing = "vertical 9:16 framing, full height composition" if "9:16" in aspect_ratio else "cinematic 16:9 widescreen composition"

    matched_preset = None
    if style_preset:
        for k, v in CHARACTER_STYLE_PRESETS.items():
            if k.lower() in style_preset.lower() or style_preset.lower() in k.lower():
                matched_preset = v
                break

    quality_anchor = "flawless facial symmetry, perfectly centered natural eyes, detailed iris and pupils, anatomically correct features"
    if matched_preset:
        prompt_parts = [
            f"{matched_preset['char_prompt']} in {visual_core}",
            quality_anchor,
            matched_preset["lighting"],
            framing,
            matched_preset["suffix"],
        ]
    else:
        prompt_parts = [
            visual_core,
            quality_anchor,
            genre_style["lighting"],
            genre_style["camera"],
            framing,
            genre_style["suffix"],
        ]

    return ", ".join(p for p in prompt_parts if p)

