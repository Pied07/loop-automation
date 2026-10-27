"""
=============================================================================
  LOCAL INFERENCE — Story Scene Image Generator
  Synthesizes genuine, high-quality AI images directly from story scripts.
  100% Free & Local on PC (CPU or GPU). Zero Google Colab, zero API costs.
=============================================================================

USAGE:
  py local_inference.py --prompt "An ancient stone dragon perched on mountain ruins at dawn"
  py local_inference.py --prompt "Cyberpunk detective in rainy Tokyo alley" --style "Sci-Fi Cyberpunk" --aspect "9:16 (Shorts / Reels)"
  py local_inference.py --prompt "Medieval knight in field of red flowers" --lora weights/story_scene_lora.safetensors
=============================================================================
"""

import argparse
import os
import sys
import time
from pathlib import Path

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

from scene_engine import StorySceneEngine, STYLE_PRESETS, ASPECT_RATIOS


def main():
    parser = argparse.ArgumentParser(description="Local Story Scene Image Generator")
    parser.add_argument("--prompt", type=str, required=True, help="Story scene description or narrative script")
    parser.add_argument(
        "--style",
        type=str,
        default="Realism",
        help="Cinematic or Character style preset (e.g. Realism, Anime, Disney 3D, Mecha, Dark Fantasy, Retro Comic, Cinematic Film)",
    )
    parser.add_argument(
        "--aspect",
        type=str,
        default="9:16 (Shorts / Reels)",
        choices=list(ASPECT_RATIOS.keys()),
        help="Aspect ratio (e.g. 9:16 for YouTube Shorts, 16:9 for YouTube Standard)",
    )
    parser.add_argument("--steps", type=int, default=4, help="Denoising steps (4 optimal for DPMSolver)")
    parser.add_argument("--guidance", type=float, default=6.0, help="Guidance scale")
    parser.add_argument("--lora", type=str, default=None, help="Path to trained LoRA .safetensors")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    parser.add_argument("--output", type=str, default=None, help="Explicit file path to save output image")
    parser.add_argument("--outdir", type=str, default="./generated_scenes", help="Directory to save output image")
    parser.add_argument("--colab-url", type=str, default=None, help="Google Colab GPU Bridge URL")
    parser.add_argument("--negative-prompt", type=str, default=None, help="Custom negative prompt to prevent distortion")
    parser.add_argument("--json", action="store_true", help="Output JSON result for API consumption")

    args = parser.parse_args()

    engine = StorySceneEngine(lora_path=args.lora, colab_gpu_url=args.colab_url)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        os.makedirs(args.outdir, exist_ok=True)
        ts = int(time.time() * 1000)
        out_path = Path(args.outdir) / f"scene_{ts}.png"

    t0 = time.time()
    img = engine.generate(
        prompt=args.prompt,
        style_preset=args.style,
        aspect_ratio=args.aspect,
        seed=args.seed,
        output_path=str(out_path),
        colab_gpu_url=args.colab_url,
        negative_prompt=args.negative_prompt,
    )
    elapsed = time.time() - t0

    if img is None:
        if args.json:
            import json
            print(json.dumps({
                "success": False,
                "error": "Local diffusion pipeline was unable to synthesize the scene image.",
                "elapsed": round(elapsed, 2)
            }))
        else:
            print("[ERROR] Scene could not be synthesized. Please connect Colab GPU bridge.")
        sys.exit(1)

    if args.json:
        import json
        print(json.dumps({
            "success": True,
            "imagePath": str(out_path),
            "width": img.width,
            "height": img.height,
            "elapsed": round(elapsed, 2)
        }))
    else:
        print(f"\n[SUCCESS] Generated story scene in {elapsed:.1f}s!")
        print(f"          Dimensions: {img.width}x{img.height}")
        print(f"          Saved to: {out_path}")


if __name__ == "__main__":
    main()
