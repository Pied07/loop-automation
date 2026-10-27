import os
import sys
import re
import json
from pathlib import Path
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.neural_network import MLPRegressor
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnxruntime as ort

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DATASET_PARQUET_URL = "https://huggingface.co/api/datasets/astune/text_info_trending_youtube_videos_2019-04-15_to_2020-04-15/parquet/default/train/0.parquet"

# Categories supported in the application
CATEGORIES = [
    "Trending",
    "Comedy",
    "Motivational",
    "Horror",
    "Educational",
    "Romance",
    "Adventure",
    "Music",
    "Food",
]

# Mapping YouTube Category IDs (string or int) to our 9 content categories
YOUTUBE_CAT_MAPPING = {
    "24": "Trending",     # Entertainment
    "17": "Adventure",    # Sports / Outdoors
    "10": "Music",        # Music
    "23": "Comedy",       # Comedy
    "26": "Food",         # Howto & Style / Cooking
    "22": "Romance",      # People & Blogs / Relationships
    "28": "Educational",  # Science & Technology
    "20": "Trending",     # Gaming
    "1":  "Horror",       # Film / Drama / Suspense
    "27": "Motivational", # Education / Self-growth
    "19": "Adventure",    # Travel & Events
    "15": "Comedy",       # Pets & Animals
    "25": "Trending",     # News & Politics
    "2":  "Adventure",    # Autos & Vehicles
    "29": "Motivational", # Nonprofits & Activism
}

CATEGORY_KEYWORDS = {
    "Motivational": ["discipline", "success", "mindset", "motivation", "hustle", "habits", "inspire", "focus", "lesson", "goals", "rules", "power", "change", "advice"],
    "Horror": ["scary", "horror", "creepy", "ghost", "dark", "mystery", "chilling", "unexplained", "haunted", "terrifying", "warning", "secret", "bizarre", "nightmare"],
    "Educational": ["science", "history", "facts", "truth", "discover", "why", "how", "brain", "universe", "mind", "explain", "study", "curious", "physics", "psychology"],
    "Romance": ["love", "relationship", "heart", "couple", "emotion", "feeling", "crush", "dating", "soulmate", "forever", "sweet", "loyalty"],
    "Comedy": ["funny", "hilarious", "laugh", "comedy", "prank", "joke", "meme", "parody", "reaction", "fails", "humor", "try not to laugh"],
    "Food": ["recipe", "food", "cook", "chef", "eat", "delicious", "kitchen", "street food", "taste", "meal", "baking", "cheese", "snack"],
    "Adventure": ["explore", "travel", "journey", "wild", "nature", "climb", "ocean", "extreme", "danger", "survival", "challenge", "world"],
    "Music": ["song", "music", "audio", "track", "beat", "melody", "sound", "remix", "guitar", "piano", "sing", "concert"],
    "Trending": ["viral", "trending", "must watch", "unbelievable", "huge", "insane", "crazy", "shocking", "record", "exposed"],
}



def clean_text(raw: str) -> str:
    """Normalize text removing URLs, emojis, and noise."""
    if not raw or not isinstance(raw, str):
        return ""
    t = re.sub(r"https?://\S+", "", raw)
    t = re.sub(r"[#@]\w+", "", t)
    t = re.sub(r"[^a-zA-Z0-9.,!?'\s\-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def extract_sentences(raw: str, min_words=6, max_words=26) -> list:
    """Extract clean, meaningful sentences suitable for video narration."""
    cleaned = clean_text(raw)
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    valid = []
    boilerplate = [
        "subscribe", "click here", "follow us", "patreon", "merch", "instagram", "twitter",
        "facebook", "website", "discount", "promo", "affiliate", "code", "sponsor", "sponsored",
        "link in bio", "check out my", "business inquiri", "all rights", "copyright", "vol.",
        "journal", "et al", "press contact", "stream now", "buy now", "purchase", "download",
        "watch in hd", "tracklist", "music by", "edited by", "directed by", "produced by",
        "written by", "special thanks", "soundtrack", "recorded at", "tour dates", "tickets"
    ]
    for s in sentences:
        s = s.strip()
        words = s.split()
        if min_words <= len(words) <= max_words:
            low = s.lower()
            if any(b in low for b in boilerplate):
                continue
            # Must start with a capital letter and end with punctuation
            if not s[0].isupper() or s[-1] not in ".!?":
                continue
            # Avoid lines with too many numbers or special formatting
            if sum(c.isdigit() for c in s) > 3:
                continue
            valid.append(s)
    return valid



def train():
    print("=" * 60)
    print("🎬 AI Video ML Model Trainer (ONNX Format)")
    print("Dataset: Real HuggingFace Trending YouTube Dataset (10,577 records)")
    print("=" * 60)

    print("\n⬇️ Step 1: Loading real trending dataset...")
    local_pq = MODELS_DIR / "trending_dataset.parquet"
    if local_pq.exists():
        print(f"Loading cached dataset from {local_pq}...")
        df = pd.read_parquet(local_pq)
    else:
        print(f"Downloading dataset from HuggingFace ({DATASET_PARQUET_URL})...")
        df = pd.read_parquet(DATASET_PARQUET_URL)
        df.to_parquet(local_pq)
        print(f"Cached dataset locally to {local_pq}.")
    print(f"Loaded {len(df)} real video records.")


    print("\n🔍 Step 2: Categorizing and extracting narrative structures...")
    category_narratives = {cat: [] for cat in CATEGORIES}
    category_titles = {cat: [] for cat in CATEGORIES}
    category_tags = {cat: [] for cat in CATEGORIES}

    for _, row in df.iterrows():
        cat_id = str(row.get("category_id", "")).strip()
        mapped_cat = YOUTUBE_CAT_MAPPING.get(cat_id, "Trending")

        raw_title = str(row.get("title", ""))
        clean_tit = clean_text(raw_title)
        raw_desc = str(row.get("description", ""))
        combined_low = (clean_tit + " " + raw_desc[:300]).lower()

        # Keyword refinement: if title/description strongly matches a specific niche, route it
        for target_cat, keywords in CATEGORY_KEYWORDS.items():
            if target_cat in ["Motivational", "Horror", "Food", "Romance", "Educational"]:
                if any(f" {kw} " in f" {combined_low} " for kw in keywords):
                    mapped_cat = target_cat
                    break

        if clean_tit and len(clean_tit.split()) >= 3:
            category_titles[mapped_cat].append(clean_tit)

        sentences = extract_sentences(raw_desc)
        if sentences:
            category_narratives[mapped_cat].extend(sentences)


        raw_tags = row.get("tags")
        if isinstance(raw_tags, (list, np.ndarray)):
            for t in raw_tags:
                ct = re.sub(r"[^a-zA-Z0-9]", "", str(t).lower())
                if 3 <= len(ct) <= 20:
                    category_tags[mapped_cat].append(ct)
        elif isinstance(raw_tags, str) and "|" in raw_tags:
            for t in raw_tags.split("|"):
                ct = re.sub(r"[^a-zA-Z0-9]", "", str(t).lower())
                if 3 <= len(ct) <= 20:
                    category_tags[mapped_cat].append(ct)

    for cat in CATEGORIES:
        print(f"  • {cat.ljust(14)}: {len(category_titles[cat])} titles, {len(category_narratives[cat])} narrative lines")

    print("\n🧠 Step 3: Structuring Storytelling Knowledge Base from Real Data...")
    knowledge_base = {}

    for cat in CATEGORIES:
        titles = category_titles[cat]
        narratives = category_narratives[cat]
        tags = [t for t, _ in Counter(category_tags[cat]).most_common(50)]

        # Group narratives into coherent 3-part story arcs (Hook, Story, Climax)
        # Using top-ranked sentences from real trending videos
        top_sentences = [s for s, count in Counter(narratives).most_common(120)]
        if len(top_sentences) < 15:
            top_sentences = narratives[:40] if narratives else ["Discover the untold secret that changed everything."]

        # Clean top titles
        top_titles = [t for t, count in Counter(titles).most_common(60)]

        knowledge_base[cat] = {
            "hooks": top_titles[:35],
            "story_lines": top_sentences[:80],
            "top_tags": tags[:30],
        }

    print("\n⚡ Step 4: Training Latent Projection ML Model & Vectorizer...")
    # Train a TF-IDF semantic vectorizer on real titles & narratives
    all_texts = []
    text_labels = []
    for cat in CATEGORIES:
        for t in knowledge_base[cat]["hooks"]:
            all_texts.append(t)
            text_labels.append(cat)
        for s in knowledge_base[cat]["story_lines"]:
            all_texts.append(s)
            text_labels.append(cat)

    VOCAB_SIZE = 512
    tfidf = TfidfVectorizer(max_features=VOCAB_SIZE, stop_words="english", ngram_range=(1, 2))
    X_tfidf = tfidf.fit_transform(all_texts).toarray().astype(np.float32)

    # Dimensionality reduction / Latent semantic space
    LATENT_DIM = 64
    svd = TruncatedSVD(n_components=LATENT_DIM, random_state=42)
    Y_latent = svd.fit_transform(X_tfidf).astype(np.float32)

    # Train a neural Multi-Layer Perceptron Regressor that maps input semantic features to latent script space
    mlp = MLPRegressor(
        hidden_layer_sizes=(128, 64),
        activation="relu",
        solver="adam",
        max_iter=300,
        random_state=42
    )
    mlp.fit(X_tfidf, Y_latent)
    print("Neural network training complete!")

    print("\n📦 Step 5: Exporting Model to ONNX Format...")
    initial_type = [("float_input", FloatTensorType([None, VOCAB_SIZE]))]
    onnx_model = convert_sklearn(mlp, initial_types=initial_type, target_opset=12)

    onnx_path = MODELS_DIR / "ai_video_generator.onnx"
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    file_size_kb = onnx_path.stat().st_size / 1024
    print(f"✅ Exported ONNX Model: {onnx_path} ({file_size_kb:.1f} KB)")

    print("\n📦 Step 5b: Exporting Neural Weights to JSON (for In-Process TS Engine)...")
    weights = {
        "coefficient": mlp.coefs_[0].tolist(),
        "intercepts": mlp.intercepts_[0].reshape(1, -1).tolist(),
        "coefficient1": mlp.coefs_[1].tolist(),
        "intercepts1": mlp.intercepts_[1].reshape(1, -1).tolist(),
        "coefficient2": mlp.coefs_[2].tolist(),
        "intercepts2": mlp.intercepts_[2].reshape(1, -1).tolist(),
        "shape_tensor": [64, 1],
    }
    weights_path = MODELS_DIR / "ai_video_weights.json"
    with open(weights_path, "w", encoding="utf-8") as f:
        json.dump(weights, f)
    print(f"✅ Exported Neural Weights: {weights_path} ({weights_path.stat().st_size / 1024:.1f} KB)")

    print("\n💾 Step 6: Saving Model Config and Knowledge Base...")
    config_payload = {
        "categories": CATEGORIES,
        "vocabulary": {word: int(idx) for word, idx in tfidf.vocabulary_.items()},
        "idf": tfidf.idf_.tolist(),
        "vocab_size": VOCAB_SIZE,
        "latent_dim": LATENT_DIM,
        "knowledge_base": knowledge_base,
        "dataset_source": "HuggingFace/astune/text_info_trending_youtube_videos",
        "total_training_records": len(df),
    }

    config_path = MODELS_DIR / "ai_video_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_payload, f, indent=2, ensure_ascii=False)
    print(f"Saved configuration to {config_path}")

    print("\n🧪 Step 7: Verifying ONNX Inference...")
    session = ort.InferenceSession(str(onnx_path))
    test_text = "The secret habit that builds unshakeable discipline every day"
    test_vec = tfidf.transform([test_text]).toarray().astype(np.float32)

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    pred_latent = session.run([output_name], {input_name: test_vec})[0]

    print(f"Test Input: '{test_text}'")
    print(f"ONNX Latent Vector shape: {pred_latent.shape}, mean: {pred_latent.mean():.4f}")
    print("=" * 60)
    print("🎉 AI VIDEO ONNX MODEL TRAINING COMPLETED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    train()
