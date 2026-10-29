"""
=============================================================================
  THE VIRAL DESK — Watermark Engine
  Applies sleek, professional brand watermarks to AI-generated images & scene frames.
  Supports multiple styles (frosted glass pill, clean light, compact monogram, original),
  responsive scaling across 9:16 vertical shorts, 16:9 widescreen, and 1:1 squares,
  and configurable corner positioning.
=============================================================================
"""

import os
from pathlib import Path
from typing import Optional, Union, Tuple
from PIL import Image, ImageEnhance

WATERMARKS_DIR = Path(__file__).resolve().parent / "assets"
PUBLIC_ASSETS_DIR = Path(__file__).resolve().parent.parent / "public" / "assets"


def get_watermark_path(style: str = "gemini_accent") -> Path:
    """Finds the watermark asset file across candidate asset directories."""
    style_filenames = {
        "gemini_accent": "watermark_gemini_accent.png",
        "gemini": "watermark_gemini_accent.png",
        "default": "watermark_gemini_accent.png",
        "accent": "watermark_gemini_accent.png",
        "gemini_white": "watermark_gemini_white.png",
        "white": "watermark_gemini_white.png",
        "clean": "watermark_gemini_white.png",
        "light": "watermark_gemini_accent.png",
        "pill": "watermark_pill.png",
        "frosted": "watermark_pill.png",
        "glass": "watermark_pill.png",
        "badge": "watermark_pill.png",
        "compact": "watermark_gemini_compact.png",
        "icon": "watermark_gemini_compact.png",
        "tvd": "watermark_gemini_compact.png",
        "original": "watermark_original.png",
        "dark": "watermark_original.png",
    }
    filename = style_filenames.get(style.lower(), "watermark_gemini_accent.png")

    candidates = [
        WATERMARKS_DIR / filename,
        PUBLIC_ASSETS_DIR / filename,
        WATERMARKS_DIR / "watermark_gemini_accent.png",
        PUBLIC_ASSETS_DIR / "watermark_gemini_accent.png",
        WATERMARKS_DIR / "watermark_gemini.png",
        PUBLIC_ASSETS_DIR / "watermark_gemini.png",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


def apply_watermark(
    base_image: Image.Image,
    watermark_style: str = "gemini_accent",
    position: str = "bottom-right",
    opacity: float = 0.88,
    scale: float = 0.16,
    margin_ratio: float = 0.03,
) -> Image.Image:
    """
    Overlays The Viral Desk watermark onto an image.

    Args:
        base_image: PIL Image (RGB or RGBA)
        watermark_style: 'pill' (frosted capsule, recommended), 'light', 'compact', or 'original'
        position: 'bottom-right', 'top-right', 'bottom-left', 'top-left', 'bottom-center'
        opacity: 0.1 to 1.0 alpha blend strength
        scale: Watermark width as a fraction of image width (default: 20% width)
        margin_ratio: Margin as a fraction of image width (default: 3% from edge)

    Returns:
        New PIL Image with the watermark beautifully blended.
    """
    if base_image is None:
        return base_image

    orig_mode = base_image.mode
    canvas = base_image.convert("RGBA")
    img_w, img_h = canvas.size

    wm_path = get_watermark_path(watermark_style)
    if not wm_path.exists():
        # Fallback if file missing
        return base_image

    wm_img = Image.open(wm_path).convert("RGBA")

    # Calculate proportional target size
    target_wm_w = max(90, min(int(img_w * scale), int(img_h * 0.35)))
    aspect = wm_img.height / max(1, wm_img.width)
    target_wm_h = int(target_wm_w * aspect)

    # High quality resize
    wm_resized = wm_img.resize((target_wm_w, target_wm_h), Image.Resampling.LANCZOS)

    # Adjust overall opacity
    if opacity < 0.99:
        alpha = wm_resized.split()[3]
        alpha = ImageEnhance.Brightness(alpha).enhance(max(0.05, min(1.0, opacity)))
        wm_resized.putalpha(alpha)

    # Calculate positioning with margin
    margin_x = int(img_w * margin_ratio)
    margin_y = int(img_h * margin_ratio)

    pos_lower = position.lower()
    if "top" in pos_lower and "left" in pos_lower:
        x, y = margin_x, margin_y
    elif "top" in pos_lower and ("right" in pos_lower or "end" in pos_lower):
        x, y = img_w - target_wm_w - margin_x, margin_y
    elif "bottom" in pos_lower and "left" in pos_lower:
        x, y = margin_x, img_h - target_wm_h - margin_y
    elif "bottom" in pos_lower and "center" in pos_lower:
        x, y = (img_w - target_wm_w) // 2, img_h - target_wm_h - margin_y
    else:  # default 'bottom-right'
        x, y = img_w - target_wm_w - margin_x, img_h - target_wm_h - margin_y

    # Composite onto canvas
    canvas.alpha_composite(wm_resized, (x, y))

    if orig_mode != "RGBA":
        return canvas.convert(orig_mode)
    return canvas


def watermark_file(
    file_path: Union[str, Path],
    output_path: Optional[Union[str, Path]] = None,
    watermark_style: str = "gemini_accent",
    position: str = "bottom-right",
    opacity: float = 0.88,
) -> Path:
    """Convenience helper to watermark an image file directly on disk."""
    fpath = Path(file_path)
    out_p = Path(output_path) if output_path else fpath

    with Image.open(fpath) as img:
        watermarked = apply_watermark(
            img,
            watermark_style=watermark_style,
            position=position,
            opacity=opacity,
        )
        out_p.parent.mkdir(parents=True, exist_ok=True)
        fmt = "JPEG" if out_p.suffix.lower() in [".jpg", ".jpeg"] else "PNG"
        if fmt == "JPEG" and watermarked.mode in ("RGBA", "P"):
            watermarked = watermarked.convert("RGB")
        watermarked.save(str(out_p), format=fmt, quality=95)

    return out_p
