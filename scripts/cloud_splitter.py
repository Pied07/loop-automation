import os
import sys
import json
import time
import urllib.parse
import urllib.request
import subprocess
from pathlib import Path

VIDEO_URL = os.environ.get("VIDEO_URL", "").strip()
CONTENT_CATEGORY = os.environ.get("CONTENT_CATEGORY", "Trending").strip()
JOB_ID = os.environ.get("JOB_ID", f"job_{int(time.time())}").strip()
USER_ID = os.environ.get("USER_ID", "creator").strip()
APP_URL = os.environ.get("APP_URL", "https://the-viral-desk.vercel.app").rstrip("/")

API_KEY = os.environ.get("FIREBASE_API_KEY", "")
PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "")
STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "")

CLIPS_DIR = Path("/tmp/clips")
CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def update_job_status(status="processing", progress=0, step="", clips=None, source_title="", total_duration=0, error=""):
    """Updates job status on both Vercel API and Firestore."""
    payload_data = {
        "jobId": JOB_ID,
        "status": status,
        "progress": int(progress),
        "step": step,
        "sourceTitle": source_title or None,
        "totalDuration": total_duration or None,
        "clips": clips or None,
        "error": error or None,
    }

    # 1. Update Vercel Job Status Cache via HTTP
    if APP_URL:
        try:
            req = urllib.request.Request(
                f"{APP_URL}/api/viral-clips/status",
                data=json.dumps(payload_data).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "The-Viral-Desk-Runner"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                pass
        except Exception as e:
            print(f"Notice: Could not post status to {APP_URL}: {e}")

    # 2. Update Firestore document (if configured)
    if PROJECT_ID and API_KEY:
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

        fs_url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/jobs/{JOB_ID}?key={API_KEY}"
        try:
            fs_req = urllib.request.Request(
                fs_url,
                data=json.dumps({"fields": fields}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PATCH",
            )
            with urllib.request.urlopen(fs_req, timeout=10) as resp:
                pass
        except Exception as e:
            print(f"Notice: Firestore direct update: {e}")


def upload_to_firebase_storage(file_path: Path, storage_name: str) -> str:
    """Uploads a clip to Firebase Storage and returns its public URL."""
    if not STORAGE_BUCKET:
        print("Warning: No STORAGE_BUCKET configured.")
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
    update_job_status(status="processing", progress=20, step="Downloading video in GitHub cloud...")

    timestamp = int(time.time())
    source_file = CLIPS_DIR / f"source_{timestamp}.mp4"

    # 1. Download using yt-dlp with Proof-of-Origin Token provider and anti-bot clients
    clients_to_try = ["web", "mweb", "android", "tv", "ios"]
    title = "Viral Video"
    total_duration = 0.0
    download_success = False
    last_error = ""
    cookie_file = Path("cookies.txt")

    for client in clients_to_try:
        print(f"Attempting download with player_client={client}...")
        download_cmd = [
            "yt-dlp",
            VIDEO_URL,
            "--output", str(source_file),
            "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
            "--recode-video", "mp4",
            "--no-playlist",
            "--no-warnings",
            "--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
            "--extractor-args", f"youtube:player-client={client}",
            "--print-json",
        ]

        if cookie_file.exists() and cookie_file.stat().st_size > 10:
            download_cmd.extend(["--cookies", str(cookie_file)])

        try:
            proc = subprocess.run(download_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc.returncode == 0 and source_file.exists() and source_file.stat().st_size > 1000:
                try:
                    for line in reversed(proc.stdout.strip().split("\n")):
                        if line.strip().startswith("{") and line.strip().endswith("}"):
                            info = json.loads(line.strip())
                            title = info.get("title") or info.get("fulltitle") or "Viral Video"
                            total_duration = float(info.get("duration") or 0)
                            break
                except Exception:
                    pass
                download_success = True
                print(f"Download succeeded with client={client}: {title}")
                break
            else:
                last_error = proc.stderr.strip() if proc.stderr else f"Exit code {proc.returncode}"
                print(f"Client {client} failed: {last_error[:200]}")
        except Exception as e:
            last_error = str(e)
            print(f"Client {client} exception: {e}")

    if not download_success:
        # Final fallback: generic download with simple format
        print("Attempting single-format fallback...")
        try:
            fallback_cmd = [
                "yt-dlp",
                VIDEO_URL,
                "--output", str(source_file),
                "-f", "b/best",
                "--no-playlist",
                "--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
            ]
            if cookie_file.exists() and cookie_file.stat().st_size > 10:
                fallback_cmd.extend(["--cookies", str(cookie_file)])
            proc2 = subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if proc2.returncode == 0 and source_file.exists() and source_file.stat().st_size > 1000:
                download_success = True
                print("Single-format fallback succeeded!")
            else:
                if proc2.stderr:
                    err_lines = [l for l in proc2.stderr.splitlines() if "ERROR:" in l]
                    if err_lines:
                        last_error = err_lines[0]
                    else:
                        last_error = proc2.stderr.strip()[:250]
        except Exception as fe:
            last_error = str(fe)

    if not download_success:
        print(f"All download attempts failed: {last_error}")
        friendly_error = last_error
        if "confirm you’re not a bot" in last_error or "bot" in last_error.lower():
            friendly_error = "YouTube bot detection triggered. Add YOUTUBE_COOKIES secret to GitHub repo to authenticate."
        update_job_status(status="failed", error=f"Download failed: {friendly_error[:200]}")
        sys.exit(1)

    update_job_status(status="processing", progress=50, step="Cutting 9:16 vertical clips with FFmpeg...", source_title=title, total_duration=total_duration)

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

        # Remove local slice immediately to keep disk at 0 MB
        if clip_path.exists():
            clip_path.unlink()

        start_time += duration
        part_num += 1

    # Remove source file
    if source_file.exists():
        source_file.unlink()

    # 4. Finish job
    update_job_status(status="done", progress=100, step=f"✅ {len(clips)} clips ready!", clips=clips, source_title=title, total_duration=total_duration)
    print("SUCCESS: Pipeline complete.")


if __name__ == "__main__":
    run()
