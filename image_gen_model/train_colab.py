"""
=============================================================================
  TEXT-TO-IMAGE DIFFUSION MODEL — STORY SCENE GENERATOR
  Train on Google Colab (Free T4 GPU)
  Author: Built from scratch — no pretrained diffusion weights needed
=============================================================================

HOW TO USE:
  1. Upload this file to Google Colab
  2. Set Runtime → Change runtime type → GPU (T4)
  3. Run all cells top to bottom
  4. Training takes ~4–6 hours on COCO 10k subset
  5. ONNX model is saved automatically — download it
  6. Use local_inference.py + app.py on your PC

WHAT GETS TRAINED:
  - UNet with cross-attention (text conditioning via CLIP)
  - DDPM noise scheduler (1000 steps forward, 50 DDIM steps inference)
  - Image size: 64x64 (upgradeable to 128 with more GPU time)
  - Dataset: MS-COCO 2017 (diverse scenes, auto-downloaded)
=============================================================================
"""

# ─────────────────────────────────────────────────────────────
# CELL 1 — Install packages (run this first in Colab)
# ─────────────────────────────────────────────────────────────
# Uncomment and run this block in Colab:
"""
!pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
!pip install -q git+https://github.com/openai/CLIP.git
!pip install -q pycocotools Pillow tqdm matplotlib onnx onnxruntime
!pip install -q accelerate
"""

import os
import math
import random
import json
import urllib.request
import zipfile
from pathlib import Path
from typing import Optional, Tuple, List

import numpy as np
from PIL import Image
from tqdm import tqdm
import matplotlib.pyplot as plt

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as T

# CLIP for text encoding
import clip

# ─────────────────────────────────────────────────────────────
# CELL 2 — Configuration
# ─────────────────────────────────────────────────────────────

CONFIG = {
    # Model
    "image_size": 64,          # 64x64 images (use 128 if you have Colab Pro)
    "model_channels": 128,     # UNet base channels (increase for quality)
    "channel_mult": [1, 2, 4, 8],  # Channel multipliers per resolution level
    "num_res_blocks": 2,       # ResBlocks per level
    "attention_resolutions": [8, 4],  # Apply attention at these resolutions
    "dropout": 0.1,
    "text_embed_dim": 512,     # CLIP ViT-B/32 output dim

    # Diffusion
    "num_timesteps": 1000,     # Forward diffusion steps
    "beta_start": 1e-4,
    "beta_end": 0.02,
    "ddim_steps": 50,          # Inference steps (fast)

    # Training
    "batch_size": 16,          # Reduce to 8 if OOM
    "learning_rate": 2e-4,
    "num_epochs": 100,
    "grad_clip": 1.0,
    "ema_decay": 0.9999,       # Exponential moving average for stable samples

    # Dataset (MS-COCO 2017 subset)
    "num_coco_images": 10000,  # Use 10k images for ~4h training
    "data_dir": "./coco_data",
    "checkpoint_dir": "./checkpoints",
    "sample_every": 5,         # Save sample images every N epochs
    "checkpoint_every": 10,    # Save checkpoint every N epochs

    # Device
    "device": "cuda" if torch.cuda.is_available() else "cpu",
}

print(f"✅ Device: {CONFIG['device']}")
print(f"✅ Image size: {CONFIG['image_size']}x{CONFIG['image_size']}")
os.makedirs(CONFIG["checkpoint_dir"], exist_ok=True)
os.makedirs(CONFIG["data_dir"], exist_ok=True)


# ─────────────────────────────────────────────────────────────
# CELL 3 — Dataset (MS-COCO Story Scenes)
# ─────────────────────────────────────────────────────────────

def download_coco(data_dir: str, max_images: int = 10000):
    """Download MS-COCO 2017 validation images + captions (smaller = faster)."""
    img_dir = Path(data_dir) / "images"
    ann_file = Path(data_dir) / "captions_val2017.json"

    if not ann_file.exists():
        print("📥 Downloading COCO captions...")
        url = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
        zip_path = Path(data_dir) / "annotations.zip"
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(data_dir)
        os.remove(zip_path)
        print("✅ Captions downloaded")

    # Load annotations
    with open(ann_file) as f:
        coco = json.load(f)

    # Build image-id → caption map
    img_to_cap = {}
    for ann in coco["annotations"]:
        iid = ann["image_id"]
        if iid not in img_to_cap:
            img_to_cap[iid] = ann["caption"]

    # Select subset of images
    images = coco["images"][:max_images * 2]
    img_dir.mkdir(exist_ok=True)

    dataset_entries = []
    print(f"📥 Downloading {max_images} COCO images...")

    for img_info in tqdm(images):
        if len(dataset_entries) >= max_images:
            break
        img_id = img_info["id"]
        if img_id not in img_to_cap:
            continue
        img_path = img_dir / img_info["file_name"]
        if not img_path.exists():
            try:
                url = f"http://images.cocodataset.org/val2017/{img_info['file_name']}"
                urllib.request.urlretrieve(url, img_path)
            except Exception:
                continue
        dataset_entries.append({
            "path": str(img_path),
            "caption": img_to_cap[img_id],
        })

    # Save manifest
    manifest_path = Path(data_dir) / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(dataset_entries, f)
    print(f"✅ Dataset ready: {len(dataset_entries)} images")
    return str(manifest_path)


class StorySceneDataset(Dataset):
    """Dataset for text-conditioned image generation."""

    def __init__(self, manifest_path: str, image_size: int, clip_model, clip_preprocess, device: str):
        with open(manifest_path) as f:
            self.entries = json.load(f)

        self.transform = T.Compose([
            T.Resize((image_size, image_size), interpolation=T.InterpolationMode.BICUBIC),
            T.CenterCrop(image_size),
            T.RandomHorizontalFlip(),
            T.ToTensor(),
            T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),  # → [-1, 1]
        ])
        self.clip_model = clip_model
        self.clip_preprocess = clip_preprocess
        self.device = device

        # Pre-encode all text captions (do this once to save GPU time during training)
        print("🔤 Pre-encoding captions with CLIP...")
        self.text_embeddings = self._encode_all_captions()

    def _encode_all_captions(self):
        embeddings = []
        batch_size = 256
        with torch.no_grad():
            for i in tqdm(range(0, len(self.entries), batch_size)):
                batch = self.entries[i:i+batch_size]
                captions = [e["caption"] for e in batch]
                tokens = clip.tokenize(captions, truncate=True).to(self.device)
                emb = self.clip_model.encode_text(tokens).float().cpu()
                embeddings.append(emb)
        return torch.cat(embeddings, dim=0)  # [N, 512]

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, idx):
        entry = self.entries[idx]
        try:
            img = Image.open(entry["path"]).convert("RGB")
        except Exception:
            img = Image.new("RGB", (64, 64), color=(128, 128, 128))
        img = self.transform(img)
        text_emb = self.text_embeddings[idx]
        return img, text_emb


# ─────────────────────────────────────────────────────────────
# CELL 4 — Model Architecture
# ─────────────────────────────────────────────────────────────

def sinusoidal_embedding(timesteps: torch.Tensor, dim: int) -> torch.Tensor:
    """Sinusoidal time embedding for DDPM."""
    half_dim = dim // 2
    emb_scale = math.log(10000) / (half_dim - 1)
    emb = torch.exp(torch.arange(half_dim, device=timesteps.device) * -emb_scale)
    emb = timesteps.float()[:, None] * emb[None, :]
    emb = torch.cat([torch.sin(emb), torch.cos(emb)], dim=1)
    if dim % 2 == 1:
        emb = F.pad(emb, (0, 1))
    return emb


class EMA:
    """Exponential Moving Average for model weights — improves sample quality."""
    def __init__(self, model: nn.Module, decay: float = 0.9999):
        self.model = model
        self.decay = decay
        self.shadow = {k: v.clone() for k, v in model.state_dict().items()}

    @torch.no_grad()
    def update(self):
        for k, v in self.model.state_dict().items():
            self.shadow[k] = self.decay * self.shadow[k] + (1 - self.decay) * v

    def apply(self):
        """Apply EMA weights to model for sampling."""
        self._backup = {k: v.clone() for k, v in self.model.state_dict().items()}
        self.model.load_state_dict(self.shadow)

    def restore(self):
        """Restore original model weights after sampling."""
        self.model.load_state_dict(self._backup)


class ResBlock(nn.Module):
    """Residual block with time embedding injection."""
    def __init__(self, in_ch: int, out_ch: int, time_dim: int, dropout: float = 0.1):
        super().__init__()
        self.norm1 = nn.GroupNorm(min(32, in_ch), in_ch)
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
        self.time_proj = nn.Sequential(nn.SiLU(), nn.Linear(time_dim, out_ch * 2))
        self.norm2 = nn.GroupNorm(min(32, out_ch), out_ch)
        self.dropout = nn.Dropout(dropout)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
        self.skip = nn.Conv2d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        self._init_weights()

    def _init_weights(self):
        nn.init.zeros_(self.conv2.weight)
        nn.init.zeros_(self.conv2.bias)

    def forward(self, x: torch.Tensor, t_emb: torch.Tensor) -> torch.Tensor:
        h = self.conv1(F.silu(self.norm1(x)))
        # Scale + shift conditioning from time embedding
        scale, shift = self.time_proj(t_emb).chunk(2, dim=1)
        h = self.norm2(h) * (1 + scale[:, :, None, None]) + shift[:, :, None, None]
        h = self.conv2(self.dropout(F.silu(h)))
        return h + self.skip(x)


class SelfAttentionBlock(nn.Module):
    """Multi-head self-attention for spatial feature mixing."""
    def __init__(self, channels: int, num_heads: int = 8):
        super().__init__()
        self.norm = nn.GroupNorm(min(32, channels), channels)
        self.num_heads = num_heads
        head_dim = channels // num_heads
        self.scale = head_dim ** -0.5
        self.to_qkv = nn.Conv1d(channels, channels * 3, 1, bias=False)
        self.to_out = nn.Conv1d(channels, channels, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, H, W = x.shape
        h = self.norm(x).view(B, C, H * W)
        qkv = self.to_qkv(h).view(B, 3, self.num_heads, C // self.num_heads, H * W)
        q, k, v = qkv.unbind(dim=1)  # each: B, heads, head_dim, HW
        attn = torch.einsum('bhnc,bhmn->bhcm', q * self.scale, k)  # Hmm, let me redo this
        # q: B, heads, head_dim, HW  →  B, heads, HW, head_dim
        q = q.permute(0, 1, 3, 2)  # B, heads, HW, head_dim
        k = k.permute(0, 1, 3, 2)  # B, heads, HW, head_dim
        v = v.permute(0, 1, 3, 2)  # B, heads, HW, head_dim
        attn = torch.einsum('bhid,bhjd->bhij', q * self.scale, k).softmax(dim=-1)
        out = torch.einsum('bhij,bhjd->bhid', attn, v)  # B, heads, HW, head_dim
        out = out.permute(0, 1, 3, 2).reshape(B, C, H * W)  # B, C, HW
        return x + self.to_out(out).view(B, C, H, W)


class CrossAttentionBlock(nn.Module):
    """Cross-attention for text conditioning — lets the model read the prompt."""
    def __init__(self, channels: int, context_dim: int, num_heads: int = 8):
        super().__init__()
        self.norm = nn.GroupNorm(min(32, channels), channels)
        self.norm_ctx = nn.LayerNorm(context_dim)
        self.num_heads = num_heads
        head_dim = channels // num_heads
        self.scale = head_dim ** -0.5

        self.to_q = nn.Linear(channels, channels, bias=False)
        self.to_k = nn.Linear(context_dim, channels, bias=False)
        self.to_v = nn.Linear(context_dim, channels, bias=False)
        self.to_out = nn.Linear(channels, channels)

    def forward(self, x: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """
        x: (B, C, H, W) — image features
        context: (B, T, D) — text features from CLIP (T=1 for pooled, D=512)
        """
        B, C, H, W = x.shape
        # Reshape image features to sequence
        h = self.norm(x).view(B, C, H * W).permute(0, 2, 1)  # B, HW, C
        ctx = self.norm_ctx(context)                           # B, T, D

        q = self.to_q(h).view(B, H * W, self.num_heads, C // self.num_heads).permute(0, 2, 1, 3)
        k = self.to_k(ctx).view(B, -1, self.num_heads, C // self.num_heads).permute(0, 2, 1, 3)
        v = self.to_v(ctx).view(B, -1, self.num_heads, C // self.num_heads).permute(0, 2, 1, 3)

        attn = torch.einsum('bhid,bhjd->bhij', q * self.scale, k).softmax(dim=-1)
        out = torch.einsum('bhij,bhjd->bhid', attn, v)  # B, heads, HW, head_dim
        out = out.permute(0, 2, 1, 3).reshape(B, H * W, C)
        out = self.to_out(out).permute(0, 2, 1).view(B, C, H, W)
        return x + out


class Downsample(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv = nn.Conv2d(channels, channels, 3, stride=2, padding=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class Upsample(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv = nn.Conv2d(channels, channels, 3, padding=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, scale_factor=2, mode="nearest")
        return self.conv(x)


class DownBlock(nn.Module):
    """Encoder block: ResBlock + optional attention + optional downsample."""
    def __init__(self, in_ch: int, out_ch: int, time_dim: int, text_dim: int,
                 use_attention: bool, dropout: float, num_res_blocks: int, downsample: bool):
        super().__init__()
        self.resnets = nn.ModuleList([
            ResBlock(in_ch if i == 0 else out_ch, out_ch, time_dim, dropout)
            for i in range(num_res_blocks)
        ])
        self.attns = nn.ModuleList([
            nn.Sequential(SelfAttentionBlock(out_ch), ) if use_attention else nn.Identity()
            for _ in range(num_res_blocks)
        ])
        self.cross_attns = nn.ModuleList([
            CrossAttentionBlock(out_ch, text_dim) if use_attention else nn.Identity()
            for _ in range(num_res_blocks)
        ])
        self.downsample = Downsample(out_ch) if downsample else None

    def forward(self, x, t_emb, context):
        skips = []
        for res, attn, cross in zip(self.resnets, self.attns, self.cross_attns):
            x = res(x, t_emb)
            if not isinstance(attn, nn.Identity):
                x = attn[0](x)
            if not isinstance(cross, nn.Identity):
                x = cross(x, context)
            skips.append(x)
        if self.downsample is not None:
            x = self.downsample(x)
        return x, skips


class UpBlock(nn.Module):
    """Decoder block: ResBlock + optional attention + optional upsample."""
    def __init__(self, in_ch: int, skip_ch: int, out_ch: int, time_dim: int, text_dim: int,
                 use_attention: bool, dropout: float, num_res_blocks: int, upsample: bool):
        super().__init__()
        self.resnets = nn.ModuleList([
            ResBlock(in_ch + skip_ch if i == 0 else out_ch + skip_ch, out_ch, time_dim, dropout)
            for i in range(num_res_blocks)
        ])
        self.attns = nn.ModuleList([
            nn.Sequential(SelfAttentionBlock(out_ch), ) if use_attention else nn.Identity()
            for _ in range(num_res_blocks)
        ])
        self.cross_attns = nn.ModuleList([
            CrossAttentionBlock(out_ch, text_dim) if use_attention else nn.Identity()
            for _ in range(num_res_blocks)
        ])
        self.upsample = Upsample(out_ch) if upsample else None

    def forward(self, x, skips, t_emb, context):
        for res, attn, cross in zip(self.resnets, self.attns, self.cross_attns):
            skip = skips.pop()
            x = torch.cat([x, skip], dim=1)
            x = res(x, t_emb)
            if not isinstance(attn, nn.Identity):
                x = attn[0](x)
            if not isinstance(cross, nn.Identity):
                x = cross(x, context)
        if self.upsample is not None:
            x = self.upsample(x)
        return x


class UNet(nn.Module):
    """
    Text-conditioned UNet for story scene generation.

    Input:
        x:       (B, 3, H, W)  — noisy image
        t:       (B,)          — diffusion timestep
        context: (B, 1, 512)   — CLIP text embedding

    Output:
        (B, 3, H, W) — predicted noise
    """

    def __init__(
        self,
        in_channels: int = 3,
        model_channels: int = 128,
        channel_mult: Tuple[int, ...] = (1, 2, 4, 8),
        num_res_blocks: int = 2,
        attention_resolutions: List[int] = (8, 4),
        dropout: float = 0.1,
        text_embed_dim: int = 512,
        image_size: int = 64,
    ):
        super().__init__()
        self.image_size = image_size
        time_dim = model_channels * 4

        # Time embedding MLP
        self.time_embed = nn.Sequential(
            nn.Linear(model_channels, time_dim),
            nn.SiLU(),
            nn.Linear(time_dim, time_dim),
        )

        # Text projection (CLIP → UNet embedding space)
        self.text_proj = nn.Sequential(
            nn.LayerNorm(text_embed_dim),
            nn.Linear(text_embed_dim, text_embed_dim),
            nn.GELU(),
            nn.Linear(text_embed_dim, text_embed_dim),
        )

        # Initial conv
        base_ch = model_channels * channel_mult[0]
        self.conv_in = nn.Conv2d(in_channels, base_ch, 3, padding=1)

        # Encoder
        self.down_blocks = nn.ModuleList()
        ch = base_ch
        resolution = image_size
        skip_channels = []

        for i, mult in enumerate(channel_mult):
            out_ch = model_channels * mult
            use_attn = resolution in attention_resolutions
            is_last = (i == len(channel_mult) - 1)

            block = DownBlock(
                in_ch=ch, out_ch=out_ch, time_dim=time_dim, text_dim=text_embed_dim,
                use_attention=use_attn, dropout=dropout, num_res_blocks=num_res_blocks,
                downsample=not is_last,
            )
            self.down_blocks.append(block)
            skip_channels.extend([out_ch] * num_res_blocks)
            ch = out_ch
            if not is_last:
                resolution //= 2

        # Middle
        self.mid_res1 = ResBlock(ch, ch, time_dim, dropout)
        self.mid_attn = SelfAttentionBlock(ch)
        self.mid_cross = CrossAttentionBlock(ch, text_embed_dim)
        self.mid_res2 = ResBlock(ch, ch, time_dim, dropout)

        # Decoder
        self.up_blocks = nn.ModuleList()
        for i, mult in reversed(list(enumerate(channel_mult))):
            out_ch = model_channels * mult
            skip_ch = skip_channels.pop() if skip_channels else out_ch
            use_attn = resolution in attention_resolutions
            is_last = (i == 0)

            block = UpBlock(
                in_ch=ch, skip_ch=skip_ch, out_ch=out_ch, time_dim=time_dim,
                text_dim=text_embed_dim, use_attention=use_attn, dropout=dropout,
                num_res_blocks=num_res_blocks, upsample=not is_last,
            )
            self.up_blocks.append(block)
            ch = out_ch
            if not is_last:
                resolution *= 2

        # Output
        self.conv_out = nn.Sequential(
            nn.GroupNorm(min(32, ch), ch),
            nn.SiLU(),
            nn.Conv2d(ch, in_channels, 3, padding=1),
        )
        nn.init.zeros_(self.conv_out[-1].weight)
        nn.init.zeros_(self.conv_out[-1].bias)

    def forward(
        self,
        x: torch.Tensor,
        t: torch.Tensor,
        context: torch.Tensor,
    ) -> torch.Tensor:
        # Time embedding
        t_emb = sinusoidal_embedding(t, self.time_embed[0].in_features)
        t_emb = self.time_embed(t_emb)

        # Text conditioning
        ctx = self.text_proj(context)  # B, 1, text_dim

        # Encoder
        h = self.conv_in(x)
        all_skips = []
        for block in self.down_blocks:
            h, skips = block(h, t_emb, ctx)
            all_skips.extend(skips)

        # Middle
        h = self.mid_res1(h, t_emb)
        h = self.mid_attn(h)
        h = self.mid_cross(h, ctx)
        h = self.mid_res2(h, t_emb)

        # Decoder
        for block in self.up_blocks:
            # Collect the right number of skips
            n = len(block.resnets)
            skips = all_skips[-n:]
            all_skips = all_skips[:-n]
            h = block(h, skips, t_emb, ctx)

        return self.conv_out(h)


# ─────────────────────────────────────────────────────────────
# CELL 5 — DDPM Noise Scheduler
# ─────────────────────────────────────────────────────────────

class DDPMScheduler:
    """
    DDPM noise scheduler — controls the forward noising process
    and gives us the coefficients needed to reverse it.
    """

    def __init__(self, num_timesteps: int = 1000, beta_start: float = 1e-4, beta_end: float = 0.02):
        self.T = num_timesteps

        # Linear beta schedule
        betas = torch.linspace(beta_start, beta_end, num_timesteps)
        alphas = 1.0 - betas
        alphas_cumprod = torch.cumprod(alphas, dim=0)
        alphas_cumprod_prev = F.pad(alphas_cumprod[:-1], (1, 0), value=1.0)

        self.register("betas", betas)
        self.register("alphas_cumprod", alphas_cumprod)
        self.register("alphas_cumprod_prev", alphas_cumprod_prev)
        self.register("sqrt_alphas_cumprod", alphas_cumprod.sqrt())
        self.register("sqrt_one_minus_alphas_cumprod", (1.0 - alphas_cumprod).sqrt())
        self.register("log_one_minus_alphas_cumprod", (1.0 - alphas_cumprod).log())
        self.register("sqrt_recip_alphas_cumprod", (1.0 / alphas_cumprod).sqrt())
        self.register("sqrt_recipm1_alphas_cumprod", (1.0 / alphas_cumprod - 1).sqrt())

        # Posterior q(x_{t-1} | x_t, x_0)
        posterior_variance = betas * (1.0 - alphas_cumprod_prev) / (1.0 - alphas_cumprod)
        self.register("posterior_variance", posterior_variance)
        self.register("posterior_log_variance_clipped", posterior_variance.clamp(min=1e-20).log())
        self.register("posterior_mean_coef1", betas * alphas_cumprod_prev.sqrt() / (1.0 - alphas_cumprod))
        self.register("posterior_mean_coef2", (1.0 - alphas_cumprod_prev) * alphas.sqrt() / (1.0 - alphas_cumprod))

    def register(self, name, value):
        setattr(self, name, value)

    def q_sample(self, x_start: torch.Tensor, t: torch.Tensor, noise: Optional[torch.Tensor] = None):
        """Forward process: add noise to image."""
        if noise is None:
            noise = torch.randn_like(x_start)
        sqrt_alpha = self.sqrt_alphas_cumprod[t][:, None, None, None].to(x_start.device)
        sqrt_one_minus = self.sqrt_one_minus_alphas_cumprod[t][:, None, None, None].to(x_start.device)
        return sqrt_alpha * x_start + sqrt_one_minus * noise, noise

    def predict_x0(self, x_t: torch.Tensor, t: torch.Tensor, noise_pred: torch.Tensor):
        """Predict clean image from noisy image + predicted noise."""
        sqrt_recip = self.sqrt_recip_alphas_cumprod[t][:, None, None, None].to(x_t.device)
        sqrt_recip_m1 = self.sqrt_recipm1_alphas_cumprod[t][:, None, None, None].to(x_t.device)
        return sqrt_recip * x_t - sqrt_recip_m1 * noise_pred

    def p_mean_variance(self, model, x_t, t, context):
        """Get mean and variance for one denoising step."""
        noise_pred = model(x_t, t, context)
        x0_pred = self.predict_x0(x_t, t, noise_pred)
        x0_pred = x0_pred.clamp(-1, 1)

        coef1 = self.posterior_mean_coef1[t][:, None, None, None].to(x_t.device)
        coef2 = self.posterior_mean_coef2[t][:, None, None, None].to(x_t.device)
        mean = coef1 * x0_pred + coef2 * x_t
        log_var = self.posterior_log_variance_clipped[t][:, None, None, None].to(x_t.device)
        return mean, log_var

    @torch.no_grad()
    def ddim_sample(self, model, shape, context, num_steps: int = 50,
                    eta: float = 0.0, guidance_scale: float = 7.5, device: str = "cuda"):
        """
        Fast DDIM sampling — generates images in `num_steps` steps instead of 1000.
        guidance_scale: higher = more faithful to text prompt (7.5 is good default)
        """
        B = shape[0]
        x = torch.randn(shape, device=device)

        # Subset of timesteps for DDIM
        step_size = self.T // num_steps
        timesteps = list(range(0, self.T, step_size))[::-1]

        # Classifier-free guidance: need unconditional (empty) embedding
        uncond_context = torch.zeros_like(context)

        for i, t_val in enumerate(tqdm(timesteps, desc="Sampling")):
            t = torch.full((B,), t_val, device=device, dtype=torch.long)

            # Predict noise with and without conditioning
            noise_cond = model(x, t, context)
            noise_uncond = model(x, t, uncond_context)

            # Classifier-free guidance blend
            noise_pred = noise_uncond + guidance_scale * (noise_cond - noise_uncond)

            # DDIM update
            alpha_bar_t = self.alphas_cumprod[t_val]
            alpha_bar_prev = self.alphas_cumprod[timesteps[i + 1]] if i < len(timesteps) - 1 else torch.tensor(1.0)

            x0_pred = (x - (1 - alpha_bar_t).sqrt() * noise_pred) / alpha_bar_t.sqrt()
            x0_pred = x0_pred.clamp(-1, 1)

            # Direction pointing to x_t
            dir_xt = (1 - alpha_bar_prev).sqrt() * noise_pred

            x = alpha_bar_prev.sqrt() * x0_pred + dir_xt

        return x.clamp(-1, 1)


# ─────────────────────────────────────────────────────────────
# CELL 6 — Training Loop
# ─────────────────────────────────────────────────────────────

def save_samples(model, scheduler, clip_model, prompts, epoch, config):
    """Generate sample images during training to monitor progress."""
    model.eval()
    device = config["device"]

    with torch.no_grad():
        tokens = clip.tokenize(prompts, truncate=True).to(device)
        text_embs = clip_model.encode_text(tokens).float().unsqueeze(1)  # B, 1, 512

    samples = scheduler.ddim_sample(
        model=model,
        shape=(len(prompts), 3, config["image_size"], config["image_size"]),
        context=text_embs,
        num_steps=config["ddim_steps"],
        guidance_scale=7.5,
        device=device,
    )

    # Denormalize: [-1, 1] → [0, 255]
    samples = ((samples + 1) / 2).clamp(0, 1)
    samples = (samples.cpu().numpy() * 255).astype(np.uint8)
    samples = samples.transpose(0, 2, 3, 1)

    fig, axes = plt.subplots(1, len(prompts), figsize=(4 * len(prompts), 4))
    if len(prompts) == 1:
        axes = [axes]
    for ax, img, prompt in zip(axes, samples, prompts):
        ax.imshow(img)
        ax.set_title(prompt[:30], fontsize=8)
        ax.axis("off")
    plt.suptitle(f"Epoch {epoch}", fontsize=12)
    plt.tight_layout()
    plt.savefig(f"{config['checkpoint_dir']}/samples_epoch_{epoch:04d}.png", dpi=150)
    plt.close()
    print(f"  💾 Samples saved: samples_epoch_{epoch:04d}.png")
    model.train()


def train(config: dict):
    device = config["device"]
    print(f"\n🚀 Starting training on {device}")

    # Load CLIP text encoder (frozen — we only train the UNet)
    print("📦 Loading CLIP text encoder...")
    clip_model, clip_preprocess = clip.load("ViT-B/32", device=device)
    clip_model.eval()
    for p in clip_model.parameters():
        p.requires_grad_(False)
    print("✅ CLIP loaded and frozen")

    # Dataset
    manifest = download_coco(config["data_dir"], config["num_coco_images"])
    dataset = StorySceneDataset(manifest, config["image_size"], clip_model, clip_preprocess, device)
    loader = DataLoader(dataset, batch_size=config["batch_size"], shuffle=True,
                        num_workers=2, pin_memory=True, drop_last=True)
    print(f"✅ Dataset: {len(dataset)} images, {len(loader)} batches/epoch")

    # Model
    model = UNet(
        in_channels=3,
        model_channels=config["model_channels"],
        channel_mult=tuple(config["channel_mult"]),
        num_res_blocks=config["num_res_blocks"],
        attention_resolutions=config["attention_resolutions"],
        dropout=config["dropout"],
        text_embed_dim=config["text_embed_dim"],
        image_size=config["image_size"],
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"✅ UNet: {total_params:.1f}M parameters")

    # EMA, optimizer, scheduler
    ema = EMA(model, decay=config["ema_decay"])
    optimizer = torch.optim.AdamW(model.parameters(), lr=config["learning_rate"],
                                   betas=(0.9, 0.999), weight_decay=1e-4)
    lr_scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=config["num_epochs"], eta_min=1e-6
    )
    noise_scheduler = DDPMScheduler(
        num_timesteps=config["num_timesteps"],
        beta_start=config["beta_start"],
        beta_end=config["beta_end"],
    )

    # Sample prompts to monitor training progress
    sample_prompts = [
        "a beautiful forest scene at sunset",
        "a medieval castle on a hill",
        "a cozy village at night with stars",
        "a dragon flying over mountains",
    ]

    # Training
    best_loss = float("inf")
    scaler = torch.cuda.amp.GradScaler()  # Mixed precision for speed

    for epoch in range(1, config["num_epochs"] + 1):
        model.train()
        epoch_loss = 0.0

        for step, (images, text_embs) in enumerate(loader):
            images = images.to(device)
            text_embs = text_embs.to(device).unsqueeze(1)  # B, 1, 512

            # Classifier-free guidance: randomly drop text 10% of the time
            # This teaches the model to generate without text too
            if random.random() < 0.1:
                text_embs = torch.zeros_like(text_embs)

            # Sample random timesteps
            t = torch.randint(0, config["num_timesteps"], (images.shape[0],), device=device)

            # Forward diffusion: add noise
            noisy_images, noise = noise_scheduler.q_sample(images, t)

            # Predict noise with UNet (mixed precision)
            with torch.cuda.amp.autocast():
                noise_pred = model(noisy_images, t, text_embs)
                loss = F.mse_loss(noise_pred, noise)

            # Backprop
            optimizer.zero_grad()
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), config["grad_clip"])
            scaler.step(optimizer)
            scaler.update()
            ema.update()

            epoch_loss += loss.item()

            if step % 50 == 0:
                print(f"  Epoch {epoch}/{config['num_epochs']} | Step {step}/{len(loader)} | Loss: {loss.item():.4f}")

        avg_loss = epoch_loss / len(loader)
        lr_scheduler.step()
        print(f"\n📊 Epoch {epoch} complete | Avg Loss: {avg_loss:.4f} | LR: {lr_scheduler.get_last_lr()[0]:.2e}")

        # Save samples
        if epoch % config["sample_every"] == 0 or epoch == 1:
            ema.apply()
            save_samples(model, noise_scheduler, clip_model, sample_prompts, epoch, config)
            ema.restore()

        # Save checkpoint
        if epoch % config["checkpoint_every"] == 0 or avg_loss < best_loss:
            best_loss = min(best_loss, avg_loss)
            ckpt = {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "ema_shadow": ema.shadow,
                "optimizer_state_dict": optimizer.state_dict(),
                "loss": avg_loss,
                "config": config,
            }
            ckpt_path = f"{config['checkpoint_dir']}/checkpoint_epoch_{epoch:04d}.pt"
            torch.save(ckpt, ckpt_path)
            print(f"  💾 Checkpoint saved: {ckpt_path}")

    print("\n🎉 Training complete!")
    return model, ema, noise_scheduler


# ─────────────────────────────────────────────────────────────
# CELL 7 — ONNX Export
# ─────────────────────────────────────────────────────────────

def export_to_onnx(model: UNet, ema: EMA, config: dict, output_path: str = "story_gen_unet.onnx"):
    """
    Export the trained UNet to ONNX format.
    The DDIM sampling loop runs in Python — only the UNet forward pass is ONNX.
    This makes local inference very fast even on CPU.
    """
    import onnx
    import onnxruntime as ort

    device = "cpu"
    model = model.cpu()
    ema.apply()  # Use EMA weights for best quality
    model.eval()

    B = 1
    H = W = config["image_size"]

    # Dummy inputs
    dummy_x = torch.randn(B, 3, H, W)
    dummy_t = torch.randint(0, config["num_timesteps"], (B,))
    dummy_ctx = torch.randn(B, 1, config["text_embed_dim"])

    print(f"📦 Exporting UNet to ONNX: {output_path}")

    torch.onnx.export(
        model,
        (dummy_x, dummy_t, dummy_ctx),
        output_path,
        input_names=["noisy_image", "timestep", "text_context"],
        output_names=["noise_pred"],
        dynamic_axes={
            "noisy_image": {0: "batch"},
            "timestep": {0: "batch"},
            "text_context": {0: "batch"},
            "noise_pred": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
        verbose=False,
    )

    # Verify ONNX model
    import onnx
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("✅ ONNX model verified")

    # Quick inference test
    sess = ort.InferenceSession(output_path, providers=["CPUExecutionProvider"])
    out = sess.run(None, {
        "noisy_image": dummy_x.numpy(),
        "timestep": dummy_t.numpy(),
        "text_context": dummy_ctx.numpy(),
    })
    print(f"✅ ONNX inference test passed — output shape: {out[0].shape}")

    ema.restore()
    return output_path


# ─────────────────────────────────────────────────────────────
# CELL 8 — RUN EVERYTHING
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Train
    model, ema, scheduler = train(CONFIG)

    # Export to ONNX
    onnx_path = export_to_onnx(model, ema, CONFIG, output_path="story_gen_unet.onnx")

    print(f"""
╔══════════════════════════════════════════════════════╗
║         ✅ TRAINING & EXPORT COMPLETE!               ║
╠══════════════════════════════════════════════════════╣
║  ONNX model saved to: story_gen_unet.onnx           ║
║                                                      ║
║  NEXT STEPS:                                         ║
║  1. Download story_gen_unet.onnx from Colab          ║
║     (Files panel on left → right-click → Download)   ║
║  2. Also download: checkpoints/                      ║
║  3. On your PC: python app.py                        ║
╚══════════════════════════════════════════════════════╝
    """)
