import os
import glob
import time
import shutil
import asyncio
import subprocess
import threading
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(title="Viral Video Splitter Cloud Worker")

# Enable CORS for Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLIPS_DIR = "/app/clips"
os.makedirs(CLIPS_DIR, exist_ok=True)


# ─── Periodic Auto-Cleanup (Keeps Disk at 0 MB Forever) ──────────────────────

def background_cleanup_loop():
    """Removes any files older than 30 minutes every 10 minutes."""
    while True:
        try:
            now = time.time()
            for filepath in glob.glob(os.path.join(CLIPS_DIR, "*")):
                # Delete files older than 30 minutes (1800 seconds)
                if os.path.isfile(filepath) and (now - os.path.getmtime(filepath) > 1800):
                    try:
                        os.remove(filepath)
                        print(f"[Cleanup] Deleted stale file: {filepath}")
                    except Exception as e:
                        print(f"[Cleanup] Error deleting {filepath}: {e}")
        except Exception as err:
            print(f"[Cleanup Loop] Error: {err}")
        time.sleep(600)

cleanup_thread = threading.Thread(target=background_cleanup_loop, daemon=True)
cleanup_thread.start()


# ─── Models ─────────────────────────────────────────────────────────────────

class SplitRequest(BaseModel):
    videoUrl: str
    contentCategory: Optional[str] = "Trending"

class CleanupRequest(BaseModel):
    filename: Optional[str] = None
    filenames: Optional[List[str]] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def run_cmd(cmd: List[str]):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-400:] or "Command failed")
    return result.stdout


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/")
def health_check():
    total, used, free = shutil.disk_usage(CLIPS_DIR)
    return {
        "status": "online",
        "service": "Viral Desk Video Processing Worker",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "disk_free_gb": round(free / (1024**3), 2),
    }


@app.post("/split")
async def split_video(req: SplitRequest, request: Request):
    video_url = req.videoUrl.strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="videoUrl is required")

    timestamp = int(time.time() * 1000)
    source_path = os.path.join(CLIPS_DIR, f"source_{timestamp}.mp4")

    # 1. Download with yt-dlp
    download_cmd = [
        "yt-dlp",
        video_url,
        "--output", source_path,
        "--format", "best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best",
        "--recode-video", "mp4",
        "--no-playlist",
        "--no-warnings",
        "--print-json",
    ]
    try:
        json_out = run_cmd(download_cmd)
        import json
        info = json.loads(json_out.strip().split("\n")[-1] or "{}")
        title = info.get("title") or info.get("fulltitle") or "Viral Video"
        total_duration = float(info.get("duration") or 0)
    except Exception as e:
        # Fallback to direct HTTP download if direct .mp4 link
        try:
            import urllib.request
            urllib.request.urlretrieve(video_url, source_path)
            title = "Viral Video"
            total_duration = 0
        except Exception as inner_e:
            raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")

    # Probe duration if 0
    if total_duration <= 0:
        try:
            probe_out = run_cmd([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", source_path
            ])
            total_duration = float(probe_out.strip())
        except Exception:
            total_duration = 60.0

    # 2. Split video into clips (90s for short, 1200s for long)
    clip_length = 90.0 if total_duration < 600 else 1200.0
    clips = []
    start_time = 0.0
    part_number = 1

    base_url = str(request.base_url).rstrip("/")

    while start_time < total_duration:
        remaining = total_duration - start_time
        duration = min(clip_length, remaining)
        if duration < 3.0:
            break

        clip_filename = f"clip_{timestamp}_part{part_number}.mp4"
        clip_path = os.path.join(CLIPS_DIR, clip_filename)

        split_cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", source_path,
            "-t", str(duration),
            "-c:v", "copy",
            "-c:a", "copy",
            "-avoid_negative_ts", "make_zero",
            clip_path
        ]
        try:
            run_cmd(split_cmd)
            clips.append({
                "partNumber": part_number,
                "duration": round(duration, 2),
                "startTime": round(start_time, 2),
                "filename": clip_filename,
                "url": f"{base_url}/clips/{clip_filename}",
            })
        except Exception as err:
            print(f"Warning: Failed part {part_number}: {err}")

        start_time += duration
        part_number += 1

    # Clean up the original large source video immediately to preserve disk space!
    if os.path.exists(source_path):
        try:
            os.remove(source_path)
        except Exception:
            pass

    return {
        "success": True,
        "sourceTitle": title,
        "totalDuration": total_duration,
        "clips": clips,
    }


@app.get("/clips/{filename}")
async def get_clip(filename: str):
    # Security: prevent directory traversal
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(CLIPS_DIR, safe_filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Clip not found or expired")
    return FileResponse(filepath, media_type="video/mp4")


@app.post("/cleanup")
async def cleanup_clips(req: CleanupRequest):
    """Called after a clip is published to immediately wipe it from disk."""
    targets = []
    if req.filename:
        targets.append(req.filename)
    if req.filenames:
        targets.extend(req.filenames)

    deleted = []
    for item in targets:
        safe_name = os.path.basename(item)
        filepath = os.path.join(CLIPS_DIR, safe_name)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                deleted.append(safe_name)
            except Exception as e:
                print(f"Could not delete {safe_name}: {e}")

    return {"success": True, "deleted": deleted}
