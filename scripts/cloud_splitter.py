import os
import sys
import json
import time
import urllib.request
import subprocess
from pathlib import Path

VIDEO_URL = os.environ.get("VIDEO_URL", "").strip()
CONTENT_CATEGORY = os.environ.get("CONTENT_CATEGORY", "Trending").strip()
JOB_ID = os.environ.get("JOB_ID", f"job_{int(time.time())}").strip()
USER_ID = os.environ.get("USER_ID", "guest").strip()

API_KEY = os.environ.get("FIREBASE_API_KEY", "")
PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "")

CLIPS_DIR = Path("/tmp/clips")
CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def update_job_status(status="processing", progress=0, step="", clips=None, source_title="", total_duration=0, error=""):
    """Updates the Firestore job document via Firebase REST API."""
    if not PROJECT_ID or not API_KEY:
        print(f"[Status Update] {progress}% - {step}")
        return

    fields = {
        "status": {"stringValue": status},
        "progress": {"integerValue": str(int(progress))},
        "step": {"stringValue": step},
        "updatedAt": {"stringValue": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
    }
    if error:
        fields["error"] = {"stringValue": str(error)}
    if source_title:
        fields["sourceTitle"] = {"stringValue": source_title}
    if total_duration > 0:
        fields["totalDuration"] = {"doubleValue": float(total_duration)}
    if clips:
        clip_values = []
        for c in clips:
            clip_values.append({
                "mapValue": {
                    "fields": {
                        "partNumber": {"integerValue": str(c.get("partNumber", 1))},
                        "title": {"stringValue": c.get("title", "")},
                        "description": {"stringValue": c.get("description", "")},
                        "hashtags": {"arrayValue": {"values": [{"stringValue": h} for h in c.get("hashtags", [])]}},
                        "duration": {"doubleValue": float(c.get("duration", 0))},
                        "startTime": {"doubleValue": float(c.get("startTime", 0))},
                        "clipPath": {"stringValue": c.get("url", "")},
                        "publicUrl": {"stringValue": c.get("url", "")},
                        "storagePath": {"stringValue": c.get("storagePath", "")},
                    }
                }
            })
        fields["clips"] = {"arrayValue": {"values": clip_values}}

    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/jobs/{JOB_ID}?key={API_KEY}"
    payload = json.dumps({"fields": fields}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PATCH", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception as e:
        print(f"Warning: Could not update Firestore job: {e}")


def upload_to_firebase_storage(file_path: Path, storage_name: str) -> str:
    """Uploads a clip to Firebase Storage and returns its public URL."""
    if not STORAGE_BUCKET:
        return ""
    encoded_name = urllib.parse.quote(storage_name, safe="")
    upload_url = f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o?uploadType=media&name={encoded_name}"
    
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    req = urllib.request.Request(upload_url, data=file_bytes, method="POST", headers={"Content-Type": "video/mp4"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        token = res_data.get("downloadTokens", "")
        return f"https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o/{encoded_name}?alt=media&token={token}"


def run():
    if not VIDEO_URL:
        print("ERROR: No VIDEO_URL provided.")
        sys.exit(1)

    print(f"Starting cloud video pipeline for: {VIDEO_URL}")
    update_job_status(status="processing", progress=15, step="Downloading video in GitHub cloud...")

    timestamp = int(time.time())
    source_file = CLIPS_DIR / f"source_{timestamp}.mp4"

    # 1. Download using yt-dlp
    download_cmd = [
        "yt-dlp",
        VIDEO_URL,
        "--output", str(source_file),
        "--format", "best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best",
        "--recode-video", "mp4",
        "--no-playlist",
        "--no-warnings",
        "--print-json",
    ]
    try:
        proc = subprocess.run(download_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        info = json.loads(proc.stdout.strip().split("\n")[-1] or "{}")
        title = info.get("title") or info.get("fulltitle") or "Viral Video"
        total_duration = float(info.get("duration") or 0)
    except Exception as e:
        print(f"yt-dlp failed: {e}")
        update_job_status(status="failed", error=f"Download failed: {str(e)}")
        sys.exit(1)

    update_job_status(status="processing", progress=45, step="Analyzing video and splitting clips...", source_title=title, total_duration=total_duration)

    # Probe duration if missing
    if total_duration <= 0:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(source_file)], stdout=subprocess.PIPE, text=True)
        try: total_duration = float(probe.stdout.strip())
        except Exception: total_duration = 60.0

    # 2. Split with FFmpeg
    clip_length = 90.0 if total_duration < 600 else 1200.0
    clips = []
    start_time = 0.0
    part_num = 1

    while start_time < total_duration:
        remaining = total_duration - start_time
        duration = min(clip_length, remaining)
        if duration < 3.0: break

        clip_filename = f"clip_{timestamp}_part{part_num}.mp4"
        clip_path = CLIPS_DIR / clip_filename

        split_cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", str(source_file),
            "-t", str(duration),
            "-c:v", "copy",
            "-c:a", "copy",
            "-avoid_negative_ts", "make_zero",
            str(clip_path)
        ]
        subprocess.run(split_cmd, check=True)

        # 3. Upload to Firebase Storage
        storage_dest = f"clips/{USER_ID}/{clip_filename}"
        public_url = upload_to_firebase_storage(clip_path, storage_dest)

        hashtags = ["shorts", "viral", "trending", CONTENT_CATEGORY.lower()]
        clips.append({
            "partNumber": part_num,
            "title": f"PART {part_num} | {title[:45]}",
            "description": f"📌 PART {part_num}\n{title}\n\nShared under Fair Use. Like & subscribe for more!",
            "hashtags": hashtags,
            "duration": round(duration, 2),
            "startTime": round(start_time, 2),
            "url": public_url,
            "storagePath": storage_dest,
        })

        # Remove local slice immediately
        if clip_path.exists():
            clip_path.unlink()

        start_time += duration
        part_num += 1

    # Remove source file
    if source_file.exists():
        source_file.unlink()

    # 4. Finish job in Firestore
    update_job_status(status="done", progress=100, step=f"✅ {len(clips)} clips ready!", clips=clips, source_title=title, total_duration=total_duration)
    print("SUCCESS: Pipeline complete.")


if __name__ == "__main__":
    run()
