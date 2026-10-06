import os
import sys
import json
import time
import shutil
import hashlib
import re
import urllib.parse
import urllib.request
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_local_env():
    env_file = ROOT_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            os.environ[key] = value


load_local_env()

VIDEO_URL = os.environ.get("VIDEO_URL", "").strip()
CONTENT_CATEGORY = os.environ.get("CONTENT_CATEGORY", "Trending").strip()
JOB_ID = os.environ.get("JOB_ID", f"job_{int(time.time())}").strip()
USER_ID = os.environ.get("USER_ID", "creator").strip()
APP_URL = os.environ.get("APP_URL", "https://the-viral-desk.vercel.app").rstrip("/")

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
SHORT_CLIP_LENGTH_SECONDS = 90.0
MAX_CLOUDINARY_UPLOAD_BYTES = int(os.environ.get("CLOUDINARY_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))

CLIPS_DIR = Path("/tmp/clips")
CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def resolve_binary(name: str, windows_name=None) -> str:
    """Prefer repo-local binaries, then PATH."""
    local_name = windows_name if os.name == "nt" and windows_name else name
    local_path = ROOT_DIR / local_name
    if local_path.exists():
        return str(local_path)
    return shutil.which(local_name) or shutil.which(name) or name


YTDLP_BIN = resolve_binary("yt-dlp", "yt-dlp.exe")
FFMPEG_BIN = resolve_binary("ffmpeg", "ffmpeg.exe")
FFPROBE_BIN = resolve_binary("ffprobe", "ffprobe.exe")


def update_job_status(status="processing", progress=0, step="", clips=None, source_title="", total_duration=0, error=""):
    """Posts job progress to the app's HTTP status endpoint."""
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

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_PAT", "").strip()
GITHUB_REPO = os.environ.get("GITHUB_REPOSITORY", "Pied07/loop-automation").strip()


def cloudinary_public_id(job_id: str, filename: str) -> str:
    safe_user_id = re.sub(r"[^A-Za-z0-9_-]+", "_", USER_ID).strip("_") or "creator"
    safe_job_id = re.sub(r"[^A-Za-z0-9_-]+", "_", job_id).strip("_") or "job"
    safe_filename = re.sub(r"[^A-Za-z0-9_-]+", "_", Path(filename).stem).strip("_") or "clip"
    return f"viral_clips/{safe_user_id}/{safe_job_id}/{safe_filename}"


def upload_clips_to_cloudinary(job_id: str, clip_paths: list) -> dict:
    """Uploads video clips to Cloudinary using a server-side signed upload."""
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return {}

    url_map = {}
    for clip_path in clip_paths:
        file_size = clip_path.stat().st_size
        if file_size > MAX_CLOUDINARY_UPLOAD_BYTES:
            mb = file_size / 1024 / 1024
            max_mb = MAX_CLOUDINARY_UPLOAD_BYTES / 1024 / 1024
            raise RuntimeError(f"{clip_path.name} is {mb:.1f} MB, above the Cloudinary upload limit of {max_mb:.0f} MB.")

        public_id = cloudinary_public_id(job_id, clip_path.name)
        timestamp = str(int(time.time()))
        signed_params = {"public_id": public_id, "timestamp": timestamp}
        to_sign = "&".join(f"{key}={signed_params[key]}" for key in sorted(signed_params))
        signature = hashlib.sha1((to_sign + CLOUDINARY_API_SECRET).encode("utf-8")).hexdigest()
        boundary = f"----ViralDesk{int(time.time() * 1000)}{clip_path.stat().st_size}"

        with clip_path.open("rb") as source:
            file_bytes = source.read()

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
        parts.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{clip_path.name}"\r\n'.encode(),
            b"Content-Type: video/mp4\r\n\r\n",
            file_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ])
        body = b"".join(parts)
        request = urllib.request.Request(
            f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/video/upload",
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
        secure_url = result.get("secure_url")
        if not secure_url:
            raise RuntimeError(f"Cloudinary did not return a secure URL for {clip_path.name}.")
        url_map[clip_path.name] = secure_url
        print(f"Uploaded {clip_path.name} to Cloudinary.")
    return url_map


def upload_clips_to_github(job_id: str, title: str, clip_paths: list) -> dict:
    """Uploads clip files to a GitHub Release and returns { filename: download_url }."""
    cloudinary_urls = upload_clips_to_cloudinary(job_id, clip_paths)
    if cloudinary_urls:
        return cloudinary_urls

    url_map = {}
    tag_name = f"clips-{job_id}"
    print(f"Creating GitHub Release {tag_name} in {GITHUB_REPO}...")

    # 1. Try using GitHub CLI (gh is preinstalled on GitHub Actions runner)
    if GITHUB_TOKEN:
        try:
            env = os.environ.copy()
            env["GH_TOKEN"] = GITHUB_TOKEN
            cmd = ["gh", "release", "create", tag_name] + [str(p) for p in clip_paths] + [
                "--title", f"Clips: {title[:40]}",
                "--notes", f"Auto-generated viral vertical clips for job {job_id}",
            ]
            res = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                print("GitHub CLI release creation successful!")
                for p in clip_paths:
                    url_map[p.name] = f"https://github.com/{GITHUB_REPO}/releases/download/{tag_name}/{p.name}"
                return url_map
            else:
                print(f"gh CLI release notice: {res.stderr[:200]}")
        except Exception as e:
            print(f"Notice: gh command failed: {e}")

    # 2. Fallback to GitHub REST API directly
    if GITHUB_TOKEN:
        try:
            create_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
            req = urllib.request.Request(
                create_url,
                data=json.dumps({"tag_name": tag_name, "name": f"Clips: {title[:40]}", "body": f"Job {job_id}"}).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github.v3+json",
                    "Content-Type": "application/json",
                    "User-Agent": "ViralDesk-Runner",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as r:
                rel_data = json.loads(r.read().decode("utf-8"))
                upload_url_template = rel_data.get("upload_url", "").split("{")[0]

            for p in clip_paths:
                asset_url = f"{upload_url_template}?name={urllib.parse.quote(p.name)}"
                with open(p, "rb") as af:
                    asset_bytes = af.read()
                areq = urllib.request.Request(
                    asset_url,
                    data=asset_bytes,
                    headers={
                        "Authorization": f"Bearer {GITHUB_TOKEN}",
                        "Content-Type": "video/mp4",
                        "User-Agent": "ViralDesk-Runner",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(areq, timeout=60) as ar:
                    ar_data = json.loads(ar.read().decode("utf-8"))
                    url_map[p.name] = ar_data.get("browser_download_url") or f"https://github.com/{GITHUB_REPO}/releases/download/{tag_name}/{p.name}"

            if url_map:
                print(f"Uploaded {len(url_map)} clips via GitHub REST API.")
                return url_map
        except Exception as e:
            print(f"Notice: GitHub REST API release failed: {e}")

    raise RuntimeError("Clip upload failed. Configure Cloudinary credentials or a GitHub upload token.")


def run():
    if not VIDEO_URL:
        print("ERROR: No VIDEO_URL provided.")
        sys.exit(1)

    print(f"Starting cloud video pipeline for: {VIDEO_URL}")
    update_job_status(status="processing", progress=20, step="Downloading video in GitHub cloud...")

    timestamp = int(time.time())
    source_file = CLIPS_DIR / f"source_{timestamp}.mp4"

    # 1. Download with yt-dlp's default unauthenticated YouTube client.
    title = "Viral Video"
    total_duration = 0.0
    download_success = False
    last_error = ""

    ffmpeg_location = None
    ffmpeg_path = Path(FFMPEG_BIN)
    if ffmpeg_path.exists():
        ffmpeg_location = str(ffmpeg_path.parent)

    common_download_flags = [
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--print-json",
        "--socket-timeout", "30",
        "--retries", "5",
        "--fragment-retries", "10",
        "--extractor-retries", "5",
        "--postprocessor-args", "ffmpeg:-strict -2",
    ]
    # Check if cookies are available
    cookies_path = ROOT_DIR / "cookies.txt"
    youtube_cookies_env = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if youtube_cookies_env and not cookies_path.exists():
        try:
            cookies_path.write_text(youtube_cookies_env, encoding="utf-8")
            print("Loaded YouTube cookies from YOUTUBE_COOKIES secret.")
        except Exception as e:
            print(f"Notice: Failed to write cookies from env: {e}")

    cookies_flag = ["--cookies", str(cookies_path)] if cookies_path.exists() else []

    download_attempts = [
        {
            "name": "VisionOS + Android Client (Datacenter-safe)",
            "flags": [
                "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player-client=visionos,android",
            ],
        },
        {
            "name": "iOS + Android Client",
            "flags": [
                "-f", "bv*+ba/b/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player-client=ios,android",
            ],
        },
        {
            "name": "Android Client (single format)",
            "flags": [
                "-f", "b/18/best",
                "--extractor-args", "youtube:player-client=android",
            ],
        },
        {
            "name": "Default Client fallback",
            "flags": [
                "-f", "bv*+ba/b/best",
                "--merge-output-format", "mp4",
            ],
        },
    ]

    # Run download attempts with cookies (if available), then fallback to clean unauthenticated if rejected
    pass_rounds = [("with cookies", cookies_flag)] if cookies_flag else []
    pass_rounds.append(("unauthenticated (clean)", []))

    for round_name, current_cookies_flag in pass_rounds:
        if download_success:
            break
        print(f"--- Download round: {round_name} ---")
        for attempt in download_attempts:
            strat_name = attempt["name"]
            print(f"Attempting download with: {strat_name} ({round_name})...")
            cmd = [
                YTDLP_BIN,
                VIDEO_URL,
                "--output", str(source_file),
                "--js-runtimes", "node",
            ] + attempt["flags"] + common_download_flags + current_cookies_flag

            try:
                if source_file.exists():
                    source_file.unlink()
                for part in CLIPS_DIR.glob(f"{source_file.stem}*"):
                    try: part.unlink()
                    except: pass

                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if proc.returncode == 0 and source_file.exists() and source_file.stat().st_size > 1000:
                    for line in reversed(proc.stdout.strip().split("\n")):
                        if line.strip().startswith("{") and line.strip().endswith("}"):
                            try:
                                info = json.loads(line.strip())
                                title = info.get("title") or info.get("fulltitle") or title
                                total_duration = float(info.get("duration") or 0)
                                break
                            except (ValueError, TypeError):
                                continue
                    download_success = True
                    print(f"Download succeeded with {strat_name} ({title})")
                    break
                else:
                    last_error = proc.stderr.strip() if proc.stderr else f"yt-dlp exited with code {proc.returncode}"
                    print(f"{strat_name} failed: {last_error[:200]}")
            except Exception as e:
                last_error = str(e)
                print(f"{strat_name} error: {e}")

        if not download_success and current_cookies_flag:
            print("Notice: Cookies appear expired or rejected by YouTube. Falling back to unauthenticated mobile/VisionOS clients...")
            if cookies_path.exists():
                try: cookies_path.unlink()
                except: pass

    if not download_success:
        print(f"All download strategies failed: {last_error}")
        friendly_error = last_error
        if "bot" in last_error.lower() or "sign in to confirm" in last_error.lower():
            friendly_error = (
                "YouTube refused unauthenticated requests from the cloud runner IP. "
                "Add your YouTube cookies as a YOUTUBE_COOKIES secret in GitHub, "
                "or run the desktop worker (`npm run worker`) for zero-block residential downloads."
            )
        update_job_status(status="failed", error=f"Download failed: {friendly_error[:250]}")
        sys.exit(1)

    update_job_status(status="processing", progress=50, step="Cutting 9:16 vertical clips with FFmpeg...", source_title=title, total_duration=total_duration)

    # Probe duration if missing
    if total_duration <= 0:
        try:
            probe = subprocess.run(
                [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration", "-of",
                 "default=noprint_wrappers=1:nokey=1", str(source_file)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True,
            )
            total_duration = float(probe.stdout.strip())
        except Exception as e:
            print(f"Notice: Could not determine source duration with ffprobe: {e}")
            total_duration = 60.0

    # 2. Split with FFmpeg
    clip_length = SHORT_CLIP_LENGTH_SECONDS
    max_clips = int(os.environ.get("MAX_CLIPS", "5"))
    total_parts = min(max_clips, max(1, int(total_duration // clip_length) + (1 if total_duration % clip_length >= 3.0 else 0)))
    clips_meta = []
    created_clip_files = []
    start_time = 0.0
    part_num = 1

    while start_time < total_duration and part_num <= max_clips:
        remaining = total_duration - start_time
        duration = min(clip_length, remaining)
        if duration < 3.0: break

        clip_filename = f"clip_{timestamp}_part{part_num}.mp4"
        clip_path = CLIPS_DIR / clip_filename

        current_progress = 50 + int(((part_num - 1) / max(1, total_parts)) * 30)
        update_job_status(
            status="processing",
            progress=current_progress,
            step=f"Cutting clip {part_num} of {total_parts}...",
            source_title=title,
            total_duration=total_duration,
        )

        split_cmd = [
            FFMPEG_BIN, "-y",
            "-threads", "0",
            "-ss", str(start_time),
            "-i", str(source_file),
            "-t", str(duration),
            "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-c:a", "aac",
            "-b:a", "96k",
            "-movflags", "+faststart",
            str(clip_path)
        ]
        subprocess.run(split_cmd, check=True)

        file_size = clip_path.stat().st_size
        if file_size > MAX_CLOUDINARY_UPLOAD_BYTES:
            mb = file_size / 1024 / 1024
            max_mb = MAX_CLOUDINARY_UPLOAD_BYTES / 1024 / 1024
            raise RuntimeError(f"Generated clip part {part_num} is {mb:.1f} MB, above the {max_mb:.0f} MB Cloudinary limit.")

        created_clip_files.append(clip_path)

        hashtags = ["shorts", "viral", "trending", CONTENT_CATEGORY.lower()]
        clips_meta.append({
            "partNumber": part_num,
            "filename": clip_filename,
            "title": f"PART {part_num} | {title[:45]}",
            "description": f"📌 PART {part_num}\n{title}\n\nShared under Fair Use. Like & subscribe for more!",
            "hashtags": hashtags,
            "duration": round(duration, 2),
            "startTime": round(start_time, 2),
        })

        start_time += duration
        part_num += 1

    # 3. Upload all clips to GitHub Releases (free CDN, no Firebase required)
    storage_step = "Uploading clips to Cloudinary..." if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET else "Uploading clips to GitHub Releases..."
    update_job_status(status="processing", progress=85, step=storage_step, source_title=title, total_duration=total_duration)
    try:
        url_map = upload_clips_to_github(JOB_ID, title, created_clip_files)
    except Exception as e:
        error_message = f"Clip upload failed: {e}"
        update_job_status(status="failed", progress=85, step="Clip upload failed.", source_title=title, error=error_message)
        print(error_message)
        sys.exit(1)

    clips = []
    for meta in clips_meta:
        fname = meta["filename"]
        pub_url = url_map.get(fname, "")
        clips.append({
            "partNumber": meta["partNumber"],
            "title": meta["title"],
            "description": meta["description"],
            "hashtags": meta["hashtags"],
            "duration": meta["duration"],
            "startTime": meta["startTime"],
            "url": pub_url,
            "clipPath": pub_url,
            "publicUrl": pub_url,
            "storagePath": f"cloudinary/{USER_ID}/{JOB_ID}/{Path(fname).stem}",
            **({"cloudinaryPublicId": cloudinary_public_id(JOB_ID, fname)} if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET else {}),
        })

    # Clean up local disk
    for cp in created_clip_files:
        if cp.exists():
            cp.unlink()
    if source_file.exists():
        source_file.unlink()

    # 4. Finish job
    update_job_status(status="done", progress=100, step=f"✅ {len(clips)} clips ready!", clips=clips, source_title=title, total_duration=total_duration)
    print("SUCCESS: Pipeline complete.")


if __name__ == "__main__":
    run()
