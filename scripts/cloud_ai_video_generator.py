import os
import sys
import json
import time
import hashlib
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

# Add project root and scripts directory to Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / "scripts"))

from scripts.ai_video_engine import AIVideoEngine

# 1. Read environment variables
JOB_ID = os.environ.get("JOB_ID", f"ai_{int(time.time())}").strip()
CATEGORY = os.environ.get("CATEGORY", "Interesting Facts").strip()
CUSTOM_TAG = os.environ.get("CUSTOM_TAG", "").strip()
PROMPT = os.environ.get("PROMPT", "").strip()
SCRIPT = os.environ.get("SCRIPT", "").strip()
VOICE = os.environ.get("VOICE", "en-US-ChristopherNeural").strip()
NUM_IMAGES = int(os.environ.get("NUM_IMAGES", "3"))
DURATION = int(os.environ.get("DURATION", "20"))
NUM_PARTS = int(os.environ.get("NUM_PARTS", "1"))
PART_NUMBER = int(os.environ.get("PART_NUMBER", "1"))
USER_ID = os.environ.get("USER_ID", "creator").strip()
USER_EMAIL = os.environ.get("USER_EMAIL", "").strip()
APP_URL = os.environ.get("APP_URL", "https://the-viral-desk.vercel.app").rstrip("/")

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
AUTO_PUBLISH = os.environ.get("AUTO_PUBLISH", "false").strip().lower() in ("true", "1", "yes")
PLATFORMS_RAW = os.environ.get("PLATFORMS", "").strip()
SCENE_IMAGES = os.environ.get("SCENE_IMAGES", "").strip()
COLAB_GPU_URL = os.environ.get("COLAB_GPU_URL", "").strip()
STYLE_PRESET = os.environ.get("STYLE_PRESET", "Realism").strip()
CAPTION_STYLE = os.environ.get("CAPTION_STYLE", "viral_yellow").strip()
ANIMATION_STYLE = os.environ.get("ANIMATION_STYLE", "ken_burns").strip()
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PAT", "").strip()
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "Pied07/loop-automation").strip()

WORK_DIR = Path("/tmp/ai_video_work")
WORK_DIR.mkdir(parents=True, exist_ok=True)


def update_status(status="processing", progress=0, step="", clips=None, source_title="", error=""):
    """Reports progress to Next.js /api/viral-clips/status with retries and exponential backoff."""
    if not APP_URL:
        return
    payload = {
        "jobId": JOB_ID,
        "userId": USER_ID,
        "partNumber": PART_NUMBER,
        "totalParts": NUM_PARTS,
        "status": status,
        "progress": int(progress),
        "step": step,
        "clips": clips,
        "sourceTitle": source_title or None,
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
                print(f"✅ Status reported successfully: {step} ({progress}%)")
                return
        except Exception as e:
            wait_sec = 2 ** attempt
            print(f"Notice: Status reporting attempt {attempt + 1}/{max_retries} ({step}): {e}")
            if attempt < max_retries - 1:
                time.sleep(wait_sec)


def publish_github_release(job_id: str, title: str, clips: list):
    """Publishes a GitHub Release tagged clips-{JOB_ID} with the completed clips payload."""
    if not GITHUB_TOKEN:
        print("Notice: GITHUB_TOKEN not provided, skipping GitHub release creation.")
        return
    tag_name = f"clips-{job_id}"
    release_payload = {
        "jobId": job_id,
        "userId": USER_ID,
        "partNumber": PART_NUMBER,
        "totalParts": NUM_PARTS,
        "status": "done",
        "progress": 100,
        "step": f"✅ Part {PART_NUMBER} generated successfully!",
        "clips": clips,
        "sourceTitle": title,
        "updatedAt": int(time.time() * 1000),
    }
    body_str = json.dumps(release_payload)
    print(f"Creating GitHub Release {tag_name} in {GITHUB_REPO}...")

    # 1. Try using GitHub CLI (gh is preinstalled on GitHub Actions runner)
    try:
        cmd = [
            "gh", "release", "create", tag_name,
            "--title", f"AI Video: {title[:40]}",
            "--notes", body_str,
        ]
        res = subprocess.run(cmd, env={**os.environ, "GH_TOKEN": GITHUB_TOKEN}, capture_output=True, text=True)
        if res.returncode == 0:
            print(f"✅ GitHub CLI release {tag_name} created successfully!")
            return
        else:
            print(f"gh CLI release notice: {res.stderr[:200]}")
    except Exception as e:
        print(f"Notice: gh command failed: {e}")

    # 2. Fallback to GitHub REST API directly
    try:
        create_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
        req = urllib.request.Request(
            create_url,
            data=json.dumps({"tag_name": tag_name, "name": f"AI Video: {title[:40]}", "body": body_str}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "The-Viral-Desk-Runner",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"✅ Published GitHub Release {tag_name} via REST API")
    except Exception as e:
        print(f"Notice: Release publication notice: {e}")


def upload_file_to_cloudinary(file_path: Path, public_id: str, resource_type: str = "video") -> str:
    """Signed multipart upload to Cloudinary."""
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return ""

    timestamp = str(int(time.time()))
    signed_params = {"public_id": public_id, "timestamp": timestamp}
    to_sign = "&".join(f"{k}={signed_params[k]}" for k in sorted(signed_params))
    signature = hashlib.sha1((to_sign + CLOUDINARY_API_SECRET).encode("utf-8")).hexdigest()

    boundary = f"----CloudAIVideo{int(time.time() * 1000)}{file_path.stat().st_size}"
    with file_path.open("rb") as f:
        file_bytes = f.read()

    fields = {
        "api_key": CLOUDINARY_API_KEY,
        "timestamp": timestamp,
        "public_id": public_id,
        "signature": signature,
    }

    parts = []
    for name, value in fields.items():
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode("utf-8"),
            b"\r\n",
        ])

    mime = "video/mp4" if resource_type == "video" else "image/jpeg"
    parts.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        file_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])

    body = b"".join(parts)
    request = urllib.request.Request(
        f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/{resource_type}/upload",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
            "User-Agent": "The-Viral-Desk-Runner",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.loads(response.read().decode("utf-8"))
    return result.get("secure_url") or result.get("url") or ""


def run():
    print("=========================================================")
    print("      🚀 CLOUD AI VIDEO GENERATOR (GITHUB ACTIONS)        ")
    print("=========================================================")
    print(f"Job ID:      {JOB_ID}")
    print(f"Category:    {CATEGORY}")
    print(f"Duration:    {DURATION}s (Parts: {PART_NUMBER}/{NUM_PARTS})")
    print(f"App URL:     {APP_URL}")
    print("=========================================================\n")

    update_status(status="processing", progress=15, step="Cloud AI video generator started on GitHub Actions...")

    try:
        # 1. Initialize engine and generate full video
        engine = AIVideoEngine()
        update_status(status="processing", progress=35, step="Synthesizing neural voice & rendering scene visuals...")

        result = engine.generate(
            category=CATEGORY,
            custom_tag=CUSTOM_TAG,
            prompt=PROMPT,
            script=SCRIPT,
            voice=VOICE,
            num_images=NUM_IMAGES,
            duration=DURATION,
            num_parts=NUM_PARTS,
            part_number=PART_NUMBER,
            output_dir=str(WORK_DIR),
            scene_images=SCENE_IMAGES,
            colab_gpu_url=COLAB_GPU_URL,
            style_preset=STYLE_PRESET,
            caption_style=CAPTION_STYLE,
            animation_style=ANIMATION_STYLE,
        )

        if not result.get("success") or not result.get("videoPath"):
            raise RuntimeError(result.get("error") or "AI Video generation produced no video.")

        video_path = Path(result["videoPath"])
        thumb_path = Path(result["thumbnailPath"]) if result.get("thumbnailPath") else None

        print(f"✅ Video rendered successfully: {video_path} ({video_path.stat().st_size} bytes)")

        # 2. Upload video and thumbnail to Cloudinary
        update_status(status="processing", progress=80, step="Uploading video & thumbnail to Cloudinary...")

        safe_user_id = re.sub(r"[^A-Za-z0-9_-]+", "_", USER_ID).strip("_") or "creator"
        safe_job_id = re.sub(r"[^A-Za-z0-9_-]+", "_", JOB_ID).strip("_") or "job"
        clip_public_id = f"ai_videos/{safe_user_id}/{safe_job_id}"
        thumb_public_id = f"ai_thumbs/{safe_user_id}/{safe_job_id}"

        video_url = upload_file_to_cloudinary(video_path, clip_public_id, "video")
        thumb_url = upload_file_to_cloudinary(thumb_path, thumb_public_id, "image") if (thumb_path and thumb_path.exists()) else ""

        print(f"Cloudinary Video URL:     {video_url}")
        print(f"Cloudinary Thumbnail URL: {thumb_url}")

        clip_item = {
            "id": JOB_ID,
            "partNumber": PART_NUMBER,
            "totalParts": NUM_PARTS,
            "title": result["title"],
            "description": result.get("description", ""),
            "hashtags": result.get("hashtags", []),
            "duration": result.get("duration", DURATION),
            "url": video_url,
            "clipPath": video_url,
            "publicUrl": video_url,
            "videoUrl": video_url,
            "cloudinaryUrl": video_url,
            "thumbnailUrl": thumb_url,
            "cloudinaryPublicId": clip_public_id,
            "format": CATEGORY,
            "isAiVideo": True,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        # 3. Auto-publish if requested
        if AUTO_PUBLISH and APP_URL and video_url:
            update_status(status="processing", progress=92, step="Auto-publishing AI video to connected platforms...", source_title=result["title"])
            try:
                active_platforms = ["YouTube", "Facebook", "Instagram", "Gmail"]
                platform_map = {
                    "youtube": "YouTube",
                    "facebook": "Facebook",
                    "instagram": "Instagram",
                    "gmail": "Gmail",
                }
                if PLATFORMS_RAW:
                    try:
                        p_obj = json.loads(PLATFORMS_RAW)
                        if isinstance(p_obj, dict):
                            parsed_plats = [platform_map.get(str(k).lower(), str(k).capitalize()) for k, v in p_obj.items() if v]
                            if parsed_plats:
                                active_platforms = parsed_plats
                    except:
                        pass

                pub_payload = {
                    "clipId": JOB_ID,
                    "clipPath": video_url,
                    "partNumber": PART_NUMBER,
                    "totalParts": NUM_PARTS,
                    "title": result["title"],
                    "description": result.get("description", ""),
                    "hashtags": result.get("hashtags", []),
                    "platforms": active_platforms,
                    "userId": USER_ID,
                    "userEmail": USER_EMAIL,
                    "connections": active_platforms,
                    "cloudinaryPublicId": clip_public_id,
                    "format": CATEGORY,
                    "category": CATEGORY,
                    "isAiVideo": True,
                    "thumbnailUrl": thumb_url,
                    "duration": result.get("duration", DURATION),
                }

                pub_req = urllib.request.Request(
                    f"{APP_URL}/api/viral-clips/publish",
                    data=json.dumps(pub_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "ViralDesk-AIPublisher"},
                    method="POST",
                )
                with urllib.request.urlopen(pub_req, timeout=240) as presp:
                    pdata = json.loads(presp.read().decode("utf-8"))
                    print(f"Auto-publish result: {pdata.get('logs', [])}")
            except Exception as pe:
                print(f"Notice: Auto-publish notice: {pe}")

        # 4. Mark Job Complete & Publish Release
        publish_github_release(JOB_ID, result["title"], [clip_item])
        update_status(
            status="done",
            progress=100,
            step=f"✅ Part {PART_NUMBER} generated successfully!",
            clips=[clip_item],
            source_title=result["title"],
        )
        print("🎉 SUCCESS: AI Video generation complete.")

    except Exception as e:
        print(f"❌ Error during generation: {e}")
        update_status(status="failed", progress=0, step="Generation failed.", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    run()
