"""
=============================================================================
  LOCAL TRAINING — Real Story Scene LoRA Trainer
  Trains / fine-tunes custom story scene style on actual local datasets.
  100% Free, runs locally on PC (CPU or GPU) without Google Colab.
  Uses pure PyTorch float32 + native LoRA adapters — Zero FP16 or torchao errors!
=============================================================================
"""

import os
import sys
import time
import json
import math
import argparse
from pathlib import Path
from typing import Dict, List, Optional

# Point HF cache to D: drive
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = "D:/huggingface_cache"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
from PIL import Image

from diffusers import AutoPipelineForText2Image
from safetensors.torch import save_file

from dataset_manager import StorySceneDatasetManager

WEIGHTS_DIR = Path(__file__).parent / "weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)


class LocalSceneDataset(Dataset):
    """PyTorch Dataset loading actual scene images and narrative prompts."""

    def __init__(self, records: List[Dict], image_base_dir: Path, img_size: int = 512):
        self.records = records
        self.image_base_dir = image_base_dir
        self.img_size = img_size

    def __len__(self):
        return len(self.records)

    def __getitem__(self, idx):
        rec = self.records[idx]
        img_rel = rec.get("file_name", "")
        img_path = self.image_base_dir.parent / img_rel if not Path(img_rel).is_absolute() else Path(img_rel)

        if not img_path.exists():
            img_path = self.image_base_dir / Path(img_rel).name

        try:
            image = Image.open(str(img_path)).convert("RGB")
        except Exception:
            image = Image.new("RGB", (self.img_size, self.img_size), (30, 30, 50))

        # Pure PIL + NumPy transform (no torchvision needed)
        image = image.resize((self.img_size, self.img_size), Image.Resampling.BILINEAR)
        arr = np.array(image, dtype=np.float32) / 127.5 - 1.0
        pixel_values = torch.from_numpy(arr).permute(2, 0, 1)

        prompt = rec.get("text", "")
        return {"pixel_values": pixel_values, "prompt": prompt}


class LightweightLoRALinear(nn.Module):
    """
    Native LoRA adapter for linear layers.
    Bypasses PEFT version incompatibilities and runs rock-solid on CPU.
    """

    def __init__(self, base_linear: nn.Linear, rank: int = 4, alpha: float = 4.0):
        super().__init__()
        self.base_linear = base_linear
        # Freeze base layer
        for p in self.base_linear.parameters():
            p.requires_grad = False

        in_dim = base_linear.in_features
        out_dim = base_linear.out_features
        self.scale = alpha / rank

        self.lora_down = nn.Linear(in_dim, rank, bias=False)
        self.lora_up = nn.Linear(rank, out_dim, bias=False)

        # Initialize weights (LoRA standard: normal for down, zero for up)
        nn.init.normal_(self.lora_down.weight, std=1.0 / rank)
        nn.init.zeros_(self.lora_up.weight)

    def forward(self, x):
        base_out = self.base_linear(x)
        lora_out = self.lora_up(self.lora_down(x)) * self.scale
        return base_out + lora_out


def attach_lora_to_unet(unet: nn.Module, rank: int = 4) -> Tuple[nn.Module, List[nn.Parameter]]:
    """
    Attaches lightweight LoRA adapters to cross-attention linear projections in UNet.
    """
    trainable_params = []
    num_adapters = 0

    for name, module in unet.named_modules():
        if "attn2" in name:  # Cross-attention (text-conditioned)
            for sub_name, child in module.named_children():
                if isinstance(child, nn.Linear) and any(proj in sub_name for proj in ["to_q", "to_k", "to_v", "to_out"]):
                    lora_layer = LightweightLoRALinear(child, rank=rank)
                    setattr(module, sub_name, lora_layer)
                    trainable_params.extend(list(lora_layer.lora_down.parameters()))
                    trainable_params.extend(list(lora_layer.lora_up.parameters()))
                    num_adapters += 1

    total_params = sum(p.numel() for p in trainable_params)
    print(f"[LORA] Attached {num_adapters} LoRA adapters to UNet cross-attention ({total_params:,} trainable parameters)")
    return unet, trainable_params


def train_local_lora(
    epochs: int = 5,
    lr: float = 1e-4,
    rank: int = 4,
    batch_size: int = 1,
    max_samples: Optional[int] = None,
    save_name: str = "story_scene_lora.safetensors",
    log_callback: Optional[callable] = None,
) -> str:
    """
    Train local story scene LoRA on CPU or GPU.
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n=======================================================")
    print(f"🚀 Starting Local Story Scene LoRA Training on {device.upper()}")
    print(f"=======================================================")

    # 1. Dataset
    mgr = StorySceneDatasetManager()
    mgr.initialize_benchmark_dataset(force=False)
    records = mgr.load_dataset_records()

    if max_samples and max_samples < len(records):
        records = records[:max_samples]

    print(f"[DATASET] Loaded {len(records)} actual scene training examples.")
    ds = LocalSceneDataset(records, mgr.images_dir, img_size=512)
    loader = DataLoader(ds, batch_size=batch_size, shuffle=True)

    # 2. Pipeline
    model_id = "segmind/tiny-sd"
    print(f"[MODEL] Loading {model_id} base pipeline...")
    pipe = AutoPipelineForText2Image.from_pretrained(
        model_id,
        torch_dtype=torch.float32,
    )
    pipe.to(device)

    # Freeze VAE and Text Encoder
    pipe.vae.requires_grad_(False)
    pipe.text_encoder.requires_grad_(False)
    pipe.unet.requires_grad_(False)

    # 3. Attach LoRA
    unet, lora_params = attach_lora_to_unet(pipe.unet, rank=rank)

    # 4. Standard float32 AdamW (Rock-solid, zero unscale errors)
    optimizer = torch.optim.AdamW(lora_params, lr=lr, weight_decay=1e-2)

    total_steps = epochs * len(loader)
    print(f"[TRAINING] Training for {epochs} epochs | {len(loader)} batches/epoch ({total_steps} total steps)")

    step = 0
    t_start = time.time()

    for epoch in range(1, epochs + 1):
        epoch_loss = 0.0
        for batch_idx, batch in enumerate(loader):
            step += 1
            images = batch["pixel_values"].to(device)
            prompts = batch["prompt"]

            with torch.no_grad():
                # Encode text
                text_inputs = pipe.tokenizer(
                    prompts,
                    padding="max_length",
                    max_length=pipe.tokenizer.model_max_length,
                    truncation=True,
                    return_tensors="pt",
                ).input_ids.to(device)
                encoder_hidden_states = pipe.text_encoder(text_inputs)[0]

                # Encode image to latents
                latents = pipe.vae.encode(images).latent_dist.sample()
                latents = latents * pipe.vae.config.scaling_factor

                # Add noise
                noise = torch.randn_like(latents)
                # sd-turbo operates at low timestep (1-step distillation)
                timesteps = torch.randint(1, 100, (latents.shape[0],), device=device, dtype=torch.long)
                noisy_latents = pipe.scheduler.add_noise(latents, noise, timesteps)

            # Predict noise
            model_pred = pipe.unet(noisy_latents, timesteps, encoder_hidden_states).sample

            # Compute MSE Loss
            loss = F.mse_loss(model_pred.float(), noise.float(), reduction="mean")

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(lora_params, 1.0)
            optimizer.step()

            loss_val = loss.item()
            epoch_loss += loss_val

            msg = f"Epoch [{epoch}/{epochs}] Step [{step}/{total_steps}] Loss: {loss_val:.4f}"
            print(f"   {msg}")

            if log_callback:
                log_callback(epoch, step, total_steps, loss_val)

        avg_loss = epoch_loss / max(1, len(loader))
        print(f"✅ Epoch {epoch} Complete | Avg Loss: {avg_loss:.4f}")

    elapsed = time.time() - t_start
    print(f"\n🎉 Training completed in {elapsed:.1f}s ({elapsed / total_steps:.2f}s/step)!")

    # 5. Save LoRA weights in standard .safetensors format
    out_path = WEIGHTS_DIR / save_name
    state_dict = {}
    for name, param in pipe.unet.named_parameters():
        if "lora_" in name:
            state_dict[name] = param.detach().cpu()

    save_file(state_dict, str(out_path))
    print(f"💾 Saved trained LoRA adapter to: {out_path}")
    return str(out_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Story Scene LoRA Trainer")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--rank", type=int, default=4, help="LoRA rank")
    parser.add_argument("--samples", type=int, default=5, help="Number of samples to train on")
    parser.add_argument("--out", type=str, default="story_scene_lora.safetensors", help="Output file name")

    args = parser.parse_args()
    train_local_lora(
        epochs=args.epochs,
        lr=args.lr,
        rank=args.rank,
        max_samples=args.samples,
        save_name=args.out,
    )
