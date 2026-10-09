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

# Generic noise words & individual channel names to filter from predicted tags
BLACKLIST_TAGS = {
    "this", "that", "clip", "video", "taking", "over", "part", "shorts", "viral", "foryou",
    "trending", "reels", "fyp", "the", "and", "with", "from", "your", "what", "how", "when",
    "why", "who", "all", "are", "get", "got", "can", "new", "more", "into", "just", "day",
    "sssniperwolf", "cleetusmcfarland", "cleetus", "baldeaglemachine", "resleeved427", "sptyhigh",
    "spstsoccer", "pewdiepie", "mrbeast", "ninja", "shroud", "tseries", "vlog", "vlogs",
}

CATEGORY_VIRAL_BANK = {
    "Trending": ["viralvideo", "trendingnow", "mustwatch", "explorepage", "mindblown", "viralreels", "shortsfyp"],
    "Comedy": ["comedycentral", "funnyvideos", "trynottolaugh", "humor", "standup", "funnymoments", "hilarious", "laughoutloud"],
    "Motivational": ["mindsetmatters", "discipline", "successquotes", "hustlehard", "nevergiveup", "growthmindset", "selfdevelopment", "dailyinspiration"],
    "Horror": ["scarystories", "creepyfacts", "paranormal", "horrorstories", "spookyseason", "unexplained", "mystery"],
    "Educational": ["didyouknow", "sciencefacts", "curiosity", "mindblowingfacts", "learnsomethingnew", "interestingfacts", "historybuff"],
    "Romance": ["lovequotes", "relationshipgoals", "heartfelt", "emotionalmoments", "wholesomelove", "romanticvibes"],
    "Adventure": ["adventurous", "wanderlust", "naturelovers", "exploremore", "wildlifephotography", "earthoutdoors", "thrillseeker"],
    "Music": ["viralmusic", "trendingaudio", "beatdrop", "banger", "musiciansoftiktok", "livemusic", "soundtrack"],
    "Food": ["foodiegram", "streetfood", "deliciousfood", "easyrecipe", "foodlovers", "chefskills", "mouthwatering"],
    "Sports": ["sportsmoments", "highlightreel", "athlete", "championsleague", "gamewinner", "insaneplay", "buzzerbeater"],
    "Gaming": ["gamingmoments", "clutchplay", "gameplayhighlight", "epicgamer", "gamercommunity", "streamerclips"],
}

HOOK_TEMPLATES = [
    "Wait till the very end... 🤯 Did you expect that to happen?",
    "This moment is going completely viral right now! 🔥",
    "Can we talk about what just happened here? 💬",
    "Watch closely at the reaction... 🎬 Absolutely incredible!",
    "This is why the internet exists. What are your thoughts? 👇",
]


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

            # Initialize ONNX runtime session (runs on CPU)
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
        predicted_set = []

        # 1. Run ONNX Model Inference if loaded
        if self.session and self.tags:
            try:
                vec = self.text_to_tfidf(title)
                outputs = self.session.run(["output_probability"], {"float_input": vec})
                if outputs and len(outputs) > 0 and len(outputs[0]) > 0:
                    prob_map = outputs[0][0]
                    # Sort tags by descending probability
                    sorted_indices = sorted(prob_map.keys(), key=lambda k: prob_map[k], reverse=True)
                    for idx in sorted_indices[:25]:
                        if idx < len(self.tags):
                            tag = self.tags[idx].lower().strip()
                            if tag and tag not in BLACKLIST_TAGS and len(tag) >= 3 and tag not in predicted_set:
                                predicted_set.append(tag)
                                if len(predicted_set) >= 6:
                                    break
            except Exception as e:
                print(f"Notice: ONNX inference fallback: {e}")

        # 2. Extract meaningful topic keywords directly from title (ignoring stop words)
        words = re.findall(r"[a-zA-Z]{3,18}", title.lower())
        for w in words:
            if w not in BLACKLIST_TAGS and w not in predicted_set and not re.search(r"[bcdfghjklmnpqrstvwxyz]{5,}", w):
                predicted_set.append(w)
                if len(predicted_set) >= 8:
                    break

        # 3. Add Category Niche Viral Tags
        cat_clean = (category or "Trending").strip().title()
        bank = CATEGORY_VIRAL_BANK.get(cat_clean) or CATEGORY_VIRAL_BANK.get("Trending", [])
        for t in bank:
            if t not in predicted_set:
                predicted_set.append(t)
            if len(predicted_set) >= max_tags - 3:
                break

        # 4. Add Universal Algorithm Tags
        for u in ["shorts", "viral", "fyp", "reels"]:
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
        hashtags = self.predict_hashtags(title, cat_clean, max_tags=12)

        # Select dynamic hook
        hook_idx = (int(time.time()) + part_num) % len(HOOK_TEMPLATES)
        hook = HOOK_TEMPLATES[hook_idx]

        is_single = total_parts <= 1
        clip_title = title if is_single else f"PART {part_num} | {title[:45]}"
        part_badge = "" if is_single else f"📌 PART {part_num} of {total_parts}\n\n"

        description = (
            f"{part_badge}"
            f"✨ {title}\n\n"
            f"{hook}\n\n"
            f"💬 Drop your thoughts in the comments below!\n"
            f"🔔 Follow & Subscribe for daily viral moments!\n\n"
            f"────────────────────────────\n"
            f"Fair Use Disclaimer: Curated for commentary, education, and entertainment purposes."
        )

        return {
            "title": clip_title,
            "description": description,
            "hashtags": hashtags,
            "engine": "onnx-viral-tagger-v1" if self.session else "heuristic-nlp-v1",
        }


# Global singleton instance
engine = OnnxViralEngine()


def get_viral_metadata(title: str, category: str = "Trending", part_num: int = 1, total_parts: int = 1) -> Dict[str, Any]:
    return engine.generate_metadata(title, category, part_num, total_parts)
