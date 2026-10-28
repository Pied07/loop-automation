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
    r"\b(?:man|woman|boy|girl|person|people|explorer|explorers|detective|scientist|astronaut|warrior|soldier|guard|knight|wanderer|operator|pilot|captain|figure|silhouette|traveler|stranger|samurai|ronin|ninja|monk|assassin|hunter|archer|wizard|mage|king|queen|prince|princess|adventurer|hero|protagonist|model|actor|actress|beauty|swordsman|swordswoman|gladiator|fighter|sorcerer|sorceress|priest|priestess)\b",
    r"\b(?:sarah|marcus|lucas|talia|finnian|kira|mark|alex|john|david|emma|elena|arthur|victor|clara)\b",
    r"\b(?:he|she|they|him|her|them)\s+(?:walked|stepped|looked|gazed|ran|turned|whispered|froze|reached|stood|held|sat|saw|watched|crawled|pressed|backed)\b",
    r"\b(?:nude|naked|model|female|male|lady|guy|body|face|portrait|character|hero|protagonist|goddess|beauty)\b",
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
        "prefix": "masterpiece authentic 2D Japanese anime visual art, high-end anime key visual, Makoto Shinkai and Ufotable style",
        "lighting": "dynamic anime lighting, radiant luminous bloom, vibrant rich saturated colors, stunning ambient highlights",
        "suffix": "trending on Pixiv, crisp cel-shaded anime line art, expressive luminous anime eyes, clean beautiful digital anime illustration, 8k anime wallpaper",
        "char_framing": "cinematic anime key visual framing, prominent hero focus, dynamic anime composition, well-proportioned limbs",
        "env_framing": "atmospheric anime scenery, beautifully painted background scenery, soft depth of field blur",
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

    # Remove quantity multipliers like 'eighteen times', '300 doors' that trigger duplicate heads/limbs
    clean = re.sub(
        r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty|forty|fifty|hundred|thousand|million)\s+(?:times|doors|days|hours|years|copies|rejections)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )

    # Aggressively filter physical trauma and injury triggers that cause mutilated/distorted face renders or weathered skin
    clean = re.sub(
        r"\b(?:spinal mobility|highway crash|car crash|crash|paralysis|paralyzed|wheelchair|crutches|rehabilitation|hospital|amputation|injured|injury|deformity|deformed|broken|surgery|disease|sick|illness|twisted|severed|bleeding|wound)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )

    # Clean up scars, cuts, and blemish triggers that cause rough weathered skin
    clean = re.sub(
        r"\b(?:scars?\s+all\s+over(?:\s+(?:his|her|their|the))?\s+body|with\s+scars?|scars?|scarred|blemish(?:es)?|acne|wrinkles?|no\s+scars?(?:\s+at\s+all)?)\b",
        "",
        clean,
        flags=re.IGNORECASE,
    )

    # Clean typos and awkward phrases
    clean = re.sub(r"\b(?:hair\s+tied\s+beding|hair\s+tied\s+behind)\b", "hair tied back", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:and\s+)+and\b", "and", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\b(?:and\s+and\s+)+", "and ", clean, flags=re.IGNORECASE)

    # Convert aura/radiating energy to subtle atmospheric lighting instead of solid physical clutter
    def _aura_sub(m):
        color = (m.group(1) or "golden").strip()
        return f"soft ethereal {color} backlight glow, subtle luminous floating embers"

    clean = re.sub(
        r"\b(?:and\s+)?(?:a\s+)?(golden|bright|fiery|blue|purple|dark|shining|radiant|glowing)?\s*(?:aura|energy|flames?|light)\s*radiating(?:\s+(?:from|around)(?:\s+(?:his|her|their|the))?\s+body)?\b",
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
    CRITICAL:
    - Never injects toxic portrait phrases ('authentic human with symmetrical facial features').
    - Distinguishes environmental/object shots from character shots.
    - Accurately renders props, architecture, atmosphere, and action.
    """
    clean_raw = script_sentence.strip()
    if style_preset and "raw" in style_preset.lower():
        return clean_raw

    if clean_raw.lower().startswith("cinematic") and ("8k" in clean_raw.lower() or "shot" in clean_raw.lower()):
        return clean_raw

    is_direct = category.lower() in ["custom", "imagegen", "direct", "image generator"]
    clean = clean_narration(script_sentence)
    genre = "General" if is_direct else infer_genre(category, topic, script_sentence)

    if is_direct:
        visual_core = clean if len(clean) > 5 else clean_raw
    else:
        visual_core = clean if len(clean) > 8 else clean_narration(topic)
    if not visual_core or len(visual_core) < 4:
        visual_core = f"{category} scene, {topic}"

    # Keep visual core concise but don't truncate user creative descriptions
    words = visual_core.split()
    max_words = 65 if is_direct else 36
    if len(words) > max_words:
        visual_core = " ".join(words[:max_words])

    preset = find_style_preset(style_preset)

    # Check whether the scene describes human characters or inanimate objects/environments
    has_characters = any(re.search(pat, visual_core, re.IGNORECASE) for pat in CHARACTER_PATTERNS) or any(re.search(pat, script_sentence, re.IGNORECASE) for pat in CHARACTER_PATTERNS)

    is_female = bool(re.search(r"\b(?:woman|girl|female|lady|queen|princess|actress|heroine|goddess|she|her)\b", f"{visual_core} {script_sentence}", re.IGNORECASE))
    is_male = bool(re.search(r"\b(?:man|boy|male|guy|king|prince|actor|hero|samurai|warrior|soldier|he|him|his)\b", f"{visual_core} {script_sentence}", re.IGNORECASE))

    has_weapon = bool(re.search(r"\b(?:sword|blade|dagger|spear|axe|shield|bow|weapon|gun|pistol|rifle|saber|katana)\b", f"{visual_core} {script_sentence}", re.IGNORECASE))

    # Detect dynamic fighting, martial arts, warrior, combat, or action pose requests
    has_combat_action = bool(re.search(
        r"\b(?:fight|fighting|combat|battle|action|martial\s*arts|strike|striking|slash|slashing|attack|defend|defense|duel|clash|stance|pose|ready|ronin|samurai|warrior|ninja|knight|boxing|kick|dynamic)\b",
        f"{visual_core} {script_sentence}",
        re.IGNORECASE,
    ))

    is_anime = any(w in (style_preset or "").lower() for w in ["anime", "manga", "ghibli", "comic", "cartoon"])
    is_realistic = any(w in (style_preset or "").lower() for w in ["real", "photo", "cinematic film"])

    anatomy_rule = "authentic anatomy, exactly two arms, two hands only, five fingers per hand, natural body proportions"

    if has_combat_action:
        if has_weapon:
            pose_guidance = f"dynamic battle-ready stance, holding weapon with natural grip, {anatomy_rule}"
        else:
            pose_guidance = f"dynamic athletic action stance, balanced posture, {anatomy_rule}"
    elif has_characters:
        pose_guidance = f"natural organic posture, {anatomy_rule}"
    else:
        pose_guidance = ""

    # Detect if user prompt already specified an environmental background
    ENVIRONMENT_PATTERNS = [
        r"\b(?:forest|woods|bamboo|mountains?|hills?|river|lake|ocean|sea|beach|waterfall|field|meadow|desert|canyon|valley)\b",
        r"\b(?:temple|shrine|castle|palace|courtyard|ruins|fortress|village|town|city|street|alley|rooftop|bridge|gate|pagoda)\b",
        r"\b(?:room|hall|interior|bedroom|chamber|library|dungeon|corridor|cave|garden|balcony|tavern)\b",
        r"\b(?:battlefield|warzone|arena|clouds?|sky|outdoors?|landscape|cliffs?)\b",
    ]
    has_environment = any(re.search(pat, f"{visual_core} {script_sentence}", re.IGNORECASE) for pat in ENVIRONMENT_PATTERNS)

    if not has_environment:
        is_eastern_warrior = bool(re.search(r"\b(?:ronin|samurai|ninja|katana|warrior|swordsman|blade|martial\s*arts)\b", f"{visual_core} {script_sentence}", re.IGNORECASE))
        if is_eastern_warrior:
            if is_anime:
                env_setting = "atmospheric traditional wooden temple pavilion with paper lanterns, soft background blur"
            elif is_realistic:
                env_setting = "outdoors on location in a scenic bamboo grove, natural ambient lighting"
            else:
                env_setting = "moody atmospheric outdoor background with natural depth"
        else:
            if is_anime:
                env_setting = "in a vibrant anime landscape with lush nature and fluffy clouds"
            elif is_realistic:
                env_setting = "outdoors in a scenic landscape, natural sunlight and realistic depth"
            else:
                env_setting = "in a detailed natural outdoor environment"
    else:
        env_setting = ""

    if is_anime:
        human_enhancement = (
            f"expressive luminous anime eyes, silky anime hair, clean facial line art, flawless porcelain skin, {pose_guidance}"
        ) if has_characters else ""
    elif is_realistic:
        human_enhancement = (
            f"lifelike human face, authentic realistic eyes, natural skin texture with subtle pores, {pose_guidance}"
        ) if has_characters else ""
    else:
        human_enhancement = (
            f"well-defined features, {pose_guidance}"
        ) if has_characters else ""

    is_horror = (not is_direct) and (
        (genre == "Horror" or "horror" in category.lower())
        or any(w in f"{script_sentence} {topic}".lower() for w in ["ghost", "specter", "haunt", "demon", "creepy", "phantom", "apparition", "asylum", "curse", "shadowy figure", "entity"])
    ) and category.lower() not in ["romance", "comedy", "food", "motivational", "music"]

    is_romance = (not is_direct) and (
        genre == "Romance"
        or "romance" in category.lower()
        or any(w in f"{script_sentence} {topic}".lower() for w in ["romance", "love", "romantic", "couple", "kiss", "embrace", "soulmate", "dating", "sweetheart", "holding hands"])
    ) and not is_horror

    framing_tag = "vertical 9:16 composition" if "9:16" in aspect_ratio else "widescreen 16:9 composition"

    if has_combat_action:
        staging = "cinematic medium shot, dynamic battle pose, prominent subject focus"
    else:
        staging = preset["char_framing"] if has_characters else preset["env_framing"]

    if is_anime:
        char_tag = "1girl, beautiful anime heroine" if is_female else ("1boy, handsome anime warrior" if is_male else "1character, anime protagonist")
        style_core = "Masterpiece 2D Japanese anime, clean crisp lineart, Makoto Shinkai and Ufotable studio key visual"
        framing_part = f"solo, {char_tag}, upper body portrait, dynamic three-quarter view" if has_characters else preset["env_framing"]
        face_part = "exquisite anime face, sharp luminous amber eyes, clean jawline, flawless smooth skin" if has_characters else ""
        weapon_part = "holding a single sharp glowing electric-blue katana diagonally, single sword only, perfect hands" if has_weapon else (pose_guidance if has_characters else "")

        prompt_parts = [
            style_core,
            framing_part,
            face_part,
            weapon_part,
            visual_core,
            "clean cel shading, rich vibrant saturated colors, dramatic volumetric lighting, cinematic bloom",
        ]
    elif is_realistic:
        real_char_tag = "1woman, beautiful female portrait" if is_female else ("1man, handsome male portrait" if is_male else "1person, authentic portrait")
        style_core = "Masterpiece raw 35mm DSLR color photograph, award winning portrait photography, shot on Sony A7R V, 85mm f/1.4 GM lens"
        real_framing_part = f"solo, {real_char_tag}, upper body portrait, dynamic three-quarter view" if has_characters else preset["env_framing"]
        real_face_part = "exquisite detailed human face, authentic realistic eyes with catchlights, natural skin texture with visible fine pores" if has_characters else ""
        real_weapon_part = "holding a single sharp weapon with natural grip, exactly two arms, two hands only, five fingers per hand" if has_weapon else (pose_guidance if has_characters else "")

        prompt_parts = [
            style_core,
            real_framing_part,
            real_face_part,
            real_weapon_part,
            visual_core,
            "natural golden hour lighting, cinematic rim light, authentic optical bokeh, 8k UHD National Geographic portrait",
        ]
    elif is_horror:
        horror_lighting = "chilling moonlight piercing cold shadows, volumetric supernatural mist, eerie amber glow"
        prompt_parts = [
            f"Cinematic atmospheric scene of {visual_core}",
            env_setting,
            human_enhancement,
            preset["prefix"],
            staging,
            framing_tag,
            horror_lighting,
            "dramatic dread, 35mm film photography, 8k",
        ]
    elif is_romance:
        romance_lighting = "warm golden hour lighting, soft sunset bokeh, intimate natural amber glow"
        prompt_parts = [
            f"Cinematic romantic scene of {visual_core}",
            env_setting,
            human_enhancement,
            preset["prefix"],
            staging,
            framing_tag,
            romance_lighting,
            "warm 35mm film photography, emotional depth, 8k",
        ]
    else:
        prompt_parts = [
            f"Cinematic scene of {visual_core}",
            env_setting,
            human_enhancement,
            preset["prefix"],
            staging,
            framing_tag,
            preset["lighting"],
            preset["suffix"],
        ]

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

    # Safely fit within 75 tokens without cutting words in half
    fitted_clauses = []
    current_word_count = 0
    for clause in filtered_clauses:
        clause_words = len(clause.split())
        if current_word_count + clause_words > 75 and fitted_clauses:
            break
        fitted_clauses.append(clause)
        current_word_count += clause_words

    return ", ".join(fitted_clauses)
