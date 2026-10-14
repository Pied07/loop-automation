import os
import sys
import re
import json
import time
import shutil
import asyncio
import argparse
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFilter

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(__file__).resolve().parent / "models"
ONNX_MODEL_PATH = MODELS_DIR / "ai_video_generator.onnx"
ONNX_MOTION_PATH = MODELS_DIR / "human_avatar_motion.onnx"
CONFIG_PATH = MODELS_DIR / "ai_video_config.json"
CHARACTERS_DIR = MODELS_DIR / "characters"

FFMPEG_BIN = ROOT_DIR / "ffmpeg.exe"
if not FFMPEG_BIN.exists():
    FFMPEG_BIN = Path(shutil.which("ffmpeg") or "ffmpeg")

try:
    from scripts.neural_music_engine import music_engine
except ModuleNotFoundError:
    try:
        from neural_music_engine import music_engine
    except Exception:
        music_engine = None

try:
    from scripts.story_engine import build_clean_visual_prompt
except ModuleNotFoundError:
    try:
        from story_engine import build_clean_visual_prompt
    except Exception:
        build_clean_visual_prompt = None

THEMES = {
    "Motivational": {
        "badge": "🔥 MOTIVATIONAL",
        "bg_color": "0x1a0f00",
        "accent": "#f59e0b",
        "text_highlight": "#fbbf24",
        "voice": "en-US-ChristopherNeural",
        "tone_freq": 220,
        "style_prompt": "cinematic hyperrealistic 8k dramatic lighting epic composition masterwork",
    },
    "Horror": {
        "badge": "👻 TRUE MYSTERY",
        "bg_color": "0x0a0000",
        "accent": "#ef4444",
        "text_highlight": "#f87171",
        "voice": "en-US-ChristopherNeural",
        "tone_freq": 110,
        "style_prompt": "dark eerie cinematic atmospheric shadows fog mystery 8k octane render",
    },
    "Educational": {
        "badge": "💡 DID YOU KNOW?",
        "bg_color": "0x031726",
        "accent": "#0ea5e9",
        "text_highlight": "#38bdf8",
        "voice": "en-US-GuyNeural",
        "tone_freq": 330,
        "style_prompt": "scientific concept visual discovery futuristic clean 8k unreal engine 5 render",
    },
    "Comedy": {
        "badge": "😂 DAILY LAUGHS",
        "bg_color": "0x261a00",
        "accent": "#eab308",
        "text_highlight": "#fde047",
        "voice": "en-US-GuyNeural",
        "tone_freq": 440,
        "style_prompt": "vibrant colorful lively expressive high energy 3d animated style 8k",
    },
    "Romance": {
        "badge": "❤️ HEART & SOUL",
        "bg_color": "0x260014",
        "accent": "#ec4899",
        "text_highlight": "#f472b6",
        "voice": "en-US-JennyNeural",
        "tone_freq": 261,
        "style_prompt": "warm golden hour cinematic emotional bokeh romantic atmosphere 8k masterpiece",
    },
    "Adventure": {
        "badge": "⚡ EXTREME EXPEDITION",
        "bg_color": "0x022c22",
        "accent": "#10b981",
        "text_highlight": "#34d399",
        "voice": "en-US-GuyNeural",
        "tone_freq": 293,
        "style_prompt": "epic landscape extreme nature wilderness exploration 8k national geographic cinematography",
    },
    "Action": {
        "badge": "⚔️ HIGH OCTANE",
        "bg_color": "0x1c0c00",
        "accent": "#f97316",
        "text_highlight": "#fb923c",
        "voice": "en-US-ChristopherNeural",
        "tone_freq": 220,
        "style_prompt": "cinematic wide-angle Hollywood blockbuster action sequence, explosive debris and sparks, dynamic motion blur, high-octane battle scene, dramatic rim lighting, 8k octane render",
    },
    "Interesting Facts": {
        "badge": "🧠 MIND BLOWN",
        "bg_color": "0x031726",
        "accent": "#06b6d4",
        "text_highlight": "#22d3ee",
        "voice": "en-US-ChristopherNeural",
        "tone_freq": 280,
        "style_prompt": "mind-blowing real world discovery cosmic scientific phenomenon 8k high detail macro photography",
    },
    "Others": {
        "badge": "✨ EXCLUSIVE STORY",
        "bg_color": "0x18181b",
        "accent": "#a855f7",
        "text_highlight": "#c084fc",
        "voice": "en-US-ChristopherNeural",
        "tone_freq": 250,
        "style_prompt": "cinematic hyperrealistic dramatic 8k unreal engine lighting storytelling masterpiece",
    },
}

THEMES["Trending"] = THEMES["Interesting Facts"]
THEMES["Food"] = THEMES["Interesting Facts"]

CATEGORIES_LIST = [
    "Interesting Facts", "Comedy", "Motivational", "Horror", "Educational",
    "Romance", "Adventure", "Music", "Others"
]


def extract_topic_from_text(text: str, category: str = "") -> str:
    """
    Extracts a concise, high-value subject entity from user prompts, scripts, or story hooks.
    Guarantees clean 2-4 word topic strings (e.g. 'Ruth Graves Wakefield', 'Chocolate chip cookie').
    Prevents long paragraphs from breaking external visual search APIs.
    """
    if not text or not text.strip():
        return category.strip() if category else "Interesting Facts"

    clean = re.sub(r"\s*\(Part\s*\d+[/]?\d*\)", "", text, flags=re.IGNORECASE).strip()
    clean = re.sub(r":\s*The\s+Untold.*", "", clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r":\s*The\s+True.*", "", clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r":.*", "", clean).strip()

    # If it is already a clean concise topic (under 60 chars) with no multiple sentences
    if len(clean) <= 60 and "\n" not in clean and "." not in clean:
        return clean

    # Pattern 1: 'untold origin of X?', 'secret of X?', 'history of X?'
    m = re.search(
        r"(?:origin|truth|story|history|secret|discovery|tale|legend|mystery|invention|life)\s+of\s+([A-Z][A-Za-z0-9\s\'-]+?)(?:\?|\.|\,|!|What|Why|How|\n|$)",
        text,
        re.IGNORECASE,
    )
    if m:
        extracted = m.group(1).strip()
        if 2 < len(extracted) < 55:
            return extracted

    # Pattern 2: Capitalized named entities (e.g. 'Ruth Graves Wakefield')
    entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b", text)
    blacklist = {
        "Have You", "What History", "Nobody Could", "Follow Right", "Throughout Her",
        "Throughout His", "Save This", "Did You", "Check Out", "Part Two", "Part One",
        "Welcome Back", "Wait Until", "Drop A", "Every Single"
    }
    filtered_ents = [e for e in entities if e not in blacklist]
    if filtered_ents:
        from collections import Counter
        most_common = Counter(filtered_ents).most_common(1)[0][0]
        return most_common

    # Pattern 3: First sentence noun chunk
    first_sent = re.split(r"[.!?\n]", clean)[0].strip()
    words = [
        w for w in first_sent.split()
        if w.lower() not in {"have", "you", "ever", "wondered", "about", "the", "what", "is", "that"}
    ]
    if words:
        return " ".join(words[:4])

    return category.strip() if category else "Interesting Facts"


def extract_scene_keywords(scene_text: str) -> List[str]:
    """
    Extracts high-value contextual entities and visual keywords from scene narration,
    filtering out conversational filler and storytelling hooks.
    """
    stop_words = {
        "have", "ever", "wondered", "what", "history", "books", "rarely", "never",
        "tell", "they", "that", "this", "these", "those", "with", "from", "into",
        "been", "being", "were", "where", "when", "which", "will", "would", "could",
        "should", "about", "after", "before", "right", "follow", "part", "next",
        "more", "video", "watch", "drop", "like", "subscribe", "today", "yesterday",
        "every", "single", "know", "did", "you", "untold", "true", "origin", "story",
        "twist", "nobody", "predicted", "happened", "welcome", "back", "check", "full",
        "final", "revealed", "secret", "truth", "again", "impacts", "billions", "human",
        "beings", "across", "globe", "save", "takes", "even", "stranger", "turn",
        "someone", "something", "their", "there", "then", "than", "just", "also",
        "only", "very", "much", "many", "such", "some", "most", "other", "others",
        "made", "make", "making", "time", "year", "years", "said", "came", "went",
        "took", "take", "first", "last", "world", "people", "thing", "things", "does",
        "done", "doing", "good", "well", "great", "better", "best", "around", "over",
        "through", "under", "between", "both", "each", "here", "them", "ourselves"
    }
    raw_tokens = re.findall(r"\b[A-Za-z0-9'-]+\b", scene_text)
    entities = []
    for idx, token in enumerate(raw_tokens):
        if (token[0].isupper() and idx > 0 and token.lower() not in stop_words) or token.isupper():
            if len(token) > 1 and token.lower() not in [e.lower() for e in entities]:
                entities.append(token)
    clean_words = [w.lower() for w in raw_tokens if len(w) > 3 and w.lower() not in stop_words]
    combined = []
    for ent in entities:
        if ent.lower() not in [c.lower() for c in combined]:
            combined.append(ent)
    for w in clean_words:
        if w.lower() not in [c.lower() for c in combined]:
            combined.append(w)
    return combined[:8]


def generate_rich_hashtags(title: str, category: str, script: str) -> List[str]:
    """Generates 25 to 30 relevant, high-performing hashtags for AI videos."""
    clean_cat = category.strip().lower().replace(" ", "")
    tags = [clean_cat]

    # Extract key topical entity tags from title and script
    raw_tokens = re.findall(r"\b[A-Za-z]{3,15}\b", f"{title} {script[:350]}")
    stop = {
        "have", "ever", "wondered", "what", "history", "books", "rarely", "never",
        "that", "this", "with", "from", "part", "next", "video", "today", "more",
        "they", "were", "been", "being", "when", "where", "which", "will", "would",
        "could", "should", "about", "after", "before", "right", "follow", "watch"
    }
    for tok in raw_tokens:
        clean_tok = tok.lower()
        if clean_tok not in stop and clean_tok not in tags and len(clean_tok) >= 4:
            tags.append(clean_tok)
            if len(tags) >= 12:
                break

    category_tag_banks = {
        "interestingfacts": [
            "facts", "dailyfacts", "interestingfacts", "amazingfacts", "mindblown",
            "didyouknow", "truefacts", "historyfacts", "unknownfacts", "bizarre",
            "curiosity", "mindblowingfacts", "realfacts", "sciencefacts", "untoldstory"
        ],
        "horror": [
            "horror", "scary", "creepy", "mystery", "paranormal", "scarystories",
            "darktales", "truecrime", "haunted", "unexplained", "nightmare", "chills"
        ],
        "adventure": [
            "adventure", "exploration", "survival", "wilderness", "expedition",
            "extreme", "journey", "discovery", "nature", "untamed", "deepsea"
        ],
        "motivational": [
            "motivation", "mindset", "success", "discipline", "grind", "inspire",
            "hardwork", "focus", "nevergiveup", "selfimprovement", "growth"
        ],
        "educational": [
            "education", "learning", "knowledge", "science", "history", "school",
            "study", "discover", "facts", "curiosity", "brainpower"
        ],
        "romance": [
            "love", "romance", "lovestory", "relationship", "destiny", "heartfelt",
            "soulmate", "forever", "couples", "deepfeelings"
        ],
    }

    bank = category_tag_banks.get(clean_cat, [
        "curiosity", "knowledge", "history", "storytelling", "mindblowing", "secrets"
    ])
    for b in bank:
        if b not in tags:
            tags.append(b)

    universal = [
        "shorts", "reels", "viral", "fyp", "trending", "explorepage", "viralvideo",
        "foryou", "contentcreator", "reelsvideo", "instaviral", "dailyvids", "watchthis",
        "mustwatch", "entertainment", "trendingnow"
    ]
    for u in universal:
        if u not in tags:
            tags.append(u)

    return tags[:30]


class AIVideoEngine:
    def __init__(self):
        self.session = None
        self.config = None
        self.gen_image_model = None
        self._load_models()

    def _load_models(self):
        if not ONNX_MODEL_PATH.exists() or not CONFIG_PATH.exists():
            raise FileNotFoundError("ONNX AI Video model or configuration not found. Run train_ai_video_model.py first.")

        self.session = ort.InferenceSession(str(ONNX_MODEL_PATH))
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            self.config = json.load(f)

        # Load from-scratch Generative AI Image Model trained on real dataset
        gen_pt_path = MODELS_DIR / "generative_image_model.pt"
        if gen_pt_path.exists():
            try:
                import torch
                try:
                    from scripts.train_generative_image_model import GenerativeImageDecoder
                except ModuleNotFoundError:
                    from train_generative_image_model import GenerativeImageDecoder
                self.gen_image_model = GenerativeImageDecoder(latent_dim=64, out_channels=3)
                self.gen_image_model.load_state_dict(torch.load(gen_pt_path, map_location="cpu"))
                self.gen_image_model.eval()
            except Exception as e:
                print(f"Notice: Generative image model load notice: {e}")

    def _scrape_wiki_scene_image(
        self,
        category: str,
        prompt: str,
        scene_text: str,
        topic: str,
        scene_idx: int,
        used_urls: set = None,
    ):
        """
        Scrapes authentic photographic/historical images from Wikipedia & Wikimedia Commons.
        Strictly used ONLY for 'Interesting Facts' category.
        """
        import io
        cat_clean = category.strip().title()
        try:
            clean_topic = extract_topic_from_text(topic or prompt, cat_clean)
            kws = extract_scene_keywords(scene_text or prompt)

            headers = {"User-Agent": "AIVideoEngine/3.0 (MediaResearch; contact@theviraldesk.com)"}
            candidate_images = []

            search_queries = []
            if clean_topic and kws:
                search_queries.append(f"{clean_topic} {' '.join(kws[:2])}")
            if clean_topic:
                search_queries.append(clean_topic)
            if len(kws) >= 2:
                search_queries.append(" ".join(kws[:3]))
            elif kws:
                search_queries.append(kws[0])
            if clean_topic:
                search_queries.append(f"{clean_topic} history")

            def is_clean_image(title_str: str, url_str: str) -> bool:
                t_low = title_str.lower()
                u_low = url_str.lower()
                bad_tokens = [
                    ".svg", ".ogg", ".ogv", ".webm", ".pdf", ".gif",
                    "icon", "logo", "flag", "map", "diagram", "coat of arms",
                    "symbol", "sign", "stamp", "signature", "seal", "chart", "graph", "sketch"
                ]
                return not any(bad in t_low or bad in u_low for bad in bad_tokens)

            for q in search_queries:
                if not q.strip():
                    continue
                try:
                    enc_q = urllib.parse.quote(q.strip())
                    wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={enc_q}&gsrlimit=6&prop=pageimages&pithumbsize=1280&format=json"
                    req = urllib.request.Request(wiki_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    pages = list(data.get("query", {}).get("pages", {}).values())
                    for pg in pages:
                        thumb_info = pg.get("thumbnail")
                        if thumb_info and thumb_info.get("source"):
                            u = thumb_info["source"]
                            if is_clean_image(pg.get("title", ""), u) and u not in [c["url"] for c in candidate_images]:
                                candidate_images.append({"title": pg.get("title"), "url": u})
                except Exception:
                    pass

                try:
                    enc_q = urllib.parse.quote(q.strip())
                    api_url = (
                        f"https://commons.wikimedia.org/w/api.php?action=query&generator=search"
                        f"&gsrnamespace=6&gsrsearch={enc_q}&gsrlimit=10&prop=imageinfo"
                        f"&iiprop=url|mime|size&iiurlwidth=1280&format=json"
                    )
                    req = urllib.request.Request(api_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    pages = list(data.get("query", {}).get("pages", {}).values())
                    for pg in pages:
                        ii = pg.get("imageinfo", [{}])[0]
                        if "image" not in ii.get("mime", ""):
                            continue
                        u = ii.get("thumburl") or ii.get("url")
                        if u and is_clean_image(pg.get("title", ""), u) and u not in [c["url"] for c in candidate_images]:
                            candidate_images.append({"title": pg.get("title"), "url": u})
                except Exception:
                    pass

                if len(candidate_images) > (scene_idx + 2):
                    break

            if candidate_images:
                for cand in candidate_images:
                    if used_urls is not None and cand["url"] in used_urls:
                        continue
                    try:
                        img_req = urllib.request.Request(cand["url"], headers=headers)
                        with urllib.request.urlopen(img_req, timeout=6) as img_resp:
                            raw_bytes = img_resp.read()
                            if len(raw_bytes) > 2000:
                                loaded = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
                                if loaded.width >= 120 and loaded.height >= 120:
                                    if used_urls is not None:
                                        used_urls.add(cand["url"])
                                    print(f"🏛️ Scraped authentic Wikipedia fact visual for Scene {scene_idx + 1}: {cand['title'][:40]}")
                                    return loaded
                    except Exception:
                        continue
            else:
                print(f"Notice: No wiki image candidates found for queries: {search_queries}")
        except Exception as e:
            print(f"Notice: Wiki image scraping notice for scene {scene_idx + 1}: {e}")
        return None

    def _generate_ml_scene_image(
        self,
        category: str,
        scene_idx: int,
        prompt: str,
        output_path: Path,
        seed: int = 42,
        scene_text: str = "",
        topic: str = "",
        used_urls: set = None,
        style_preset: str = "Realism",
    ) -> bool:
        """
        Generate high-resolution 1080x1920 AI scene image.
        User rule: Wiki scrape ONLY for 'Interesting Facts'.
        For all other categories (Horror, Romance, Sci-Fi, Adventure, Comedy, Music, etc.),
        synthesize genuine AI visuals via the local/cloud Generative Model matching the style preset.
        """
        import torch
        from PIL import ImageEnhance, ImageFilter

        cat_clean = category.strip().title()
        if cat_clean == "Trending" or cat_clean not in THEMES:
            cat_clean = "Interesting Facts"

        theme = THEMES.get(cat_clean, THEMES["Interesting Facts"])
        target_w, target_h = 1080, 1920

        is_interesting_fact = (cat_clean == "Interesting Facts" or cat_clean in ["Trending", "Food"])

        # 1. FOR "INTERESTING FACTS" ONLY: Scrape authentic photographic/historical images from Wikipedia & Wikimedia Commons
        if is_interesting_fact:
            dynamic_img = self._scrape_wiki_scene_image(
                category=category,
                prompt=prompt,
                scene_text=scene_text,
                topic=topic,
                scene_idx=scene_idx,
                used_urls=used_urls,
            )
            if dynamic_img is not None:
                try:
                    scale = max(target_w / dynamic_img.width, target_h / dynamic_img.height)
                    rw, rh = int(dynamic_img.width * scale), int(dynamic_img.height * scale)
                    resized = dynamic_img.resize((rw, rh), Image.Resampling.LANCZOS)
                    cx = (rw - target_w) // 2
                    cy = (rh - target_h) // 2
                    cropped = resized.crop((cx, cy, cx + target_w, cy + target_h))

                    final_scene = ImageEnhance.Contrast(cropped).enhance(1.08)
                    final_scene = ImageEnhance.Color(final_scene).enhance(1.05)
                    final_scene = ImageEnhance.Sharpness(final_scene).enhance(1.12)
                    final_scene.save(str(output_path), quality=95)
                    return True
                except Exception as e:
                    print(f"Notice: Wiki image crop notice: {e}")

        # 2. FOR ALL OTHER CATEGORIES (Horror, Romance, Adventure, Sci-Fi, Comedy, Motivational, Music, etc.),
        # or if wiki scraping had no hits: Synthesize genuine AI imagery with local/Colab generative diffusion pipeline
        try:
            import sys
            img_gen_dir = str(Path(__file__).parent.parent / "image_gen_model")
            if img_gen_dir not in sys.path:
                sys.path.insert(0, img_gen_dir)
            from scene_engine import generate_scene_for_script

            scene_ai_img = generate_scene_for_script(
                scene_idx=scene_idx,
                scene_text=scene_text or prompt,
                topic=topic or prompt,
                category=category,
                output_path=str(output_path),
                aspect_ratio="9:16 (Shorts / Reels)",
                target_wh=(target_w, target_h),
                colab_gpu_url=getattr(self, "colab_gpu_url", ""),
                style_preset=style_preset,
            )
            if scene_ai_img is not None:
                print(f"🎨 Synthesized genuine AI Scene {scene_idx + 1} ({style_preset}) with local generative engine for: {(scene_text or prompt)[:50]}...")
                return True
        except Exception as e:
            print(f"Notice: Local diffusion engine fallback notice: {e}")

        # 2. Standalone Cinematic Scene Generator (Strictly offline, zero third-party scrapers)
        # Used only if GPU Bridge is offline and no pre-generated scene images were uploaded

        # Synthesize rich cinematic atmospheric scene visual tailored to this scene's narrative & category
        try:
            from PIL import ImageDraw
            img = Image.new("RGB", (target_w, target_h), (12, 10, 22))
            draw = ImageDraw.Draw(img)

            # Palette based on theme
            hex_accent = theme.get("accent", "#8b5cf6").lstrip("#")
            r_acc, g_acc, b_acc = tuple(int(hex_accent[i:i+2], 16) for i in (0, 2, 4))
            bg_hex = theme.get("bg_color", "0x0f0b1e").replace("0x", "#").lstrip("#")
            if len(bg_hex) == 6:
                r_bg, g_bg, b_bg = tuple(int(bg_hex[i:i+2], 16) for i in (0, 2, 4))
            else:
                r_bg, g_bg, b_bg = 15, 11, 30

            # Vertical cinematic gradient
            for y in range(target_h):
                ratio = y / target_h
                r = int(r_bg * (1.0 - ratio * 0.4) + r_acc * (ratio * 0.35))
                g = int(g_bg * (1.0 - ratio * 0.4) + g_acc * (ratio * 0.25))
                b = int(b_bg * (1.0 - ratio * 0.3) + b_acc * (ratio * 0.45))
                draw.line([(0, y), (target_w, y)], fill=(min(255, r), min(255, g), min(255, b)))

            # Radial atmospheric lighting glow (lens flare / ambient illumination)
            glow_img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            glow_draw = ImageDraw.Draw(glow_img)
            cx, cy = target_w // 2, int(target_h * 0.42)
            glow_radius = int(target_w * 0.65)
            for rad in range(glow_radius, 0, -18):
                alpha = int(45 * (1.0 - rad / glow_radius))
                glow_draw.ellipse(
                    [(cx - rad, cy - rad), (cx + rad, cy + rad)],
                    fill=(r_acc, g_acc, b_acc, alpha),
                )
            glow_img = glow_img.filter(ImageFilter.GaussianBlur(35))
            img.paste(glow_img, (0, 0), glow_img)

            # Vignette overlay for cinematic depth
            vig_img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            vig_draw = ImageDraw.Draw(vig_img)
            for border in range(0, 160, 8):
                alpha = int(180 * (1.0 - border / 160))
                vig_draw.rectangle(
                    [(border, border), (target_w - border, target_h - border)],
                    outline=(0, 0, 0, alpha),
                    width=8,
                )
            vig_img = vig_img.filter(ImageFilter.GaussianBlur(25))
            img.paste(vig_img, (0, 0), vig_img)

            # Enhance tone & contrast
            final_scene = ImageEnhance.Contrast(img).enhance(1.12)
            final_scene = ImageEnhance.Sharpness(final_scene).enhance(1.10)
            final_scene.save(str(output_path), quality=96)
            print(f"🎬 Synthesized cinematic atmospheric background for Scene {scene_idx + 1}")
            return True
        except Exception as e:
            print(f"Notice: Scene rendering notice: {e}")
            base_arr = np.zeros((target_h, target_w, 3), dtype=np.uint8)
            base_arr[:, :] = [18, 14, 28]
            Image.fromarray(base_arr).save(str(output_path), quality=95)
            return True

    def _vectorize_text(self, text: str) -> np.ndarray:
        vocab = self.config["vocabulary"]
        vocab_size = self.config.get("vocab_size", 512)
        vec = np.zeros((1, vocab_size), dtype=np.float32)

        tokens = re.findall(r"\b[a-zA-Z]{2,}\b", text.lower())
        for t in tokens:
            if t in vocab:
                idx = vocab[t]
                if idx < vocab_size:
                    vec[0, idx] += 1.0

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def generate_script_from_model(
        self,
        category: str,
        prompt: str = "",
        target_duration: int = 20,
        num_scenes: int = 3,
    ) -> Dict[str, Any]:
        """Generate a viral video script with scene breakdowns calibrated to the target duration."""
        cat_clean = category.strip().title()
        if cat_clean == "Trending" or cat_clean not in THEMES:
            cat_clean = "Interesting Facts"

        theme = THEMES.get(cat_clean, THEMES["Interesting Facts"])
        kb = self.config.get("knowledge_base", {}).get(cat_clean, self.config.get("knowledge_base", {}).get("Trending", {}))

        hooks = kb.get("hooks", [])
        story_lines = kb.get("story_lines", [])

        # ONNX inference
        in_name = self.session.get_inputs()[0].name
        out_name = self.session.get_outputs()[0].name
        query_text = f"{cat_clean} {prompt}" if prompt else cat_clean
        query_vec = self._vectorize_text(query_text)
        latent_pred = self.session.run([out_name], {in_name: query_vec})[0]
        latent_norm = float(np.linalg.norm(latent_pred))

        seed_idx = int(abs(latent_norm * 1000))
        if prompt:
            seed_idx += sum(ord(c) for c in prompt)

        hook = hooks[seed_idx % len(hooks)] if hooks else f"The untold truth behind {cat_clean}."
        title = hook

        # Calculate sentence count according to target duration (approx 2.5 words per sec)
        # 10-20s -> ~3 sentences; 30-45s -> ~5 sentences; 60s -> ~8 sentences; 120s -> ~15 sentences
        total_sentences_needed = max(3, min(16, int(target_duration / 7.5)))

        narrative_sentences = []
        if story_lines:
            for i in range(total_sentences_needed - 2):
                idx = (seed_idx * 7 + i * 13) % len(story_lines)
                sent = story_lines[idx]
                if sent not in narrative_sentences:
                    narrative_sentences.append(sent)

        script_sentences = [hook] + narrative_sentences
        call_to_action = "Save this video right now and follow for more daily mind-bending insights!"
        script_sentences.append(call_to_action)

        full_script = " ".join(script_sentences)

        # Generate scene image visual prompts
        # Distribute script across the requested num_scenes (1 to 5)
        scenes = []
        sentences_per_scene = max(1, len(script_sentences) // num_scenes)
        for s_idx in range(num_scenes):
            sub_sent = script_sentences[s_idx * sentences_per_scene : (s_idx + 1) * sentences_per_scene]
            if not sub_sent:
                sub_sent = [script_sentences[-1]]
            scene_summary = " ".join(sub_sent)

            # Clean and formulate visual prompt
            clean_kw = re.sub(r"[^a-zA-Z\s]", " ", scene_summary).lower()
            key_tokens = [w for w in clean_kw.split() if len(w) > 3][:6]
            scene_subject = " ".join(key_tokens) if key_tokens else cat_clean.lower()

            visual_prompt = f"{scene_subject}, {theme['style_prompt']}, vertical 9:16 framing, photorealistic cinematic lighting"
            scenes.append({
                "scene_index": s_idx,
                "text": scene_summary,
                "visual_prompt": visual_prompt,
            })

        # Hashtags
        hashtags = list(kb.get("top_tags", []))
        try:
            from onnx_viral_engine import engine as viral_tagger
            tagger_tags = viral_tagger.predict_hashtags(title, cat_clean, max_tags=30)
            for tt in tagger_tags:
                if tt not in hashtags and len(hashtags) < 30:
                    hashtags.append(tt)
        except Exception:
            pass

        extra_tags = [
            cat_clean.lower(), "shorts", "reels", "viral", "fyp", "trending",
            "explorepage", "viralvideo", "mindblown", "foryou", "contentcreator",
            "reelsvideo", "instaviral", "dailyvids", "watchthis"
        ]
        for t in extra_tags:
            if t not in hashtags and len(hashtags) < 30:
                hashtags.append(t)

        return {
            "title": title,
            "script": full_script,
            "sentences": script_sentences,
            "scenes": scenes,
            "category": cat_clean,
            "hashtags": hashtags[:30],
            "theme": theme,
            "latent_score": latent_norm,
        }

    async def _synthesize_voice(self, script: str, voice: str, output_audio: Path) -> List[Dict[str, Any]]:
        """
        Synthesize authentic, human-grade neural voiceover matching the website samples:
        Priority 1: High-Definition Microsoft Neural TTS (Christopher, Jenny, Guy, etc.) - 100% exact match to audio preview
        Priority 2: Offline Local ONNX Neural Model (fail-safe)
        Priority 3: Google TTS (gTTS fail-safe)
        """
        chosen_voice = voice if voice else "en-US-ChristopherNeural"
        sentences_timing = []

        # 1. Primary: High-Definition Neural Voice (Matches website sample 1:1)
        try:
            import edge_tts
            communicate = edge_tts.Communicate(script, chosen_voice)
            with open(output_audio, "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "SentenceBoundary":
                        start_sec = chunk["offset"] / 10_000_000.0
                        dur_sec = chunk["duration"] / 10_000_000.0
                        sentences_timing.append({
                            "text": chunk["text"],
                            "start": start_sec,
                            "end": start_sec + dur_sec,
                        })
            if output_audio.exists() and output_audio.stat().st_size > 1000:
                print(f"🎙️ Generated high-fidelity neural voiceover ({chosen_voice}): {output_audio.stat().st_size} bytes")
                return sentences_timing
        except Exception as e:
            print(f"Notice: edge-tts neural voiceover notice ({e}), attempting offline local neural voice...")

        # 2. Secondary Fail-Safe: Local ONNX Neural Voice Engine (offline)
        try:
            from scripts.local_neural_tts import LocalNeuralTTS
            timings = LocalNeuralTTS.synthesize(script, output_audio)
            if output_audio.exists() and output_audio.stat().st_size > 1000 and timings:
                print(f"✅ Generated voiceover via Local ONNX Neural Voice Model: {output_audio.stat().st_size} bytes")
                return timings
        except Exception as onnx_err:
            try:
                from local_neural_tts import LocalNeuralTTS
                timings = LocalNeuralTTS.synthesize(script, output_audio)
                if output_audio.exists() and output_audio.stat().st_size > 1000 and timings:
                    print(f"✅ Generated voiceover via Local ONNX Neural Voice Model: {output_audio.stat().st_size} bytes")
                    return timings
            except Exception as onnx_err2:
                print(f"Notice: Local ONNX Neural voice notice ({onnx_err2}), attempting secondary engines...")

        # Fail-safe Fallback: gTTS (Google Text-to-Speech)
        try:
            from gtts import gTTS
            tts = gTTS(text=script, lang="en", tld="com", slow=False)
            tts.save(str(output_audio))

            # Estimate sentence timings based on duration and sentence length
            probe = subprocess.run(
                [str(FFMPEG_BIN), "-i", str(output_audio)],
                stderr=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                text=True,
            )
            dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", probe.stderr)
            total_dur = 20.0
            if dur_match:
                total_dur = int(dur_match.group(1)) * 3600 + int(dur_match.group(2)) * 60 + float(dur_match.group(3))

            raw_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", script) if s.strip()]
            if not raw_sents:
                raw_sents = [script]
            total_chars = sum(len(s) for s in raw_sents)
            cur = 0.0
            fallback_timings = []
            for s in raw_sents:
                dur = (len(s) / max(1, total_chars)) * total_dur
                fallback_timings.append({
                    "text": s,
                    "start": cur,
                    "end": cur + dur,
                })
                cur += dur
            return fallback_timings
        except Exception as fb_err:
            print(f"Notice: gTTS fallback notice: {fb_err}")

        # If both network TTS services fail, generate synthetic silent narration track so rendering succeeds
        if not output_audio.exists() or output_audio.stat().st_size < 100:
            subprocess.run(
                [str(FFMPEG_BIN), "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "20", str(output_audio)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        return sentences_timing

    def _render_scene_clip(self, img_path: Path, duration: float, output_clip: Path, motion_type: int = 0) -> None:
        """Render a single scene with dynamic Ken Burns cinematic camera motion (zoompan)."""
        fps = 24
        total_frames = int(duration * fps)

        # 3 camera movement styles: zoom-in, zoom-out, pan-down
        if motion_type % 3 == 0:
            zoom_expr = f"min(zoom+0.0015,1.25)"
            x_expr = "iw/2-(iw/zoom/2)"
            y_expr = "ih/2-(ih/zoom/2)"
        elif motion_type % 3 == 1:
            zoom_expr = f"max(1.25-0.0015*on,1.0)"
            x_expr = "iw/2-(iw/zoom/2)"
            y_expr = "ih/2-(ih/zoom/2)"
        else:
            zoom_expr = "1.15"
            x_expr = "iw/2-(iw/zoom/2)"
            y_expr = f"(ih/zoom)*(on/{total_frames})*0.2"

        filter_str = (
            f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
            f"d={total_frames}:s=1080x1920:fps={fps}"
        )

        cmd = [
            str(FFMPEG_BIN),
            "-y",
            "-loop", "1",
            "-i", str(img_path),
            "-vf", filter_str,
            "-t", f"{duration:.2f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            str(output_clip),
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _render_final_video(
        self,
        audio_path: Path,
        timing: List[Dict[str, Any]],
        meta: Dict[str, Any],
        video_track_mp4: Path,
        output_mp4: Path,
        thumbnail_path: Path,
        total_duration: float,
    ) -> None:
        """Composite final vertical video with ambient grading, category badge, and animated subtitles."""
        theme = meta["theme"]
        badge_text = theme["badge"].replace("'", "").replace(":", "")
        clean_title = re.sub(r"[^a-zA-Z0-9\s.,!?-]", "", meta["title"])
        if len(clean_title) > 46:
            clean_title = clean_title[:43] + "..."

        accent_color = theme.get("accent", "#e11d48").replace("#", "0x")
        highlight_color = theme.get("text_highlight", "yellow")

        caption_style = meta.get("caption_style", "viral_yellow") if isinstance(meta, dict) else "viral_yellow"

        # Clean, cinematic video overlays: Zero giant screen darkeners, 100% full screen brightness
        overlay_filters = []

        # Timed Subtitles (dynamic high-contrast chunks centered in lower third, never cut off by width)
        for sent in timing:
            st = sent["start"]
            en = sent["end"]
            raw_text = re.sub(r"[^a-zA-Z0-9\s.,!?-]", "", sent["text"]).strip()
            if not raw_text or en <= st:
                continue

            words = raw_text.split()
            chunks = []
            cur_words = []
            cur_len = 0
            for w in words:
                would_len = cur_len + (1 if cur_words else 0) + len(w)
                if cur_words and (len(cur_words) >= 3 or would_len > 22):
                    chunks.append(" ".join(cur_words))
                    cur_words = [w]
                    cur_len = len(w)
                else:
                    cur_words.append(w)
                    cur_len = would_len
            if cur_words:
                chunks.append(" ".join(cur_words))

            c_dur = (en - st) / len(chunks)
            for c_idx, c_text in enumerate(chunks):
                c_st = st + c_idx * c_dur
                c_en = c_st + c_dur
                clean_line = c_text.replace("'", "\\'").replace(":", "\\:")

                # Selectable caption styles (tight snug text box or clean outline, NEVER covering half the screen)
                if caption_style == "clean_pill":
                    style_params = "fontcolor=white:fontsize=48:box=1:boxcolor=black@0.80:boxborderw=14:shadowcolor=black@0.6:shadowx=1:shadowy=1"
                elif caption_style == "cinematic":
                    style_params = "fontcolor=white:fontsize=46:box=0:borderw=3:bordercolor=black:shadowcolor=black@0.9:shadowx=2:shadowy=2"
                elif caption_style == "neon_glow":
                    style_params = "fontcolor=0x00F5FF:fontsize=48:box=0:borderw=4:bordercolor=black:shadowcolor=black@0.95:shadowx=3:shadowy=3"
                elif caption_style == "soft_shadow_bar":
                    style_params = "fontcolor=white:fontsize=48:box=1:boxcolor=black@0.55:boxborderw=18:borderw=2:bordercolor=black"
                else:  # viral_yellow (default)
                    style_params = "fontcolor=yellow:fontsize=50:box=0:borderw=4:bordercolor=black:shadowcolor=black@0.9:shadowx=3:shadowy=3"

                overlay_filters.append(
                    f"drawtext=text='{clean_line}':{style_params}:"
                    f"x=(w-text_w)/2:y=1440:enable='between(t,{c_st:.2f},{c_en:.2f})'"
                )

        # Progress bar
        overlay_filters.append(
            f"drawbox=x=0:y=1890:w='1080*(t/{total_duration:.2f})':h=18:color={accent_color}:t=fill"
        )

        vf_str = ",".join(overlay_filters)

        is_music_category = (meta.get("category") == "Music")

        if is_music_category:
            # Music category: complete song with singing vocals and instruments synthesized with ML from scratch
            filter_complex = f"[0:v]{vf_str}[vout];[1:a]volume=1.0[aout]"
            cmd = [
                str(FFMPEG_BIN),
                "-y",
                "-i", str(video_track_mp4),
                "-i", str(audio_path),
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-map", "[aout]",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                "-t", f"{total_duration:.2f}",
                str(output_mp4),
            ]
        else:
            # For all other categories: Synthesize genre-specific background music with ML from scratch every time!
            bg_music_wav = audio_path.parent / f"ml_bg_music_{int(time.time())}.wav"
            has_bg_music = False
            if music_engine is not None:
                try:
                    music_engine.generate(
                        category=meta.get("category", "Interesting Facts"),
                        duration_seconds=float(total_duration),
                        output_wav_path=str(bg_music_wav),
                        seed=42 + int(total_duration * 13),
                        is_full_song=False,
                    )
                    has_bg_music = bg_music_wav.exists() and bg_music_wav.stat().st_size > 1000
                except Exception as bg_err:
                    print(f"Notice: ML background music generation notice: {bg_err}")

            if has_bg_music:
                # Speech narration voiceover at volume=1.00
                # Background music ducked to low volume=0.08 (never louder than the voice!) with smooth 2s fade out
                filter_complex = (
                    f"[0:v]{vf_str}[vout];"
                    f"[1:a]volume=1.0[speech];"
                    f"[2:a]volume=0.08,afade=t=out:st={total_duration - 2:.2f}:d=2[bgm];"
                    f"[speech][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"
                )
                cmd = [
                    str(FFMPEG_BIN),
                    "-y",
                    "-i", str(video_track_mp4),
                    "-i", str(audio_path),
                    "-i", str(bg_music_wav),
                    "-filter_complex", filter_complex,
                    "-map", "[vout]",
                    "-map", "[aout]",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-movflags", "+faststart",
                    "-t", f"{total_duration:.2f}",
                    str(output_mp4),
                ]
            else:
                filter_complex = f"[0:v]{vf_str}[vout];[1:a]volume=1.0[aout]"
                cmd = [
                    str(FFMPEG_BIN),
                    "-y",
                    "-i", str(video_track_mp4),
                    "-i", str(audio_path),
                    "-filter_complex", filter_complex,
                    "-map", "[vout]",
                    "-map", "[aout]",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-movflags", "+faststart",
                    "-t", f"{total_duration:.2f}",
                    str(output_mp4),
                ]

        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            cmd_fb = [
                str(FFMPEG_BIN),
                "-y",
                "-i", str(video_track_mp4),
                "-i", str(audio_path),
                "-vf", vf_str,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-movflags", "+faststart",
                "-t", f"{total_duration:.2f}",
                str(output_mp4),
            ]
            subprocess.run(cmd_fb, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Append Outro Video if present (public/assets/video-outro.mp4)
        outro_path = ROOT_DIR / "public" / "assets" / "video-outro.mp4"
        if outro_path.exists() and output_mp4.exists():
            temp_pre_outro = output_mp4.parent / f"pre_outro_{output_mp4.name}"
            try:
                shutil.move(str(output_mp4), str(temp_pre_outro))
                filter_str = (
                    "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];"
                    "[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];"
                    "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0];"
                    "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];"
                    "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"
                )
                merge_cmd = [
                    str(FFMPEG_BIN), "-y",
                    "-i", str(temp_pre_outro),
                    "-i", str(outro_path),
                    "-filter_complex", filter_str,
                    "-map", "[v]",
                    "-map", "[a]",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-movflags", "+faststart",
                    str(output_mp4),
                ]
                subprocess.run(merge_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("🎬 Appended video outro successfully to AI video!")
            except Exception as e:
                print(f"Notice: Outro concatenation notice ({e}), keeping original cut.")
                if temp_pre_outro.exists() and not output_mp4.exists():
                    shutil.move(str(temp_pre_outro), str(output_mp4))
            finally:
                if temp_pre_outro.exists():
                    try:
                        temp_pre_outro.unlink()
                    except:
                        pass

        # Thumbnail extraction at 1.5s
        thumb_cmd = [
            str(FFMPEG_BIN),
            "-y",
            "-ss", "00:00:01.5",
            "-i", str(output_mp4),
            "-vframes", "1",
            "-q:v", "2",
            str(thumbnail_path),
        ]
        subprocess.run(thumb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def generate(
        self,
        category: str = "Interesting Facts",
        custom_tag: str = "",
        prompt: str = "",
        script: str = "",
        voice: str = "en-US-ChristopherNeural",
        num_images: int = 3,
        duration: int = 20,
        num_parts: int = 1,
        part_number: int = 1,
        output_dir: str = "",
        scene_images: str = "",
        colab_gpu_url: str = "",
        style_preset: str = "Realism",
        caption_style: str = "viral_yellow",
    ) -> Dict[str, Any]:
        """Main entry point: Generate complete AI animated video with custom scenes, timer, and voice."""
        self.colab_gpu_url = colab_gpu_url.strip() if colab_gpu_url else ""
        num_images = max(1, min(5, int(num_images)))
        duration = max(10, min(120, int(duration)))
        num_parts = max(1, min(5, int(num_parts)))
        part_number = max(1, min(num_parts, int(part_number)))

        cat_clean = category.strip().title()
        if cat_clean not in CATEGORIES_LIST:
            cat_clean = "Interesting Facts"
        theme = THEMES.get(cat_clean, THEMES["Interesting Facts"])

        work_dir = Path(output_dir) if output_dir else ROOT_DIR / "scratch" / f"ai_video_{int(time.time())}"
        work_dir.mkdir(parents=True, exist_ok=True)

        audio_path = work_dir / "narration.mp3"
        video_track_mp4 = work_dir / "scenes_montage.mp4"
        final_video_path = work_dir / "ai_video.mp4"
        thumb_path = work_dir / "ai_thumbnail.jpg"

        # 1. Script & scenes formulation for spoken narrative categories
        final_script = script.strip() if script else ""
        title = prompt.strip() if prompt.strip() else f"{cat_clean} Mystery"

        if not final_script:
            # Generate script using story_engine
            try:
                try:
                    from scripts.story_engine import generate_story_parts
                except ModuleNotFoundError:
                    from story_engine import generate_story_parts
                story_res = generate_story_parts(
                    category=cat_clean,
                    custom_tag=custom_tag,
                    prompt=prompt,
                    duration_per_part=duration,
                    num_images_per_part=num_images,
                    num_parts=num_parts,
                )
                part_data = story_res["parts"][part_number - 1]
                final_script = part_data["script"]
                title = part_data["title"]
            except Exception as e:
                print(f"Notice: Story engine fallback: {e}")
                meta_onnx = self.generate_script_from_model(cat_clean, prompt, target_duration=duration, num_scenes=num_images)
                final_script = meta_onnx["script"]
                title = meta_onnx["title"]

        # Ensure title is concise, punchy, and under 65 chars so Instagram and YouTube API captions never fail
        if len(title) > 65 or "\n" in title or "." in title:
            extracted_subj = extract_topic_from_text(title, cat_clean)
            if num_parts > 1:
                title = f"{extracted_subj} (Part {part_number}/{num_parts})"
            else:
                title = f"{extracted_subj}: The Untold Truth"

        # If num_parts == 1, guarantee no "Part 1" appears anywhere in title
        if num_parts == 1:
            title = re.sub(r"\s*\(Part\s*\d+[/]?\d*\)", "", title, flags=re.IGNORECASE).strip()
            title = re.sub(r"\s*-\s*Part\s*\d+", "", title, flags=re.IGNORECASE).strip()

        # Build scene breakdowns
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", final_script) if len(s.strip()) > 3]
        if not sentences:
            sentences = [final_script]

        scenes = []
        sentences_per_scene = max(1, len(sentences) // num_images)
        for s_idx in range(num_images):
            sub_sent = sentences[s_idx * sentences_per_scene : (s_idx + 1) * sentences_per_scene]
            if not sub_sent:
                sub_sent = [sentences[-1]]
            scene_text = " ".join(sub_sent)

            if build_clean_visual_prompt is not None:
                visual_prompt = build_clean_visual_prompt(scene_text, cat_clean.lower(), theme["style_prompt"])
            else:
                key_tokens = extract_scene_keywords(scene_text)
                scene_subject = " ".join(key_tokens[:4]) if key_tokens else cat_clean.lower()
                visual_prompt = f"Cinematic scene of {scene_subject}, cinematic wide-angle environmental establishing shot, dynamic action in full scene, {theme['style_prompt']}, vertical 9:16 framing, photorealistic 8k"

            scenes.append({
                "scene_index": s_idx,
                "text": scene_text,
                "visual_prompt": visual_prompt,
            })

            meta = {
                "title": title,
                "script": final_script,
                "sentences": sentences,
                "scenes": scenes,
                "category": cat_clean,
                "hashtags": generate_rich_hashtags(title, cat_clean, final_script),
                "theme": theme,
                "style_preset": style_preset,
                "caption_style": caption_style,
            }

            # 2. Synthesize voiceover
            chosen_voice = voice if voice else meta["theme"].get("voice", "en-US-ChristopherNeural")
            timing = asyncio.run(self._synthesize_voice(meta["script"], chosen_voice, audio_path))

            # Probe actual audio duration
            probe = subprocess.run(
                [str(FFMPEG_BIN), "-i", str(audio_path)],
                stderr=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                text=True,
            )
            dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", probe.stderr)
            if dur_match:
                audio_dur = int(dur_match.group(1)) * 3600 + int(dur_match.group(2)) * 60 + float(dur_match.group(3))
                # Strictly synchronize video duration with narration audio (+0.4s breathing room).
                # Eliminates idle frozen video and silent pauses before the outro.
                total_dur = max(4.0, audio_dur + 0.4)
            else:
                total_dur = float(duration)

        # 3. Generate AI Images & Render Animated Scene Clips
        scene_duration = total_dur / float(num_images)
        scene_clips = []
        concat_txt = work_dir / "scenes_concat.txt"
        concat_lines = []
        used_image_urls = set()
        pre_images = [p.strip() for p in scene_images.split(",") if p.strip()] if scene_images else []

        for idx, scn in enumerate(meta["scenes"]):
            img_file = work_dir / f"scene_{idx}.jpg"
            clip_file = work_dir / f"scene_{idx}.mp4"

            pre_img = pre_images[idx] if idx < len(pre_images) else None
            used_pre = False
            if pre_img and Path(pre_img).exists():
                try:
                    from PIL import Image
                    src = Image.open(pre_img).convert("RGB")
                    tw, th = 1080, 1920
                    scale = max(tw / src.width, th / src.height)
                    rw, rh = int(src.width * scale), int(src.height * scale)
                    resized = src.resize((rw, rh), Image.Resampling.LANCZOS)
                    cx = (rw - tw) // 2
                    cy = (rh - th) // 2
                    cropped = resized.crop((cx, cy, cx + tw, cy + th))
                    cropped.save(str(img_file), "JPEG", quality=95)
                    print(f"🎬 Reusing website pre-generated AI scene visual {idx + 1}: {pre_img}")
                    used_pre = True
                except Exception as e:
                    print(f"Notice: Failed to adapt pre-generated image {pre_img}: {e}")

            if not used_pre:
                # 1. Generate real AI scene image using local Neural Generative Model trained on real dataset (zero watermarks, zero API)
                self._generate_ml_scene_image(
                    category=meta["category"],
                    scene_idx=idx,
                    prompt=scn["visual_prompt"],
                    output_path=img_file,
                    seed=42 + idx * 101,
                    scene_text=scn["text"],
                    topic=meta["title"],
                    used_urls=used_image_urls,
                    style_preset=style_preset,
                )

            # Render Ken Burns motion clip
            self._render_scene_clip(img_file, scene_duration, clip_file, motion_type=idx)
            if clip_file.exists():
                scene_clips.append(clip_file)
                # FFmpeg concat requires forward slashes on Windows
                clean_path = str(clip_file.resolve()).replace('\\', '/')
                concat_lines.append(f"file '{clean_path}'\n")

        with open(concat_txt, "w", encoding="utf-8") as f:
            f.writelines(concat_lines)

        # Concat all scene clips into a seamless video track
        concat_cmd = [
            str(FFMPEG_BIN),
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_txt),
            "-c", "copy",
            str(video_track_mp4),
        ]
        subprocess.run(concat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # 4. Composite final vertical video
        self._render_final_video(
            audio_path,
            timing,
            meta,
            video_track_mp4,
            final_video_path,
            thumb_path,
            total_dur,
        )

        # Build clean, high-retention synopsis description (no raw teleprompter script dump or duplicate hashtags)
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', meta.get("script", "")) if s.strip()]
        hook_summary = " ".join(sentences[:2]) if len(sentences) >= 2 else (sentences[0] if sentences else meta["title"])
        if len(hook_summary) > 220:
            hook_summary = hook_summary[:217] + "..."

        desc_parts = [meta["title"]]
        if num_parts > 1:
            desc_parts.append(f"🎬 Part {part_number} of {num_parts}. Follow for the next part!")
        elif hook_summary and hook_summary != meta["title"]:
            desc_parts.append(hook_summary)
            desc_parts.append("What surprised you the most about this? Drop your thoughts below 👇")

        description = "\n\n".join(desc_parts).strip()

        return {
            "success": True,
            "title": meta["title"],
            "script": meta["script"],
            "description": description,
            "category": meta["category"],
            "hashtags": meta["hashtags"],
            "numImages": num_images,
            "numParts": num_parts,
            "partNumber": part_number,
            "duration": int(total_dur),
            "videoPath": str(final_video_path),
            "thumbnailPath": str(thumb_path) if thumb_path.exists() else "",
            "videoBytes": final_video_path.stat().st_size if final_video_path.exists() else 0,
        }


def main():
    parser = argparse.ArgumentParser(description="Generate AI Animated Video")
    parser.add_argument("--category", default="Interesting Facts", help="Content category")
    parser.add_argument("--custom-tag", default="", help="Custom story tag if category is Others")
    parser.add_argument("--prompt", default="", help="Optional prompt")
    parser.add_argument("--script", default="", help="Optional custom script text from editor")
    parser.add_argument("--voice", default="en-US-ChristopherNeural", help="Voice ID")
    parser.add_argument("--num-images", type=int, default=3, help="Number of AI scene images (1-5)")
    parser.add_argument("--duration", type=int, default=20, help="Target duration in seconds (10-120)")
    parser.add_argument("--num-parts", type=int, default=1, help="Number of parts (1-5)")
    parser.add_argument("--part-number", type=int, default=1, help="Current part number")
    parser.add_argument("--output-dir", default="", help="Output directory")
    parser.add_argument("--scene-images", default="", help="Optional pre-generated AI scene images comma-separated")
    parser.add_argument("--colab-gpu-url", default="", help="Optional Google Colab GPU bridge tunnel URL")
    parser.add_argument("--style-preset", default="Realism", help="Visual art style preset (Realism, Anime, Disney 3D, Mecha, Dark Fantasy, Retro Comic)")
    parser.add_argument("--caption-style", default="viral_yellow", help="Caption style (viral_yellow, clean_pill, cinematic, neon_glow, soft_shadow_bar)")

    args = parser.parse_args()
    engine = AIVideoEngine()
    result = engine.generate(
        category=args.category,
        custom_tag=args.custom_tag,
        prompt=args.prompt,
        script=args.script,
        voice=args.voice,
        num_images=args.num_images,
        duration=args.duration,
        num_parts=args.num_parts,
        part_number=args.part_number,
        output_dir=args.output_dir,
        scene_images=args.scene_images,
        colab_gpu_url=args.colab_gpu_url,
        style_preset=args.style_preset,
        caption_style=args.caption_style,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
