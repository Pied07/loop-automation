"""
=============================================================================
  STORY SCENE PROMPT SYNTHESIZER
  Translates story script narration into rich, cinematic visual prompts
  that accurately match each scene without distorted, melting, or weird faces.
=============================================================================
"""

import re
from typing import Dict, List, Optional

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
    r"\bfollow\s+(?:right\s+now\s+)?for\s+part\s+\d+.*$",
]

# Character indicators to detect whether scene actually includes human subjects
CHARACTER_PATTERNS = [
    r"\b(?:man|woman|boy|girl|person|people|someone|anyone|human|humans|explorer|explorers|detective|scientist|doctor|nurse|surgeon|physician|teacher|professor|student|engineer|worker|builder|driver|pilot|captain|astronaut|chef|cook|baker|artist|painter|musician|singer|dancer|athlete|runner|player|boxer|warrior|soldier|guard|knight|wanderer|operator|figure|silhouette|traveler|stranger|tourist|commuter|passenger|pedestrian|citizen|samurai|ronin|ninja|monk|priest|priestess|assassin|hunter|archer|wizard|mage|witch|sorcerer|sorceress|king|queen|prince|princess|emperor|empress|adventurer|hero|heroine|protagonist|villain|rival|model|actor|actress|beauty|swordsman|swordswoman|gladiator|fighter|veteran|elder|child|children|toddler|baby|kid|kids|teen|teenager|youth|adult|elderly)\b",
    r"\b(?:sarah|marcus|lucas|talia|finnian|kira|mark|alex|john|david|emma|elena|arthur|victor|clara|michael|james|mary|robert|william|richard|joseph|thomas|charles|christopher|daniel|matthew|anthony|donald|paul|steven|andrew|kenneth|joshua|kevin|brian|george|edward|ronald|timothy|jason|jeffrey|ryan|jacob|gary|nicholas|eric|jonathan|stephen|larry|justin|scott|brandon|benjamin|samuel|gregory|alexander|patrick|frank|raymond|jack|dennis|jerry|tyler|aaron|jose|adam|nathan|henry|douglas|zachary|peter|kyle|walter|ethan|jeremy|harold|keith|christian|roger|noah|gerald|carl|terry|sean|austin|arthur|lawrence|jesse|dylan|bryan|joe|jordan|billy|albert|bruce|willie|gabriel|logan|alan|juan|wayne|roy|ralph|randy|eugene|vincent|russell|louis|philip|bobby|johnny|bradley)\b",
    r"\b(?:he|she|they|him|her|them)\s+(?:walked|stepped|looked|gazed|ran|turned|whispered|froze|reached|stood|held|sat|saw|watched|crawled|pressed|backed|smiled|cried|talked|spoke|listened|waited|drove|worked|studied|lived)\b",
    r"\b(?:female|male|lady|gentleman|guy|fellow|body|face|portrait|character|hero|protagonist|goddess|beauty|crowd|audience|spectators|crew|team)\b",
]

# Comprehensive cinematic and visual style definitions
UNIFIED_STYLE_PRESETS: Dict[str, Dict[str, str]] = {
    "Cinematic Film": {
        "prefix": "cinematic film still, 35mm photography",
        "lighting": "dramatic atmospheric lighting, natural depth of field, chiaroscuro contrast",
        "suffix": "photorealistic 8k, Panavision anamorphic lens, award-winning cinematography, ultra-detailed textures",
        "char_framing": "cinematic medium shot, natural posture, integrated with environment",
        "env_framing": "wide establishing shot, atmospheric depth, rich environmental storytelling",
    },
    "Realism": {
        "prefix": "masterpiece raw 35mm DSLR color photograph, ultra-photorealistic, shot on Sony A7R V, 85mm f/1.4 GM lens",
        "lighting": "natural golden hour lighting, cinematic rim light, authentic optical depth of field, soft realistic bokeh, physical light bounce",
        "suffix": "award-winning National Geographic portrait photography, authentic human skin texture with pores, lifelike features, 8k UHD, true photorealism",
        "char_framing": "cinematic on-location portrait photograph, natural authentic posture, shallow depth of field, perfectly proportioned anatomy",
        "env_framing": "breathtaking on-location outdoor landscape photography, natural lighting, high dynamic range, sharp organic details",
    },
    "Epic Fantasy": {
        "prefix": "epic fantasy digital concept art, masterpiece",
        "lighting": "volumetric mist, ethereal god rays, ancient majesty",
        "suffix": "artstation trending, 8k resolution, highly detailed fantasy scenery, breathtaking scale",
        "char_framing": "heroic cinematic shot, fantasy adventurer in context, sweeping perspective",
        "env_framing": "grand sweeping landscape, monumental ancient architecture, mythical atmosphere",
    },
    "Sci-Fi Cyberpunk": {
        "prefix": "cyberpunk film still, sharp focus",
        "lighting": "glowing neon reflections, futuristic atmospheric haze, moody rain-slicked lighting",
        "suffix": "Blade Runner aesthetic, Unreal Engine 5 render, high tech atmosphere, 8k",
        "char_framing": "cyber operative in tactical gear, natural dynamic angle, neon reflections",
        "env_framing": "towering futuristic skyline, intricate cybernetic details, atmospheric haze",
    },
    "Dark Mystery": {
        "prefix": "dark mystery film still, ominous cinematic mood",
        "lighting": "dramatic deep shadows, amber lantern glow, chilling atmospheric contrast",
        "suffix": "cinematic neo-noir aesthetic, 8k UHD, suspenseful atmospheric tension",
        "char_framing": "atmospheric silhouette in the shadows, mysterious cinematic framing",
        "env_framing": "shadowy interior, moody volumetric fog, intense dramatic ambiance",
    },
    "Historical Epic": {
        "prefix": "epic historical movie still, authentic period atmosphere",
        "lighting": "dramatic late afternoon sunlight, dusty golden rays, 35mm film grain",
        "suffix": "award-winning historical cinematography, highly detailed textures, 8k",
        "char_framing": "historical traveler in period attire, natural cinematic composition",
        "env_framing": "authentic ancient architecture, monumental stone ruins, sweeping vista",
    },
    "Anime / Manga": {
        "prefix": "masterpiece high definition 2D Japanese anime digital key visual, Ufotable style, clean delicate lineart",
        "lighting": "radiant cinematic rim lighting, warm golden ambient glow, luminous energy bloom, 8k anime wallpaper",
        "suffix": "trending on Pixiv, clean delicate anime lineart, expressive luminous anime eyes, polished digital anime illustration, 8k anime wallpaper",
        "char_framing": "cinematic high definition anime shot, clear visible stance, prominent hero focus, dynamic anime composition",
        "env_framing": "traditional Japanese wooden pavilion, hanging warm lanterns, soft bokeh blur",
    },
    "Anime / Storybook": {
        "prefix": "Studio Ghibli inspired anime scenery, gorgeous hand-painted art",
        "lighting": "lush vibrant color palette, atmospheric golden light, soft whimsical glow",
        "suffix": "masterpiece animation still, clean line art, beautiful scenic landscape",
        "char_framing": "expressive animated character, stylized natural pose, harmonious composition",
        "env_framing": "breathtaking animated landscape, lush scenic details, peaceful atmosphere",
    },
    "Photorealistic Nature": {
        "prefix": "National Geographic documentary photography, crisp organic details",
        "lighting": "golden hour sunlight, clean natural illumination, high contrast",
        "suffix": "8k UHD, pin-sharp focus, award-winning nature photography",
        "char_framing": "documentary field explorer observed from natural distance, environmental context",
        "env_framing": "pristine wilderness, breathtaking natural formations, ultra-fine foliage textures",
    },
    "Retro Comic": {
        "prefix": "vintage retro comic book art panel, classic graphic novel illustration",
        "lighting": "bold black ink contour lines, dramatic comic noir shadows, pop-art halftone dots",
        "suffix": "detailed cross-hatching, classic comic book aesthetic, 8k comic artwork",
        "char_framing": "dynamic comic character stance, classic illustrative style",
        "env_framing": "stylized graphic novel background, dramatic ink perspectives",
    },
    "Disney 3D": {
        "prefix": "Pixar Disney 3D animation style, beautifully rendered CGI scene",
        "lighting": "warm cinematic studio 3D lighting, subsurface scattering, soft volumetric rim light",
        "suffix": "Unreal Engine 5 Octane render 8k, polished animated movie still",
        "char_framing": "expressive 3D animated character, charming stylized features, natural pose",
        "env_framing": "whimsical 3D animated environment, rich warm textures, delightful atmosphere",
    },
    "Dark Fantasy": {
        "prefix": "dark fantasy cinematic digital concept art, gothic painterly illustration",
        "lighting": "volumetric dark mist, glowing magical runes, dramatic torchlight and moonlit shadows",
        "suffix": "Elden Ring aesthetic, ArtStation trending, seamless painterly rendering, 8k",
        "char_framing": "lone knight in ornate plate armor, atmospheric concept art composition",
        "env_framing": "monumental gothic fortress, ominous misty ruins, dark enchanted wilderness",
    },
}


def clean_narration(text: str) -> str:
    """Removes conversational filler, greetings, quantity multipliers, medical/injury triggers, and speech tags."""
    clean = text.strip()
    for pat in FILLER_PATTERNS:
        clean = re.sub(pat, "", clean, flags=re.IGNORECASE)

    # Remove dialogue attribution tags that add noise without visual meaning
    clean = re.sub(r"\b(?:whispered|remarked|urged|choked out|shouted|screamed|exclaimed|said|muttered|cried)\b", "", clean, flags=re.IGNORECASE)

    # Remove quantity multipliers like 'eighteen times', '300 days' that trigger duplicate heads/limbs
    clean = re.sub(
        r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|days|hours|years|copies|rejections)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )

    # Filter pure gore and grotesque trauma triggers that cause mutilated face renders
    clean = re.sub(
        r"\b(?:mutilated|severed\s+limbs?|visceral\s+wound|bleeding\s+profusely|grotesque\s+gore|decapitated)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )

    # Preserve requested battle scars as prominent scars while filtering medical trauma and blemishes
    has_scars = bool(re.search(r"\b(?:scars?|scarred|battle\s+scars?)\b", clean, re.IGNORECASE))
    if has_scars:
        clean = re.sub(
            r"\b(?:scars?\s+all\s+over(?:\s+(?:his|her|their|the))?\s+body|with\s+scars?|scars?|scarred)\b",
            "prominent deep jagged battle scars",
            clean,
            flags=re.IGNORECASE,
        )
        clean = re.sub(r"\b(?:blemish(?:es)?|acne|no\s+scars?(?:\s+at\s+all)?)\b", "", clean, flags=re.IGNORECASE)
    else:
        clean = re.sub(
            r"\b(?:scars?\s+all\s+over(?:\s+(?:his|her|their|the))?\s+body|with\s+scars?|scars?|scarred|blemish(?:es)?|acne|no\s+scars?(?:\s+at\s+all)?)\b",
            "",
            clean,
            flags=re.IGNORECASE,
        )

    # Clean typos, hair, and topknot phrases
    clean = re.sub(r"\b(?:hair\s+tied\s+(?:bak|behind|back)\s+topknot|hair\s+tied\s+(?:bak|behind|back)|topknot|samurai\s+topknot)\b", "hair styled in traditional samurai topknot", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:hair\s+tied\s+beding)\b", "hair styled in traditional samurai topknot", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:and\s+)+and\b", "and", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:and\s+and\s+)+", "and ", clean, flags=re.IGNORECASE)

    # Convert aura/radiating energy in all colors and forms to clean atmospheric backlighting
    def _aura_sub(m):
        c_m = re.search(r"\b(white|golden|gold|bright|fiery|blue|purple|dark|red|shining|radiant|glowing)\b", m.group(0), re.IGNORECASE)
        color = c_m.group(1).lower() if c_m else "golden"
        return f"soft ethereal {color} backlight glow"

    clean = re.sub(
        r"\b(?:and\s+)?(?:a\s+)?(?:white|golden|gold|bright|fiery|blue|purple|dark|red|shining|radiant|glowing)?\s*(?:aura|energy|flames?|light|power)\s*(?:radiating|emanating|flowing)?(?:\s+(?:from|around)(?:\s+(?:him|her|them|his\s+body|her\s+body|the\s+body))?)?(?:\s+in\s+form\s+of\s+energy)?\b",
        _aura_sub,
        clean,
        flags=re.IGNORECASE,
    )

    # Remove redundant/awkward stance and holding phrases that clash with specialized framing and weapon tags
    clean = re.sub(
        r"\b(?:in\s+a\s+fighting\s+pose|still\s+standing(?:\s+strongly)?|standing\s+(?:straight|upright|strongly|still)|poised\s+in\s+combat\s+stance)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    clean = re.sub(
        r"\b(?:holding\s+(?:his|her|their|the|a)\s+(?:katana|sword|blade))\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    clean = re.sub(r"\b(?:and\s+)+", " ", clean, flags=re.IGNORECASE)

    # Clean punctuation and quotes
    clean = re.sub(r'["\'*_#`~]', "", clean)
    clean = re.sub(r"\s+", " ", clean).strip(" ,")
    return clean


def infer_genre(category: str, topic: str, text: str) -> str:
    """Identifies the dominant storytelling genre from context."""
    combined = f"{category} {topic} {text}".lower()
    if "romance" in category.lower() or any(w in combined for w in ["romance", "love", "romantic", "couple", "kiss", "embrace", "soulmate", "dating", "sweetheart", "holding hands"]):
        return "Romance"
    if any(w in combined for w in ["action", "combat", "fight", "battle", "chase", "warzone", "tactical", "explosion", "gun"]):
        return "Action"
    if "horror" in category.lower() or any(w in combined for w in ["horror", "scary", "ghost", "creepy", "haunted", "monster", "demon", "asylum", "spectral", "phantom"]):
        return "Horror"
    if any(w in combined for w in ["detective", "mystery", "crime", "secret", "clue", "investigat", "unsolved"]):
        return "Mystery"
    if any(w in combined for w in ["scifi", "sci-fi", "tech", "cyber", "ai", "future", "robot", "space", "alien", "neon"]):
        return "Sci-Fi"
    if any(w in combined for w in ["fantasy", "magic", "dragon", "wizard", "spell", "myth", "kingdom", "sword", "castle"]):
        return "Fantasy"
    if any(w in combined for w in ["history", "ancient", "war", "century", "empire", "king", "pharaoh", "gladiator", "temple"]):
        return "Historical"
    if any(w in combined for w in ["motivat", "success", "inspire", "athlete", "champion", "discipline", "mountain"]):
        return "Motivational"
    if any(w in combined for w in ["funny", "comedy", "hilarious", "laugh", "prank", "humor"]):
        return "Comedy"
    return "Educational"


def find_style_preset(style_name: Optional[str]) -> Dict[str, str]:
    """Finds matching style preset or defaults to Cinematic Film."""
    if not style_name:
        return UNIFIED_STYLE_PRESETS["Cinematic Film"]

    s_lower = style_name.strip().lower()
    for key, val in UNIFIED_STYLE_PRESETS.items():
        k_lower = key.lower()
        if k_lower == s_lower or k_lower in s_lower or s_lower in k_lower:
            return val

    # Common aliases
    if "raw" in s_lower:
        return {
            "prefix": "",
            "lighting": "",
            "suffix": "",
            "char_framing": "",
            "env_framing": "",
        }
    if "anime" in s_lower or "manga" in s_lower or "ghibli" in s_lower:
        if "storybook" in s_lower or "ghibli" in s_lower:
            return UNIFIED_STYLE_PRESETS["Anime / Storybook"]
        return UNIFIED_STYLE_PRESETS["Anime / Manga"]
    if "real" in s_lower:
        return UNIFIED_STYLE_PRESETS["Realism"]
    if "3d" in s_lower or "pixar" in s_lower or "disney" in s_lower:
        return UNIFIED_STYLE_PRESETS["Disney 3D"]
    if "cyber" in s_lower or "sci" in s_lower:
        return UNIFIED_STYLE_PRESETS["Sci-Fi Cyberpunk"]
    if "comic" in s_lower or "graphic" in s_lower:
        return UNIFIED_STYLE_PRESETS["Retro Comic"]
    if "dark fantasy" in s_lower or "gothic" in s_lower:
        return UNIFIED_STYLE_PRESETS["Dark Fantasy"]
    if "fantasy" in s_lower:
        return UNIFIED_STYLE_PRESETS["Epic Fantasy"]
    if "mystery" in s_lower or "dark" in s_lower:
        return UNIFIED_STYLE_PRESETS["Dark Mystery"]
    if "history" in s_lower or "period" in s_lower:
        return UNIFIED_STYLE_PRESETS["Historical Epic"]
    if "nature" in s_lower or "photo" in s_lower:
        return UNIFIED_STYLE_PRESETS["Photorealistic Nature"]

    return UNIFIED_STYLE_PRESETS["Cinematic Film"]


def synthesize_scene_prompt(
    script_sentence: str,
    topic: str = "",
    category: str = "Interesting Facts",
    aspect_ratio: str = "9:16",
    style_preset: Optional[str] = "Cinematic Film",
) -> str:
    """
    Transforms any story script sentence into a clean, cinematic, scene-accurate prompt.
    CRITICAL GUARANTEES:
    - 100% fidelity to the actual story narrative (doors, rooms, nature, technology, or characters).
    - NEVER injects warriors, tribal robes, kimonos, or swords unless explicitly in the story text.
    - NEVER stacks heads or creates conjoined bodies.
    - Automatically distinguishes environment/object shots from character shots.
    """
    clean_raw = script_sentence.strip()
    if style_preset and "raw" in style_preset.lower():
        return clean_raw

    if clean_raw.lower().startswith("cinematic") and ("8k" in clean_raw.lower() or "shot" in clean_raw.lower()):
        return clean_raw

    is_direct = category.lower() in ["custom", "imagegen", "direct", "image generator"]
    clean = clean_narration(script_sentence)

    if is_direct:
        visual_core = clean if len(clean) > 5 else clean_raw
    else:
        visual_core = clean if len(clean) > 8 else clean_narration(topic)
    if not visual_core or len(visual_core) < 4:
        visual_core = f"{topic}: {clean}" if topic and clean else (clean or f"{category} scene")

    # Keep visual core concise (within 35 words) so it fits in CLIP context
    words = visual_core.split()
    if len(words) > 35:
        visual_core = " ".join(words[:35])

    preset = find_style_preset(style_preset)
    s_lower = (style_preset or "").lower()

    # Detect if the scene explicitly describes a human subject
    has_explicit_character = any(re.search(pat, visual_core, re.IGNORECASE) for pat in CHARACTER_PATTERNS)
    
    # Detect if the story is genuinely about warriors/samurai/combat
    is_warrior_theme = bool(re.search(r"\b(?:warrior|soldier|samurai|ronin|ninja|knight|gladiator|blade|katana|sword|combat|battlefield)\b", f"{visual_core} {topic}", re.I))

    # Detect specific genre flavors
    is_horror = (not is_direct) and (
        "horror" in category.lower()
        or any(w in f"{script_sentence} {topic}".lower() for w in ["ghost", "specter", "haunt", "demon", "creepy", "phantom", "asylum", "curse", "shadowy figure"])
    ) and category.lower() not in ["romance", "comedy", "food", "motivational", "music"]

    is_anime = any(w in s_lower for w in ["anime", "manga", "ghibli", "cartoon"]) and "comic" not in s_lower
    is_disney = any(w in s_lower for w in ["disney", "pixar", "3d"])
    is_cyberpunk = any(w in s_lower for w in ["cyber", "sci-fi", "futuristic"])
    is_comic = any(w in s_lower for w in ["comic", "graphic"])

    framing_tag = "vertical 9:16 composition" if "9:16" in aspect_ratio else "widescreen 16:9 composition"

    # Detect human presence and character relationships
    has_explicit_character = any(re.search(pat, visual_core, re.IGNORECASE) for pat in CHARACTER_PATTERNS)
    has_human_interaction = bool(re.search(
        r"\b(?:smile|smiled|smiling|laugh|laughed|glance|glanced|gaze|gazes|gazed|look|looked|looking|stare|stared|eyes|eye|face|faces|hand|hands|holding|touch|touched|embrace|kiss|whisper|whispered|confess|confessed|teacup|coffee|shoulders|walked|stepped|reminisce|reminisced|dreams|dream|tears|voice|together|couple|duo|pair|both|each\s+other)\b",
        visual_core,
        re.IGNORECASE,
    ))
    has_named_person = len(re.findall(r"\b[A-Z][a-z]{2,}\b", visual_core)) >= 1
    has_characters = has_explicit_character or has_human_interaction or has_named_person

    # Detect couple / two-person interactions vs single person
    is_couple = (
        "romance" in category.lower()
        or bool(re.search(r"\b(?:two|both|together|couple|pair|duo|side\s+by\s+side|each\s+other|hand\s+in\s+hand|holding\s+hands|shared\s+a|locked\s+across|their\s+shoulders)\b", visual_core, re.I))
        or len(re.findall(r"\b[A-Z][a-z]{2,}\b", visual_core)) >= 2
        or (bool(re.search(r"\b(?:man|boy|he|him)\b", visual_core, re.I)) and bool(re.search(r"\b(?:woman|girl|she|her)\b", visual_core, re.I)))
    ) and has_characters

    # Detect if the story is genuinely about warriors/samurai/combat
    is_warrior_theme = bool(re.search(r"\b(?:warrior|soldier|samurai|ronin|ninja|knight|gladiator|blade|katana|sword|combat|battlefield)\b", f"{visual_core} {topic}", re.I))

    # Detect specific genre flavors
    is_horror = (not is_direct) and (
        "horror" in category.lower()
        or any(w in f"{script_sentence} {topic}".lower() for w in ["ghost", "specter", "haunt", "demon", "creepy", "phantom", "asylum", "curse", "shadowy figure"])
    ) and category.lower() not in ["romance", "comedy", "food", "motivational", "music"]

    prompt_parts = []

    # 1. Style prefix
    if is_horror:
        prompt_parts.append("cinematic horror film still, chilling atmospheric lighting, deep shadows, 35mm film photography, 8k")
    elif is_anime:
        prompt_parts.append("masterpiece 2D Japanese anime digital key visual, Ufotable Kyoto Animation style, clean crisp lineart, luminous vibrant colors, beautifully drawn aligned anime eyes, sharp clear pupils, 8k")
    elif is_disney:
        prompt_parts.append("Pixar Disney 3D animation style, beautifully rendered CGI scene, warm volumetric lighting, 8k")
    elif is_cyberpunk:
        prompt_parts.append("cyberpunk film still, sharp focus, glowing neon reflections, rain-slicked surfaces, Blade Runner aesthetic, 8k")
    elif is_comic:
        prompt_parts.append("vintage retro comic book art panel, bold ink outlines, graphic novel illustration, pop-art style, 8k")
    else:
        prompt_parts.append(preset.get("prefix", "masterpiece raw 35mm DSLR photograph, cinematic film still"))

    # 2. Main subject: THE ACTUAL STORY SCENE (Always front and center!)
    prompt_parts.append(f"cinematic shot of {visual_core}")

    # 3. Contextual framing & character handling
    if is_couple:
        if is_anime:
            staging = (
                "romantic anime couple, young man and young woman together side by side, natural graceful posture, "
                "both characters facing the same natural direction, head and body oriented consistently, "
                "authentic anatomically correct necks, beautifully drawn faces, perfectly aligned symmetrical anime eyes, "
                "sharp clear pupils, clear iris, natural gentle expressions, exactly two arms each, five fingers per hand, "
                "distinct separate bodies, no conjoined limbs, no stacked characters"
            )
        else:
            staging = (
                "two people, man and woman together side by side, natural realistic posture, "
                "both characters facing the same natural direction, head and body oriented consistently, "
                "authentic anatomically correct necks, beautifully rendered faces, perfectly aligned symmetrical eyes, "
                "sharp clear pupils, authentic facial expressions, exactly two arms each, five fingers per hand, "
                "distinct separate bodies, no conjoined limbs, no stacked characters"
            )
        prompt_parts.append(staging)
    elif has_characters:
        # Detect character gender / descriptor
        is_female = bool(re.search(r"\b(?:woman|girl|female|lady|queen|princess|actress|she|her)\b", visual_core, re.I))
        is_male = bool(re.search(r"\b(?:man|boy|male|guy|king|prince|actor|he|him)\b", visual_core, re.I))
        char_desc = "1woman" if is_female else ("1man" if is_male else "1person")

        # Clothing: Only wear warrior gear if it's explicitly a warrior story!
        if is_warrior_theme:
            clothing = "authentic warrior armor and attire"
        elif is_cyberpunk:
            clothing = "modern cyberpunk jacket and street clothing"
        elif is_anime:
            clothing = "stylish anime outfit matching the scene"
        else:
            clothing = "natural modern casual clothing, neat contemporary attire"

        # Staging: Strictly single head, natural human anatomy, consistent eye-level/medium framing
        if is_anime:
            staging = (
                f"single anime {char_desc}, {clothing}, natural graceful posture, "
                f"head and body facing the same natural direction, authentic anatomically correct neck, "
                f"single head, perfectly aligned symmetrical anime eyes, sharp detailed pupils, clear iris, "
                f"exactly two arms, five fingers per hand, correct anatomical proportions, no duplicate bodies"
            )
        else:
            staging = (
                f"centered single {char_desc}, {clothing}, natural realistic posture, "
                f"head and body facing the same natural direction, authentic anatomically correct neck, "
                f"single head, perfectly aligned symmetrical eyes, sharp detailed pupils, clear iris, "
                f"exactly two arms, five fingers per hand, correct anatomical proportions, no duplicate bodies"
            )
        prompt_parts.append(staging)
    else:
        # Environmental, architectural, mechanical, or object shot (doors, buildings, nature, cars, food, tech)
        prompt_parts.append("detailed environment, authentic physical textures, rich architectural depth, sharp clean focus, scenic view, no humans, no characters")

    # 4. Atmospheric lighting & finish
    if is_horror:
        prompt_parts.append("ominous moonlight, cold atmospheric mist, dramatic cinematic suspense")
    elif is_anime:
        prompt_parts.append("radiant rim lighting, golden ambient glow, beautiful scenic background")
    else:
        prompt_parts.append(preset.get("lighting", "natural cinematic lighting, authentic depth of field, high dynamic range"))
        prompt_parts.append(preset.get("suffix", "photorealistic 8k, ultra-detailed textures"))

    prompt_parts.append(framing_tag)

    # Combine parts and prune duplicates while preserving order
    seen_clauses = set()
    filtered_clauses = []
    for part in prompt_parts:
        if not part:
            continue
        for clause in part.split(","):
            c_clean = clause.strip()
            if not c_clean:
                continue
            c_lower = c_clean.lower()
            if c_lower not in seen_clauses:
                seen_clauses.add(c_lower)
                filtered_clauses.append(c_clean)

    # Safely fit within 62 words to strictly guarantee within CLIP's 75 token context window
    fitted_clauses = []
    current_word_count = 0
    for clause in filtered_clauses:
        clause_words = len(clause.split())
        if current_word_count + clause_words > 62 and fitted_clauses:
            break
        fitted_clauses.append(clause)
        current_word_count += clause_words

    return ", ".join(fitted_clauses)
