"""
=============================================================================
  TRAIN NEURAL MUSIC GENERATOR — ML Training Pipeline for Neural Music Composer
  Trains the genre embeddings and harmonic projection layers.
  Saves trained weights to scripts/models/neural_music_model.pt.
=============================================================================
"""

import sys
import os
import time
import math
import torch
import torch.nn as nn
import torch.optim as optim
from pathlib import Path

# Ensure UTF-8
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT_DIR / "scripts" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

from neural_music_composer import NeuralMusicComposer, GENRES


def train_music_model(epochs: int = 25):
    print("=" * 70)
    print("🚀 Training Neural Music Generative Model from scratch...")
    print("=" * 70)

    model = NeuralMusicComposer()
    model.train()

    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

    # Multi-genre training targets: Train harmonic embedding projection
    print(f"🎵 Training on {len(GENRES)} distinct musical genre spaces:")
    for idx, g in enumerate(GENRES):
        print(f"  {idx + 1}. {g}")

    criterion = nn.MSELoss()

    for epoch in range(1, epochs + 1):
        total_loss = 0.0
        for g_idx, genre in enumerate(GENRES):
            optimizer.zero_grad()

            genre_tensor = torch.tensor([g_idx % len(GENRES)], dtype=torch.long)
            embed = model.genre_embedding(genre_tensor)

            # Predict target tempo and scale intervals
            pred_tempo = model.fc_tempo(embed)
            pred_scale = model.fc_scale(embed)

            # Ground truth targets from genre profiles
            prof = model.genre_profiles.get(genre, model.genre_profiles["Interesting Facts"])
            target_tempo = torch.tensor([[prof["base_bpm"] / 100.0]], dtype=torch.float32)
            target_scale = torch.tensor([prof["scale"]], dtype=torch.float32) / 200.0

            loss = criterion(pred_tempo, target_tempo) + criterion(pred_scale, target_scale)

            # Add harmonic regularization
            harm_reg = torch.mean(torch.abs(model.oscillator.harmonic_weights)) * 0.05
            loss = loss + harm_reg

            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        if epoch % 5 == 0 or epoch == epochs:
            avg_loss = total_loss / len(GENRES)
            print(f"  [Epoch {epoch:02d}/{epochs:02d}] Spectral Convergence Loss: {avg_loss:.6f}")

    # Save trained checkpoint
    save_path = MODELS_DIR / "neural_music_model.pt"
    torch.save(model.state_dict(), str(save_path))
    print("=" * 70)
    print(f"✅ Successfully trained and saved Neural Music Model: {save_path}")
    print(f"   Model size: {save_path.stat().st_size} bytes")
    print("=" * 70)


if __name__ == "__main__":
    train_music_model()
