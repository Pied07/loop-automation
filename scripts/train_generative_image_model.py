import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image, ImageOps
import onnx
import onnxruntime as ort

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATASET_DIR = MODELS_DIR / "dataset_real_images"
DATASET_DIR.mkdir(parents=True, exist_ok=True)
ONNX_OUTPUT_PATH = MODELS_DIR / "generative_image_model.onnx"
CONFIG_OUTPUT_PATH = MODELS_DIR / "generative_image_config.json"

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

CATEGORY_SEARCH_QUERIES = {
    "Motivational": [
        "mountain summit sunrise athlete",
        "golden trophy champion winner",
        "determination runner sunrise marathon",
        "epic misty peak golden rays",
    ],
    "Horror": [
        "dark foggy haunted forest",
        "abandoned spooky decaying mansion",
        "shadowy misty dark corridor",
        "eerie moonlit creepy castle",
    ],
    "Educational": [
        "outer space nebula galaxy hubble",
        "futuristic science laboratory research",
        "planet earth orbit space cosmos",
        "deep space cosmic stars astronomy",
    ],
    "Comedy": [
        "funny expressive dog laughing",
        "hilarious surprised cat smiling",
        "colorful playful party confetti",
        "funny cute animal funny moment",
    ],
    "Romance": [
        "romantic couple sunset golden hour",
        "warm candlelit dinner bokeh love",
        "cherry blossom spring romantic path",
        "emotional warm beach sunset silhouette",
    ],
    "Adventure": [
        "dramatic mountain climber ridge",
        "extreme ocean big wave surfer",
        "majestic canyon wild river valley",
        "lush tropical rainforest expedition",
    ],
    "Music": [
        "neon concert stage lights crowd",
        "electric guitar glowing stage rock",
        "futuristic audio soundwave dj console",
        "vibrant festival music lights neon",
    ],
    "Food": [
        "gourmet artisan burger cheese flame",
        "fresh delicious italian pasta basil",
        "mouthwatering steak grilled chef",
        "artisan pastry bakery chocolate dessert",
    ],
    "Trending": [
        "cyberpunk futuristic neon city skyline",
        "high tech hypercar neon highway",
        "futuristic glowing metropolis night",
        "sleek modern technology abstract light",
    ],
}


def download_real_dataset() -> List[Dict[str, Any]]:
    """
    Downloads real photographs and scene imagery across all 9 viral categories
    from the Openverse public domain dataset.
    """
    print("--- [1/4] Collecting Real Image Dataset from Openverse ---")
    dataset_records = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RealDatasetTrainer/2.0"}

    for cat_idx, category in enumerate(CATEGORIES):
        cat_dir = DATASET_DIR / category.lower()
        cat_dir.mkdir(parents=True, exist_ok=True)
        queries = CATEGORY_SEARCH_QUERIES.get(category, [category])

        for q_idx, query in enumerate(queries):
            target_path = cat_dir / f"img_{q_idx}.jpg"
            if target_path.exists() and target_path.stat().st_size > 5000:
                dataset_records.append({
                    "category": category,
                    "cat_idx": cat_idx,
                    "query": query,
                    "path": str(target_path),
                })
                continue

            encoded_q = urllib.parse.quote(query)
            api_url = f"https://api.openverse.org/v1/images/?q={encoded_q}&page_size=3"
            req = urllib.request.Request(api_url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    results = data.get("results", [])
                    downloaded = False
                    for r in results:
                        img_url = r.get("url")
                        if not img_url:
                            continue
                        try:
                            img_req = urllib.request.Request(img_url, headers=headers)
                            with urllib.request.urlopen(img_req, timeout=12) as img_resp:
                                img_bytes = img_resp.read()
                                if len(img_bytes) > 8000:
                                    with open(target_path, "wb") as f_img:
                                        f_img.write(img_bytes)
                                    downloaded = True
                                    print(f"  [OK] Saved real image for {category} ({query[:25]}...): {len(img_bytes):,} bytes")
                                    break
                        except Exception:
                            continue
                    if downloaded:
                        dataset_records.append({
                            "category": category,
                            "cat_idx": cat_idx,
                            "query": query,
                            "path": str(target_path),
                        })
            except Exception as e:
                print(f"  [Notice] API fetch notice for '{query}': {e}")

    print(f"Total real dataset images gathered: {len(dataset_records)}")
    return dataset_records


# --- [2/4] Generative Neural Network Architecture ---

class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.relu = nn.LeakyReLU(0.2, inplace=True)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        return x + self.bn2(self.conv2(self.relu(self.bn1(self.conv1(x)))))


class GenerativeImageDecoder(nn.Module):
    """
    Deep Conditional Generative Decoder network.
    Synthesizes rich, detailed multi-channel feature maps from prompt text & category latents.
    """
    def __init__(self, latent_dim: int = 64, out_channels: int = 3):
        super().__init__()
        # Initial projection from latent vector (noise + condition) to 8x8 spatial map
        self.fc = nn.Sequential(
            nn.Linear(latent_dim, 256 * 8 * 8),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.res1 = ResidualBlock(256)

        # Upsample 8x8 -> 16x16
        self.up1 = nn.Sequential(
            nn.ConvTranspose2d(256, 128, kernel_size=4, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.res2 = ResidualBlock(128)

        # Upsample 16x16 -> 32x32
        self.up2 = nn.Sequential(
            nn.ConvTranspose2d(128, 64, kernel_size=4, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.res3 = ResidualBlock(64)

        # Upsample 32x32 -> 64x64
        self.up3 = nn.Sequential(
            nn.ConvTranspose2d(64, 32, kernel_size=4, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.LeakyReLU(0.2, inplace=True),
        )

        # Final projection to RGB image normalized to [-1, 1]
        self.final_conv = nn.Sequential(
            nn.Conv2d(32, out_channels, kernel_size=3, padding=1),
            nn.Tanh(),
        )

    def forward(self, latent: torch.Tensor) -> torch.Tensor:
        # latent shape: [batch, 64]
        h = self.fc(latent)
        h = h.view(-1, 256, 8, 8)
        h = self.res1(h)
        h = self.up1(h)
        h = self.res2(h)
        h = self.up2(h)
        h = self.res3(h)
        h = self.up3(h)
        rgb = self.final_conv(h)
        return rgb


def train_model():
    records = download_real_dataset()
    if not records:
        print("Error: No real images available for training.")
        return

    print("--- [2/4] Processing Real Images into Training Tensors ---")
    training_x = []
    training_y = []

    for r in records:
        try:
            with Image.open(r["path"]) as img:
                img_rgb = img.convert("RGB").resize((64, 64), Image.Resampling.LANCZOS)
                arr = np.array(img_rgb, dtype=np.float32) / 127.5 - 1.0  # Normalized to [-1, 1]
                arr = np.transpose(arr, (2, 0, 1))  # (C, H, W)

                # Condition vector: [9 category one-hot, 23 semantic hash features, 32 latent seed]
                cond = np.zeros(64, dtype=np.float32)
                cond[r["cat_idx"]] = 1.0

                # Semantic tokens
                words = re.findall(r"\b[a-zA-Z]{3,}\b", r["query"].lower())
                for i, w in enumerate(words[:23]):
                    cond[9 + i] = float(sum(ord(c) for c in w) % 40) / 40.0

                # Latent seed components
                cond[32:] = np.random.normal(0, 0.5, 32).astype(np.float32)

                training_x.append(cond)
                training_y.append(arr)
        except Exception as e:
            print(f"Skipping damaged image {r['path']}: {e}")

    X_train = torch.tensor(np.array(training_x), dtype=torch.float32)
    Y_train = torch.tensor(np.array(training_y), dtype=torch.float32)
    print(f"Training dataset ready: {X_train.shape[0]} real photographic scene samples.")

    # Model initialization
    device = torch.device("cpu")
    model = GenerativeImageDecoder(latent_dim=64, out_channels=3).to(device)
    optimizer = optim.AdamW(model.parameters(), lr=0.002, weight_decay=1e-4)
    criterion = nn.L1Loss()

    print("--- [3/4] Training Generative Image Model from Scratch on Real Dataset ---")
    epochs = 45
    batch_size = min(8, len(X_train))

    model.train()
    for ep in range(1, epochs + 1):
        perm = torch.randperm(len(X_train))
        epoch_loss = 0.0
        batches = 0

        for b_start in range(0, len(X_train), batch_size):
            b_idx = perm[b_start : b_start + batch_size]
            b_x = X_train[b_idx].to(device)
            b_y = Y_train[b_idx].to(device)

            optimizer.zero_grad()
            preds = model(b_x)
            loss = criterion(preds, b_y)
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item()
            batches += 1

        avg_loss = epoch_loss / max(1, batches)
        if ep % 10 == 0 or ep == epochs:
            print(f"  Epoch [{ep:2d}/{epochs:2d}] - Reconstruction L1 Loss: {avg_loss:.4f}")

    print("--- [4/4] Exporting Trained Model to PyTorch & ONNX ---")
    model.eval()
    pt_path = MODELS_DIR / "generative_image_model.pt"
    torch.save(model.state_dict(), pt_path)
    print(f"Saved PyTorch weights to: {pt_path} ({pt_path.stat().st_size:,} bytes)")

    dummy_input = torch.randn(1, 64, dtype=torch.float32)
    try:
        torch.onnx.export(
            model,
            dummy_input,
            str(ONNX_OUTPUT_PATH),
            input_names=["latent_condition"],
            output_names=["generated_image_tensor"],
            dynamic_axes={"latent_condition": {0: "batch_size"}, "generated_image_tensor": {0: "batch_size"}},
            opset_version=14,
        )
        print(f"Saved ONNX Generative Model to: {ONNX_OUTPUT_PATH} ({ONNX_OUTPUT_PATH.stat().st_size:,} bytes)")
    except Exception as e:
        print(f"Notice during ONNX export: {e}")

    # Save metadata configuration
    config = {
        "categories": CATEGORIES,
        "latent_dim": 64,
        "image_size": [64, 64],
        "training_samples": len(records),
        "created_at": time.time(),
    }
    with open(CONFIG_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    print("Generative Image Model training completed successfully!")


if __name__ == "__main__":
    train_model()
