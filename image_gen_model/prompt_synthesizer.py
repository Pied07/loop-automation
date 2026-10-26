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
    "Realism": {
        "character_in_action": "expressive person in dynamic motion and authentic stance with natural anatomy",
        "environment_vibe": "richly detailed cinematic living world, deep atmospheric background architecture, authentic environmental depth of field",
        "lighting": "cinematic film still, 35mm photograph, dramatic natural rim lighting, volumetric depth",
        "suffix": "photorealistic 8k UHD, award-winning cinematic storytelling, wide establishing environmental composition, photoreal scene, masterpiece",
    },
    "Anime": {
        "character_in_action": "cohesive Japanese 2D anime hero in dynamic motion and action stance, expressive anime eyes and stylized anime facial features",
        "environment_vibe": "lush hand-painted anime landscape, Studio Ghibli and Makoto Shinkai aesthetic, gorgeous environmental scenery, deep sky vistas and floating particles",
        "lighting": "vibrant anime lighting, atmospheric god rays, glowing embers, dynamic wind",
        "suffix": "Makoto Shinkai aesthetic, crisp clean line art, beautiful high quality Japanese animation scenery, unified anime movie still, no photo face",
    },
    "Disney 3D": {
        "character_in_action": "expressive stylized 3D animated character in lively active motion, cohesive 3D feature animation facial anatomy",
        "environment_vibe": "lush Pixar 3D animated world, detailed storybook architecture, rich environmental scenery, immersive background world",
        "lighting": "subsurface scattering, warm studio 3d lighting, soft cinematic volumetric rim light",
        "suffix": "Pixar 3D animation movie still, Unreal Engine 5 render, Octane render 8k, full wide animated scene, seamless 3D rendering",
    },
    "Mecha": {
        "character_in_action": "cyberpunk operative in sleek glowing high-tech mecha exoskeleton armor with integrated cyber helmet and glowing visor",
        "environment_vibe": "neon-lit rainy futuristic cyberpunk metropolis, towering holographic skyscrapers, wet reflective asphalt, cybernetic industrial machinery in background",
        "lighting": "neon reflections in the rain, atmospheric cyan and magenta haze, dramatic volumetric sci-fi lighting",
        "suffix": "cinematic sci-fi mecha concept art, intricate mechanical armor, sharp focus, 8k wide angle scene, cohesive sci-fi design",
    },
    "Dark Fantasy": {
        "character_in_action": "epic medieval dark fantasy knight in ornate steel plate armor, sculpted helmet, cohesive dark fantasy concept art character",
        "environment_vibe": "crumbling gothic stone fortress ruins, burning torchlight, dark volumetric mist, swirling ember fog, towering ancient castle spires in deep background",
        "lighting": "volumetric dark mist, glowing magical runes, dramatic torchlight and moonlit deep shadows",
        "suffix": "dark fantasy cinematic digital concept art, Elden Ring and Witcher aesthetic, cohesive painterly illustration, ArtStation trending, seamless character rendering, no photorealistic face collage",
    },
    "Retro Comic": {
        "character_in_action": "vintage graphic novel superhero in heroic dynamic action stance, stylized comic book facial rendering",
        "environment_vibe": "dramatic retro comic book cityscape background, stylized noir architecture, graphic halftone skyline, dynamic perspective lines",
        "lighting": "retro pop-art halftone colors, bold black contour lines, dramatic comic noir shadows",
        "suffix": "classic superhero comic book action panel, detailed cross-hatching, vintage comic art, 8k wide action scene, uniform comic illustration",
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
    scene-specific prompt that image generators will faithfully render as a
    full environmental cinematic scene with dynamic action (never a flat portrait).
    """
    clean = clean_narration(script_sentence)
    genre = infer_genre(category, topic, script_sentence)
    genre_style = GENRE_VISUAL_STYLES.get(genre, GENRE_VISUAL_STYLES["Action"] if genre == "Action" else GENRE_VISUAL_STYLES["Horror"])

    # Fallback to topic if script sentence was mostly filler
    visual_core = clean if len(clean) > 8 else clean_narration(topic)
    if not visual_core or len(visual_core) < 4:
        visual_core = f"{category} scene, {topic}"

    # Aspect framing with wide environmental establishing instruction
    framing = "cinematic wide-angle vertical 9:16 establishing shot, deep environmental background, dynamic action in full scene" if "9:16" in aspect_ratio else "cinematic 16:9 widescreen environmental establishing composition, deep background, dynamic action in full scene"

    matched_preset = None
    if style_preset:
        for k, v in CHARACTER_STYLE_PRESETS.items():
            if k.lower() in style_preset.lower() or style_preset.lower() in k.lower():
                matched_preset = v
                break

    is_realism = style_preset and "realism" in style_preset.lower()
    quality_anchor = (
        "flawless anatomical symmetry, natural detailed eyes, sharp focused gaze, anatomically correct photoreal"
        if is_realism
        else "stylistically cohesive anatomy, expressive art features, seamless character rendering, no photo collage, no pasted face"
    )

    if matched_preset:
        prompt_parts = [
            f"Cinematic wide establishing scene of {visual_core}",
            f"featuring {matched_preset['character_in_action']}",
            matched_preset["environment_vibe"],
            framing,
            quality_anchor,
            matched_preset["lighting"],
            matched_preset["suffix"],
        ]
    else:
        prompt_parts = [
            f"Cinematic wide establishing scene of {visual_core}",
            genre_style["lighting"],
            genre_style["camera"],
            framing,
            quality_anchor,
            genre_style["suffix"],
        ]

    return ", ".join(p for p in prompt_parts if p)

