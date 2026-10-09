import os
import sys
import re
import json
import urllib.request
from pathlib import Path
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnxruntime as ort

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

DATASET_PARQUET_URL = "https://huggingface.co/api/datasets/astune/text_info_trending_youtube_videos_2019-04-15_to_2020-04-15/parquet/default/train/0.parquet"


def clean_tag(raw: str) -> str:
    """Normalize a tag to a clean lowercase hashtag token."""
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", str(raw).lower().strip())
    # Exclude useless filler words or numbers
    if len(cleaned) < 3 or len(cleaned) > 25 or cleaned.isdigit():
        return ""
    filler = {"this", "that", "clip", "video", "taking", "over", "part", "shorts", "viral", "foryou", "trending"}
    if cleaned in filler:
        return ""
    return cleaned


def clean_title(raw: str) -> str:
    """Clean video title for NLP vectorization."""
    t = re.sub(r"https?://\S+", "", str(raw).lower())
    t = re.sub(r"[^a-zA-Z0-9\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def train():
    print("🚀 Step 1: Downloading real trending YouTube video dataset...")
    df = pd.read_parquet(DATASET_PARQUET_URL)
    print(f"Loaded {len(df)} real trending video records.")

    print("📊 Step 2: Processing and cleaning real tags...")
    cleaned_titles = []
    video_tag_lists = []
    all_tags = []

    for _, row in df.iterrows():
        title = clean_title(row.get("title", ""))
        raw_tags = row.get("tags")

        tags_for_row = []
        if isinstance(raw_tags, (list, np.ndarray)):
            for t in raw_tags:
                ct = clean_tag(t)
                if ct:
                    tags_for_row.append(ct)
        elif isinstance(raw_tags, str) and "|" in raw_tags:
            for t in raw_tags.split("|"):
                ct = clean_tag(t)
                if ct:
                    tags_for_row.append(ct)

        tags_for_row = list(dict.fromkeys(tags_for_row))  # preserve order, unique
        if title and tags_for_row:
            cleaned_titles.append(title)
            video_tag_lists.append(tags_for_row)
            all_tags.extend(tags_for_row)

    print(f"Valid videos with tags: {len(cleaned_titles)}")
    tag_counts = Counter(all_tags)
    print(f"Total unique tags collected: {len(tag_counts)}")

    # Keep top 400 most frequent real trending tags across the dataset
    TOP_N_TAGS = 400
    top_tags = [t for t, _ in tag_counts.most_common(TOP_N_TAGS)]
    tag_to_idx = {tag: i for i, tag in enumerate(top_tags)}
    print(f"Selected Top {TOP_N_TAGS} viral tags for ONNX multi-label classifier.")
    print(f"Sample top tags: {top_tags[:15]}")

    # Build binary label matrix (Y)
    Y = np.zeros((len(cleaned_titles), TOP_N_TAGS), dtype=np.float32)
    for row_idx, tags in enumerate(video_tag_lists):
        for t in tags:
            if t in tag_to_idx:
                Y[row_idx, tag_to_idx[t]] = 1.0

    # Filter out samples with no top tags to keep model density high
    valid_mask = Y.sum(axis=1) > 0
    X_titles = [cleaned_titles[i] for i in range(len(cleaned_titles)) if valid_mask[i]]
    Y = Y[valid_mask]
    print(f"Training on {len(X_titles)} videos with strong tag associations.")

    print("🧠 Step 3: Training TF-IDF feature extractor...")
    MAX_FEATURES = 3000
    vectorizer = TfidfVectorizer(
        max_features=MAX_FEATURES,
        ngram_range=(1, 2),
        stop_words="english",
        min_df=2,
        sublinear_tf=True
    )
    X_tfidf = vectorizer.fit_transform(X_titles).astype(np.float32)
    print(f"TF-IDF Matrix shape: {X_tfidf.shape}")

    print("⚡ Step 4: Training Multi-Label Classifier...")
    # Train multi-label logistic regression model
    base_clf = LogisticRegression(max_iter=200, C=1.5, solver="liblinear")
    ovr_clf = OneVsRestClassifier(base_clf, n_jobs=-1)
    ovr_clf.fit(X_tfidf, Y)
    print("Classifier training complete!")

    print("📦 Step 5: Converting model to ONNX format...")
    initial_type = [("float_input", FloatTensorType([None, MAX_FEATURES]))]
    onnx_model = convert_sklearn(ovr_clf, initial_types=initial_type, target_opset=12)

    onnx_path = MODELS_DIR / "viral_tagger.onnx"
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    file_size_mb = onnx_path.stat().st_size / 1024 / 1024
    print(f"✅ ONNX model successfully exported: {onnx_path} ({file_size_mb:.2f} MB)")

    print("💾 Step 6: Saving vectorizer vocabulary & tag labels...")
    vocab_config = {
        "vocabulary": {word: int(idx) for word, idx in vectorizer.vocabulary_.items()},
        "idf": vectorizer.idf_.tolist(),
        "tags": top_tags,
        "max_features": MAX_FEATURES,
    }
    config_path = MODELS_DIR / "viral_nlp_config.json"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(vocab_config, f, indent=2)
    print(f"Saved configuration and vocabulary to {config_path}")

    print("🧪 Step 7: Verifying ONNX model inference...")
    test_session = ort.InferenceSession(str(onnx_path))
    test_title = "Incredible Street Food Chef Cooking Delicious Noodles in Tokyo"
    test_vec = vectorizer.transform([clean_title(test_title)]).toarray().astype(np.float32)

    input_name = test_session.get_inputs()[0].name
    output_name = test_session.get_outputs()[1].name if len(test_session.get_outputs()) > 1 else test_session.get_outputs()[0].name
    pred_probs = test_session.run([output_name], {input_name: test_vec})[0]

    # If shape is (1, N) or (N,)
    probs = pred_probs[0] if pred_probs.ndim > 1 else pred_probs
    top_indices = np.argsort(probs)[::-1][:10]
    predicted_tags = [top_tags[i] for i in top_indices if probs[i] > 0.05 or i in top_indices[:5]]

    print("\n---------------- TEST PREDICTION ----------------")
    print(f"Input Title: {test_title}")
    print(f"Predicted Viral Hashtags: {['#' + t for t in predicted_tags]}")
    print("-------------------------------------------------")
    print("🎉 MODEL TRAINING & ONNX EXPORT COMPLETE!")


if __name__ == "__main__":
    train()
