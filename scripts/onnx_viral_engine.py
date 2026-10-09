import re
import json
import time
from pathlib import Path
from typing import List, Dict, Any

try:
    import numpy as np
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

MODELS_DIR = Path(__file__).resolve().parent / "models"
ONNX_MODEL_PATH = MODELS_DIR / "viral_tagger.onnx"
CONFIG_PATH = MODELS_DIR / "viral_nlp_config.json"

# Generic noise words & individual channel names to filter out completely
BLACKLIST_TAGS = {
    "this", "that", "clip", "video", "taking", "over", "part", "shorts", "viral", "foryou",
    "trending", "reels", "fyp", "the", "and", "with", "from", "your", "what", "how", "when",
    "why", "who", "all", "are", "get", "got", "can", "new", "more", "into", "just", "day",
    "sssniperwolf", "cleetusmcfarland", "cleetus", "baldeaglemachine", "resleeved427", "sptyhigh",
    "spstsoccer", "pewdiepie", "mrbeast", "ninja", "shroud", "tseries", "vlog", "vlogs",
}

CATEGORY_EXCLUSIONS = {
    "Romance": {
        "funny", "comedy", "comedian", "prank", "diy", "review", "nba", "basketball",
        "football", "gaming", "fortnite", "news", "howto", "reaction", "talkshow",
        "tech", "tutorial", "science", "business", "politics", "recipe", "cooking",
        "fitness", "workout", "gadget", "auto", "cars", "unboxing", "challenge",
    },
    "Horror": {
        "funny", "comedy", "prank", "romance", "lovequotes", "diy", "review",
        "recipe", "cooking", "makeup", "beauty", "nba", "gaming", "fortnite",
    },
    "Motivational": {
        "funny", "comedy", "prank", "diy", "scary", "horror", "gaming",
        "recipe", "makeup", "gossip",
    },
    "Educational": {
        "prank", "funny", "romance", "horror", "gaming", "comedy", "gossip",
    },
    "Food": {
        "gaming", "horror", "sports", "nba", "football", "romance", "politics", "news",
    },
    "Sports": {
        "romance", "horror", "cooking", "recipe", "food", "makeup", "prank",
    },
}

CATEGORY_VIRAL_BANK = {
    "Romance": ["lovequotes", "relationshipgoals", "heartfelt", "emotionalmoments", "wholesomelove", "romanticvibes", "soulmate", "truelove", "couplegoals", "feelings"],
    "Motivational": ["mindsetmatters", "discipline", "successquotes", "hustlehard", "nevergiveup", "growthmindset", "selfdevelopment", "dailyinspiration", "grindset", "motivation"],
    "Comedy": ["comedycentral", "funnyvideos", "trynottolaugh", "humor", "standup", "funnymoments", "hilarious", "laughoutloud", "memes", "jokes"],
    "Horror": ["scarystories", "creepyfacts", "paranormal", "horrorstories", "spookyseason", "unexplained", "mystery", "chilling", "ghoststories"],
    "Educational": ["didyouknow", "sciencefacts", "curiosity", "mindblowingfacts", "learnsomethingnew", "interestingfacts", "historybuff", "education", "knowledge"],
    "Adventure": ["adventurous", "wanderlust", "naturelovers", "exploremore", "wildlifephotography", "earthoutdoors", "thrillseeker", "travelgram", "nature"],
    "Music": ["viralmusic", "trendingaudio", "beatdrop", "banger", "musiciansoftiktok", "livemusic", "soundtrack", "goodvibes", "musiclover"],
    "Food": ["foodiegram", "streetfood", "deliciousfood", "easyrecipe", "foodlovers", "chefskills", "mouthwatering", "tasty", "yummy"],
    "Sports": ["sportsmoments", "highlightreel", "athlete", "championsleague", "gamewinner", "insaneplay", "buzzerbeater", "sports", "football"],
    "Gaming": ["gamingmoments", "clutchplay", "gameplayhighlight", "epicgamer", "gamercommunity", "streamerclips", "videogames", "gamer"],
    "Trending": ["viralvideo", "trendingnow", "mustwatch", "explorepage", "mindblown", "viralreels", "shortsfyp", "internetgold"],
}

CATEGORY_HOOKS = {
    "Romance": [
        "When feelings are real, words are never enough... ❤️ Does this remind you of someone special?",
        "A moment of pure emotion that hits right in the heart. 🥺 Tag your special someone below!",
        "Late night thoughts of someone you will never forget... 💭 Drop a ❤️ in the comments!",
    ],
    "Motivational": [
        "Remember this: Tough times never last, but tough people do. 💪 Never give up on your dreams!",
        "The mindset shift that changes everything in life. 🔥 Drop a 💯 if you agree!",
        "Your future self is watching you right now. Stay disciplined and focused! 🚀",
    ],
    "Comedy": [
        "Try not to laugh challenge! 😂 Who else would do this? Tag your friend below! 👇",
        "Pure comedy gold moments! 🤣 Did you expect that to happen?",
        "This made my whole day! 💀 Drop your funniest reaction below! 👇",
    ],
    "Horror": [
        "Look closely at the background... 😱 Did you see that? Tell us in the comments! 👇",
        "Spine chilling real mystery... 👻 Do not watch this alone in the dark!",
        "Can anyone explain what just happened here? 🕯️ Watch closely!",
    ],
    "Educational": [
        "Did you know this fascinating fact? 🧠 Drop your thoughts in the comments below! 👇",
        "The mind blowing science discovery you never learned in school! 🔬",
        "Watch closely to understand how this actually works! 💡",
    ],
    "Food": [
        "Mouthwatering culinary perfection! 🤤 Would you eat this? Rate it 1-10 below! 👇",
        "Incredible cooking skills on another level! 🍳 Tag a food lover!",
    ],
    "Sports": [
        "Unbelievable athletic performance and determination! 🏆 Rate this play 1-10! 👇",
        "Legendary sports moment that gave everyone chills! ⚡ Drop your reaction below!",
    ],
    "Adventure": [
        "Breathtaking view from around the world! 🌍 Would you visit this place? 👇",
        "Life is either a daring adventure or nothing at all! 🌲 Tag your travel buddy!",
    ],
    "Music": [
        "This sound hits completely different! 🎵 Drop your favorite song below! 👇",
        "Pure musical talent that touches the soul. 🎶 Turn your volume up!",
    ],
    "Trending": [
        "Wait till the very end... 🤯 Did you expect that to happen? Drop your reaction below! 👇",
        "This moment is taking over social media right now! 🔥 What are your thoughts? 👇",
    ],
}


class OnnxViralEngine:
    def __init__(self):
        self.session = None
        self.vocabulary = {}
        self.idf = []
        self.tags = []
        self.max_features = 3000
        self.load_model()

    def load_model(self):
        if not HAS_ONNX or not ONNX_MODEL_PATH.exists() or not CONFIG_PATH.exists():
            return

        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            self.vocabulary = cfg.get("vocabulary", {})
            self.idf = cfg.get("idf", [])
            self.tags = cfg.get("tags", [])
            self.max_features = cfg.get("max_features", 3000)

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self.session = ort.InferenceSession(str(ONNX_MODEL_PATH), sess_options=opts)
        except Exception as e:
            print(f"Notice: ONNX model loading fallback: {e}")
            self.session = None

    def text_to_tfidf(self, text: str) -> np.ndarray:
        words = re.findall(r"[a-z0-9]+", text.lower())
        vec = np.zeros((1, self.max_features), dtype=np.float32)
        for w in words:
            if w in self.vocabulary:
                idx = self.vocabulary[w]
                if idx < self.max_features and idx < len(self.idf):
                    vec[0, idx] += self.idf[idx]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def predict_hashtags(self, title: str, category: str, max_tags: int = 12) -> List[str]:
        cat_clean = (category or "Trending").strip().title()
        if cat_clean not in CATEGORY_VIRAL_BANK:
            cat_clean = "Trending"

        exclusions = CATEGORY_EXCLUSIONS.get(cat_clean, set())
        predicted_set: List[str] = []

        # 1. PRIORITY ONE: Category-specific high-traffic tags (Guarantees zero irrelevant tags!)
        cat_bank = CATEGORY_VIRAL_BANK.get(cat_clean, CATEGORY_VIRAL_BANK["Trending"])
        target_cat_count = 8 if is_hash else 6
        for t in cat_bank:
            if t not in predicted_set and t not in exclusions:
                predicted_set.append(t)
            if len(predicted_set) >= target_cat_count:
                break

        # 2. PRIORITY TWO: Extract relevant topic words from real human title
        is_hash = bool(re.match(r"^[a-zA-Z0-9_\-]{16,}$", title.strip())) or (" " not in title.strip() and len(title.strip()) > 14)
        stopwords = {
            "this", "that", "clip", "video", "taking", "over", "part", "with", "from",
            "your", "what", "how", "when", "why", "who", "all", "are", "get", "got",
            "can", "new", "more", "into", "just", "day", "the", "and", "internet",
            "moment", "viral", "trending", "shorts", "reels", "beh", "emi",
        }
        words = [] if is_hash else re.findall(r"[a-zA-Z]{3,18}", title.lower())
        for w in words:
            if (
                w not in stopwords
                and w not in exclusions
                and w not in BLACKLIST_TAGS
                and w not in predicted_set
                and not re.search(r"[bcdfghjklmnpqrstvwxyz]{5,}", w)
            ):
                predicted_set.append(w)
                if len(predicted_set) >= 8:
                    break

        # 3. PRIORITY THREE: Compatible ONNX Predictions
        if self.session and self.tags:
            try:
                query_text = f"{cat_clean} {title}" if not is_hash else cat_clean
                vec = self.text_to_tfidf(query_text)
                outputs = self.session.run(["output_probability"], {"float_input": vec})
                if outputs and len(outputs) > 0 and len(outputs[0]) > 0:
                    prob_map = outputs[0][0]
                    sorted_indices = sorted(prob_map.keys(), key=lambda k: prob_map[k], reverse=True)
                    for idx in sorted_indices[:40]:
                        if idx < len(self.tags):
                            tag = self.tags[idx].lower().strip()
                            if (
                                tag
                                and tag not in BLACKLIST_TAGS
                                and tag not in exclusions
                                and tag not in predicted_set
                                and len(tag) >= 3
                            ):
                                predicted_set.append(tag)
                                if len(predicted_set) >= max_tags - 2:
                                    break
            except Exception as e:
                print(f"Notice: ONNX inference fallback: {e}")

        # 4. Universal Viral Tags
        for u in ["shorts", "fyp", "viral"]:
            if u not in predicted_set:
                predicted_set.append(u)

        return [t.lower().replace("#", "") for t in predicted_set[:max_tags]]

    def generate_metadata(
        self,
        title: str,
        category: str = "Trending",
        part_num: int = 1,
        total_parts: int = 1,
    ) -> Dict[str, Any]:
        cat_clean = (category or "Trending").strip().title()
        if cat_clean not in CATEGORY_HOOKS:
            cat_clean = "Trending"

        hashtags = self.predict_hashtags(title, cat_clean, max_tags=12)

        # Select category-appropriate viral hook
        hooks = CATEGORY_HOOKS.get(cat_clean, CATEGORY_HOOKS["Trending"])
        hook_idx = (int(time.time()) + part_num) % len(hooks)
        hook = hooks[hook_idx]

        is_single = total_parts <= 1
        clip_title = title if is_single else f"PART {part_num} | {title[:45]}"
        part_badge = "" if is_single else f"📌 PART {part_num} of {total_parts}\n\n"

        description = (
            f"{part_badge}"
            f"✨ {title}\n\n"
            f"{hook}\n\n"
            f"💬 Drop a comment below with your thoughts!\n"
            f"🔔 Follow & Subscribe for daily {cat_clean.lower()} moments!\n\n"
            f"────────────────────────────\n"
            f"Fair Use Disclaimer: Curated for commentary, education, and entertainment purposes."
        )

        return {
            "title": clip_title,
            "description": description,
            "hashtags": hashtags,
            "engine": "onnx-viral-tagger-v2",
        }


# Global singleton instance
engine = OnnxViralEngine()


def get_viral_metadata(title: str, category: str = "Trending", part_num: int = 1, total_parts: int = 1) -> Dict[str, Any]:
    return engine.generate_metadata(title, category, part_num, total_parts)
