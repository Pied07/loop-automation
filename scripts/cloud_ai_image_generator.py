#!/usr/bin/env python3
"""
=============================================================================
  CLOUD AI IMAGE GENERATOR — GitHub Actions Native ML Image Runner
  Synthesizes high-fidelity AI images using your native PyTorch model & LoRA weights.
  Dispatched autonomously by the web app with status reporting & Cloudinary/GitHub publishing.
=============================================================================
"""

import os
import sys
import json
import time
import hashlib
import re
import urllib.parse
import urllib.request
import base64
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "image_gen_model"))

# Environment parameters
JOB_ID = os.environ.get("JOB_ID", f"img_{int(time.time())}").strip()
PROMPT = os.environ.get("PROMPT", "").strip()
STYLE = os.environ.get("STYLE", "Cinematic Film").strip()
ASPECT = os.environ.get("ASPECT", "9:16 (Shorts / Reels)").strip()
STEPS = int(os.environ.get("STEPS", "20"))
SEED_RAW = os.environ.get("SEED", "").strip()
SEED = int(SEED_RAW) if SEED_RAW.isdigit() else None
NEGATIVE_PROMPT = os.environ.get("NEGATIVE_PROMPT", "").strip()
IS_DIRECT_PROMPT = os.environ.get("IS_DIRECT_PROMPT", "true").lower() in ("true", "1", "yes")
CATEGORY = os.environ.get("CATEGORY", "Custom").strip()
USER_ID = os.environ.get("USER_ID", "creator").strip()
APP_URL = os.environ.get("APP_URL", "https://the-viral-desk.vercel.app").rstrip("/")

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PAT", "").strip()
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "Pied07/loop-automation").strip()

WORK_DIR = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "ai_image_work"
WORK_DIR.mkdir(parents=True, exist_ok=True)


def update_status(status="processing", progress=0, step="", image_url=None, error=""):
    """Reports status to Next.js /api/viral-clips/status."""
    if not APP_URL:
        return
    payload = {
        "jobId": JOB_ID,
        "userId": USER_ID,
        "status": status,
        "progress": int(progress),
        "step": step,
        "imageUrl": image_url,
        "clips": [{"url": image_url, "imageUrl": image_url, "id": JOB_ID}] if image_url else None,
        "sourceTitle": PROMPT[:60] if PROMPT else "AI Generated Image",
        "error": error or None,
    }
    max_retries = 4 if status in ("done", "failed") else 2
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                f"{APP_URL}/api/viral-clips/status",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "The-Viral-Desk-Runner"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                print(f"✅ Status reported: {step} ({progress}%)")
                return
        except Exception as e:
            wait_sec = 2 ** attempt
            print(f"Notice: Status update attempt {attempt + 1}/{max_retries}: {e}")
            if attempt < max_retries - 1:
                time.sleep(wait_sec)


# Cloudinary upload removed per user specifications:
# "dont save in cloudinary if user doesnt download the image it will be lost as simple as that no saving in cloudinary"


def publish_github_release(job_id: str, title: str, image_url: str):
    """Publishes a GitHub Release tagged clips-{JOB_ID} with the completed image payload."""
    if not GITHUB_TOKEN:
        print("Notice: GITHUB_TOKEN not provided, skipping GitHub release creation.")
        return
    tag_name = f"clips-{job_id}"
    release_payload = {
        "jobId": job_id,
        "userId": USER_ID,
        "status": "done",
        "progress": 100,
        "step": "✅ Image generated successfully by your native ML model!",
        "imageUrl": image_url,
        "clips": [{"url": image_url, "imageUrl": image_url, "id": job_id}],
        "sourceTitle": title,
    }
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases",
            data=json.dumps({
                "tag_name": tag_name,
                "name": f"AI Image: {title[:40]}",
                "body": json.dumps(release_payload),
                "draft": false if False else False,
                "prerelease": False,
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "The-Viral-Desk-Runner",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"✅ Published GitHub Release: {tag_name}")
    except Exception as e:
        print(f"Notice: GitHub release publication warning: {e}")


def main():
    print(f"🚀 Starting Cloud Native ML Image Generator for Job: {JOB_ID}")
    print(f"   Prompt: {PROMPT}")
    print(f"   Style: {STYLE} | Aspect: {ASPECT} | Steps: {STEPS}")

    update_status(status="processing", progress=20, step="GitHub Actions runner active. Initializing native ML pipeline...")

    t0 = time.time()
    out_file = WORK_DIR / f"{JOB_ID}.png"

    try:
        from scene_engine import StorySceneEngine
        lora_file = ROOT_DIR / "image_gen_model" / "weights" / "story_scene_lora.safetensors"
        lora_path = str(lora_file) if lora_file.exists() else None

        engine = StorySceneEngine(lora_path=lora_path)
        update_status(status="processing", progress=45, step="Synthesizing visual scene with native ML diffusion model...")

        img = engine.generate(
            prompt=PROMPT,
            style_preset=STYLE,
            aspect_ratio=ASPECT,
            steps=STEPS,
            seed=SEED,
            output_path=str(out_file),
            category=CATEGORY,
            negative_prompt=NEGATIVE_PROMPT or None,
        )

        if img is not None and not out_file.exists():
            img.save(str(out_file), quality=95)

        if not out_file.exists():
            raise RuntimeError("ML model completed without outputting an image file.")

        # Apply Gemini-style brand watermark (light colored, semi-transparent)
        try:
            from scripts.watermark_engine import watermark_file
            watermark_file(out_file, output_path=out_file, watermark_style="gemini", position="bottom-right")
            print("🎨 Applied Gemini-style translucent watermark to generated image.")
        except Exception as we:
            print(f"Notice: Watermark overlay notice: {we}")

        elapsed = round(time.time() - t0, 2)
        print(f"✅ Native ML Image generated in {elapsed}s: {out_file.stat().st_size} bytes")

        update_status(status="processing", progress=85, step="Image rendered! Encoding direct output data...")

        # Direct Base64 Data URI delivery — NO Cloudinary saving per user specifications:
        # "dont save in cloudinary if user doesnt download the image it will be lost as simple as that no saving in cloudinary"
        with out_file.open("rb") as f:
            b64_data = base64.b64encode(f.read()).decode("utf-8")
        final_image_url = f"data:image/png;base64,{b64_data}"
        print("✅ Converted image to Base64 Data URI for direct delivery (No Cloudinary).")

        # 3. Publish release and status done
        publish_github_release(JOB_ID, PROMPT, final_image_url)
        update_status(
            status="done",
            progress=100,
            step=f"✅ Image generated in {elapsed}s by your native ML model!",
            image_url=final_image_url,
        )
        print(f"🎉 Complete! Job {JOB_ID} finished successfully.")

    except Exception as err:
        err_msg = str(err)
        print(f"❌ Error during cloud image generation: {err_msg}")
        update_status(status="failed", progress=0, step="Failed", error=err_msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
