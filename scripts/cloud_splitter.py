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
SOURCE_TITLE = os.environ.get("SOURCE_TITLE", "").strip()
JOB_ID = os.environ.get("JOB_ID", f"job_{int(time.time())}").strip()
USER_ID = os.environ.get("USER_ID", "creator").strip()
USER_EMAIL = os.environ.get("USER_EMAIL", "").strip()
APP_URL = os.environ.get("APP_URL", "https://the-viral-desk.vercel.app").rstrip("/")

CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
SHORT_CLIP_LENGTH_SECONDS = 90.0
MAX_CLOUDINARY_UPLOAD_BYTES = int(os.environ.get("CLOUDINARY_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
AUTO_PUBLISH = os.environ.get("AUTO_PUBLISH", "").strip().lower() in ("true", "1", "yes")

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

HASHTAG_BANK = {
    "Motivational": ["motivation", "mindset", "success", "inspiration", "hustle", "grind", "nevergiveup", "goals", "growth", "discipline", "bestadvice", "selfdevelopment"],
    "Funny": ["funny", "humor", "comedy", "laugh", "hilarious", "memes", "trynottolaugh", "funnyclips", "funnymoments", "fails", "jokes", "comedycentral"],
    "Comedy": ["comedy", "humor", "standup", "hilarious", "laugh", "memes", "funnyclips", "funnymoments", "jokes", "comedian", "prank", "lol"],
    "Educational": ["education", "learning", "knowledge", "facts", "didyouknow", "science", "history", "interestingfacts", "funfacts", "mindblowing", "discovery", "learnmore"],
    "Nature": ["nature", "wildlife", "earth", "beautiful", "naturelover", "outdoors", "wilderness", "animals", "landscape", "planet", "stunning", "amazingnature"],
    "Sports": ["sports", "athlete", "fitness", "training", "workout", "champions", "winning", "highlights", "sportsmotivation", "passion", "legendary", "records"],
    "Music": ["music", "viralmusic", "hiphop", "pop", "beats", "banger", "playlist", "vibe", "musiclover", "artist", "dance", "song"],
    "Gaming": ["gaming", "gamer", "gameplay", "videogames", "twitch", "gamerlife", "ps5", "xbox", "pcgaming", "clutch", "esports", "satisfying"],
    "Travel": ["travel", "explore", "adventure", "wanderlust", "vacation", "travelblogger", "beautifulplaces", "destination", "tourism", "globetrotter", "mustvisit", "trip"],
    "Food": ["food", "foodie", "delicious", "cooking", "recipe", "foodlover", "yummy", "chef", "tasty", "streetfood", "instafood", "mealprep"],
    "Fashion": ["fashion", "style", "outfit", "ootd", "streetstyle", "trendy", "fashionista", "aesthetic", "outfitinspo", "stylish", "drip", "look"],
    "Trending": ["trending", "viral", "fyp", "foryou", "explore", "shorts", "reels", "mustwatch", "viralvideo", "watchthis", "entertainment", "curiosity"],
}

UNIVERSAL_HASHTAGS = ["shorts", "viral", "trending", "foryou", "fyp", "explore", "mustwatch", "reels", "viralvideo", "watchthis"]


def clean_human_title(raw_title: str, category: str = "Trending") -> str:
    cleaned = re.sub(r"https?://\S+", "", raw_title or "")
    cleaned = re.sub(r"#[a-zA-Z0-9_]+", "", cleaned)
    cleaned = re.sub(r"\.(mp4|mov|webm|mkv|avi)$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(1080p|720p|4k|hd|uhd|full hd|official video|official audio|full episode|free download)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[_\-]+", " ", cleaned).strip()
    is_hash = bool(re.match(r"^[a-zA-Z0-9_-]{18,}$", cleaned)) or bool(re.match(r"^[0-9\s_-]+$", cleaned)) or not re.search(r"[a-zA-Z]", cleaned)
    if not cleaned or is_hash or len(cleaned) < 4:
        fallbacks = {
            "Trending": ["Wait for the ending... 😱", "The moment everything changed ⚡", "Nobody saw this coming 😳"],
            "Motivational": ["The mindset shift that changes everything 🔥", "Powerful words you need to hear today 💪", "Never give up on your vision 🎯"],
            "Funny": ["Funniest video on the internet today 😂", "Bro had zero chill 💀", "Try not to laugh challenge 😭"],
            "Comedy": ["Funniest clip you will see all day 😂", "Bro did NOT hesitate 💀", "Try not to laugh challenge 🤣"],
            "Romance": ["A love story that touches your heart ❤️", "Unspoken feelings that hit deep ✨", "When someone truly means everything 💕"],
            "Horror": ["Do not watch this alone in the dark 🌑", "Unexplained mystery caught on tape 👀", "The ending gave me chills 👻"],
            "Educational": ["Mind-blowing fact you never knew 🤯", "They never taught us this in school 🧠", "The secret history changes everything 💡"],
            "Food": ["Mouth-watering street food chef skills 🤤", "Delicious recipe everyone is craving 🍽️", "Incredible cooking masterpiece 👨‍🍳"],
            "Sports": ["Legendary athlete moment gives chills 🏆", "Nobody saw this comeback coming 😤", "Incredible sports highlight 🐐"],
            "Travel": ["Breathtaking place you must visit before you die ✈️", "Hidden paradise on Earth 🌏", "Stunning travel destination 😍"],
            "Nature": ["Incredible wildlife encounter caught on camera 🌿", "Nature never ceases to amaze 🌍", "Beautiful animal moment 🦋"],
            "Gaming": ["Insane gaming clutch broke the internet 🎮", "Epic gameplay reaction 👀", "Unbelievable play right here 💥"],
            "Music": ["This live performance gave me chills 🎵", "Viral sound that hits different 🎶", "Incredible performance right here ✨"],
        }
        cat_key = category.strip().title() if category else "Trending"
        picks = fallbacks.get(cat_key, fallbacks["Trending"])
        cleaned = picks[int(time.time()) % len(picks)]
    return re.sub(r"\s+", " ", cleaned).strip()[:80]


def generate_clip_hashtags(title: str, category: str) -> list:
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from onnx_viral_engine import get_viral_metadata
        meta = get_viral_metadata(title, category)
        if meta and meta.get("hashtags"):
            return meta["hashtags"]
    except Exception:
        pass

    cat_clean = (category or "Trending").strip().title()
    bank = HASHTAG_BANK.get(cat_clean) or HASHTAG_BANK.get("Trending", [])
    stopwords = {"this", "that", "clip", "video", "taking", "over", "part", "with", "from", "your", "what", "how", "when", "why", "who", "all", "are", "get", "got", "can", "new", "more", "into", "just", "day", "the", "and"}
    raw_words = re.findall(r"[a-zA-Z]{3,12}", title.lower())
    clean_words = [
        w for w in raw_words 
        if w not in stopwords
        and not re.search(r"[bcdfghjklmnpqrstvwxyz]{5,}", w) 
        and w not in bank 
        and w not in UNIVERSAL_HASHTAGS
    ][:4]
    extra_viral_tags = ["viralreels", "trendingnow", "instareels", "explorepage", "viralpost", "foryoupage", "contentcreator", "entertainment", "reelsvideo", "instaviral"]
    combined = []
    for tag in clean_words + bank + UNIVERSAL_HASHTAGS + extra_viral_tags:
        clean = tag.lower().replace("#", "").strip()
        if clean and clean not in combined:
            combined.append(clean)
    return combined[:30]



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
    download_success = False
    title = "Viral Video"

    # 0. Check if direct media URL (e.g. Cloudinary, TikTok CDN, TikWM, Akamai, Mixkit, Archive.org, Wikimedia, or direct MP4/video link)
    is_direct = (
        "cloudinary.com" in VIDEO_URL
        or "tiktokcdn" in VIDEO_URL
        or "tikwm.com" in VIDEO_URL
        or "akamaized.net" in VIDEO_URL
        or "mixkit.co" in VIDEO_URL
        or "archive.org" in VIDEO_URL
        or "wikimedia.org" in VIDEO_URL
        or any(VIDEO_URL.lower().split("?")[0].endswith(ext) for ext in [".mp4", ".mov", ".m4v", ".webm"])
    )
    if is_direct:
        print(f"Direct media link detected: {VIDEO_URL}")
        try:
            req = urllib.request.Request(
                VIDEO_URL,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"}
            )
            with urllib.request.urlopen(req, timeout=120) as resp, open(source_file, "wb") as out_f:
                shutil.copyfileobj(resp, out_f)
            if source_file.exists() and source_file.stat().st_size > 1000:
                download_success = True
                parsed_name = Path(urllib.parse.urlparse(VIDEO_URL).path).stem
                clean_name = re.sub(r"[_\-]+", " ", parsed_name).strip()
                if clean_name and len(clean_name) > 3 and not clean_name.isdigit():
                    title = clean_name.title()
                else:
                    title = f"Viral {CONTENT_CATEGORY} Short"
                print(f"Direct media download succeeded: {source_file} ({source_file.stat().st_size} bytes)")
        except Exception as direct_err:
            print(f"Direct download notice: {direct_err}")

    # 1. Download with yt-dlp (YouTube, TikTok, Reddit, Instagram, Twitter, etc.) if direct media wasn't downloaded
    total_duration = 0.0
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
    youtube_cookies_env = os.environ.get("YOUTUBE_COOKIES", "").strip() or os.environ.get("YOUTUBE_COOKIES_B64", "").strip()
    if youtube_cookies_env and not cookies_path.exists():
        try:
            if youtube_cookies_env.startswith("#") or "\t" in youtube_cookies_env:
                cookies_path.write_text(youtube_cookies_env, encoding="utf-8")
            else:
                import base64
                decoded = base64.b64decode(youtube_cookies_env).decode("utf-8")
                cookies_path.write_text(decoded, encoding="utf-8")
            print("Loaded YouTube cookies from env secret.")
        except Exception as e:
            print(f"Notice: Failed to write cookies from env: {e}")

    cookies_flag = ["--cookies", str(cookies_path)] if cookies_path.exists() else []

    download_attempts = [
        {
            "name": "iOS + mweb + web_embedded Client (High Success Rate)",
            "flags": [
                "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player-client=ios,mweb,web_embedded,android",
            ],
        },
        {
            "name": "VisionOS + Android Client (Datacenter-safe)",
            "flags": [
                "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player-client=visionos,android",
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

    # 2. Split with FFmpeg & merge outro
    outro_path = ROOT_DIR / "public" / "assets" / "video-outro.mp4"
    has_outro = outro_path.exists()
    if has_outro:
        print(f"🎬 Outro video detected: {outro_path} (Will append to the end of every clip)")
    else:
        print("Notice: No outro video found at public/assets/video-outro.mp4")

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
        temp_slice_path = CLIPS_DIR / f"temp_{timestamp}_part{part_num}.mp4"
        target_cut_path = temp_slice_path if has_outro else clip_path

        current_progress = 50 + int(((part_num - 1) / max(1, total_parts)) * 30)
        update_job_status(
            status="processing",
            progress=current_progress,
            step=f"Cutting and merging clip {part_num} of {total_parts}...",
            source_title=title,
            total_duration=total_duration,
        )

        # 1. Cut the segment
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
            str(target_cut_path)
        ]
        subprocess.run(split_cmd, check=True)

        final_clip_duration = duration

        # 2. Append outro if present
        if has_outro:
            print(f"Merging outro onto Part {part_num}...")
            filter_str = (
                "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];"
                "[1:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];"
                "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0];"
                "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a1];"
                "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"
            )
            merge_cmd = [
                FFMPEG_BIN, "-y",
                "-threads", "0",
                "-i", str(temp_slice_path),
                "-i", str(outro_path),
                "-filter_complex", filter_str,
                "-map", "[v]",
                "-map", "[a]",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "28",
                "-c:a", "aac",
                "-b:a", "96k",
                "-movflags", "+faststart",
                str(clip_path)
            ]
            try:
                subprocess.run(merge_cmd, check=True)
                final_clip_duration += 10.01
            except Exception as e:
                print(f"Warning: Outro merge failed ({e}), falling back to cut slice.")
                if temp_slice_path.exists():
                    shutil.move(str(temp_slice_path), str(clip_path))
            finally:
                if temp_slice_path.exists():
                    try: temp_slice_path.unlink()
                    except: pass

        file_size = clip_path.stat().st_size
        if file_size > MAX_CLOUDINARY_UPLOAD_BYTES:
            mb = file_size / 1024 / 1024
            max_mb = MAX_CLOUDINARY_UPLOAD_BYTES / 1024 / 1024
            raise RuntimeError(f"Generated clip part {part_num} is {mb:.1f} MB, above the {max_mb:.0f} MB Cloudinary limit.")

        created_clip_files.append(clip_path)

        clean_title = clean_human_title(title, CONTENT_CATEGORY)
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from video_ml_analyzer import generate_metadata_from_video_ml
            meta = generate_metadata_from_video_ml(
                clip_path=str(clip_path),
                category=CONTENT_CATEGORY,
                part_num=part_num,
                total_parts=total_parts,
                source_title=clean_title,
            )
            clip_title = meta.get("title") or (clean_title if total_parts <= 1 else f"PART {part_num} | {clean_title[:45]}")
            clip_desc = meta.get("description") or f"✨ {clean_title}"
            hashtags = meta.get("hashtags") or generate_clip_hashtags(clean_title, CONTENT_CATEGORY)
            print(f"🎬 Video ML Model generated Part {part_num} metadata: {['#' + h for h in hashtags[:6]]}")
        except Exception as ml_err:
            print(f"Notice: Video ML analyzer fallback ({ml_err})")
            try:
                from onnx_viral_engine import get_viral_metadata
                meta = get_viral_metadata(clean_title, CONTENT_CATEGORY, part_num, total_parts)
                clip_title = meta.get("title") or (clean_title if total_parts <= 1 else f"PART {part_num} | {clean_title[:45]}")
                clip_desc = meta.get("description") or f"✨ {clean_title}"
                hashtags = meta.get("hashtags") or generate_clip_hashtags(clean_title, CONTENT_CATEGORY)
            except Exception as onnx_err:
                print(f"Notice: ONNX fallback ({onnx_err})")
                hashtags = generate_clip_hashtags(clean_title, CONTENT_CATEGORY)
                is_single = total_parts <= 1
                clip_title = clean_title if is_single else f"PART {part_num} | {clean_title[:45]}"
                part_badge = "" if is_single else f"📌 PART {part_num} of {total_parts}\n\n"
                clip_desc = (
                    f"{part_badge}"
                    f"✨ {clean_title}\n\n"
                    f"💬 What are your thoughts on this? Drop a comment below!\n"
                    f"🔔 Follow & Subscribe for more daily viral clips!\n\n"
                    f"────────────────────────────\n"
                    f"Fair Use Disclaimer: This clip is curated and shared for educational, inspirational, and commentary purposes."
                )

        clips_meta.append({
            "partNumber": part_num,
            "filename": clip_filename,
            "title": clip_title,
            "description": clip_desc,
            "hashtags": hashtags,
            "duration": round(final_clip_duration, 2),
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

    # 3.5 Auto-publish clips to connected platforms if requested
    if AUTO_PUBLISH and APP_URL:
        update_job_status(status="processing", progress=92, step=f"Auto-publishing {len(clips)} clips to connected socials...", source_title=title, total_duration=total_duration)
        print(f"Auto-publishing {len(clips)} clips to {APP_URL}/api/viral-clips/publish...")
        for clip_item in clips:
            try:
                pub_payload = {
                    "clipPath": clip_item["publicUrl"] or clip_item["url"],
                    "sourceUrl": VIDEO_URL,
                    "sourceLink": VIDEO_URL,
                    "isCron": JOB_ID.startswith("cron-") or USER_ID == "auto-pilot",
                    "partNumber": clip_item["partNumber"],
                    "totalParts": len(clips),
                    "title": clip_item["title"],
                    "description": clip_item["description"],
                    "hashtags": clip_item["hashtags"],
                    "cloudinaryPublicId": clip_item.get("cloudinaryPublicId"),
                    "category": CONTENT_CATEGORY,
                    "userId": USER_ID,
                    "userEmail": USER_EMAIL,
                    "connections": ["YouTube", "Facebook", "Instagram", "Gmail"],
                }
                pub_req = urllib.request.Request(
                    f"{APP_URL}/api/viral-clips/publish",
                    data=json.dumps(pub_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "User-Agent": "ViralDesk-AutoPublisher"},
                    method="POST",
                )
                with urllib.request.urlopen(pub_req, timeout=240) as presp:
                    pdata = json.loads(presp.read().decode("utf-8"))
                    print(f"Auto-published part {clip_item['partNumber']}: {pdata.get('logs', [])}")
                    if pdata.get("youtubeVideoId"): clip_item["youtubeVideoId"] = pdata["youtubeVideoId"]
                    if pdata.get("facebookVideoId"): clip_item["facebookVideoId"] = pdata["facebookVideoId"]
                    if pdata.get("instagramVideoId"): clip_item["instagramVideoId"] = pdata["instagramVideoId"]
                    if pdata.get("youtubeUrl"): clip_item["youtubeUrl"] = pdata["youtubeUrl"]
                    if pdata.get("facebookUrl"): clip_item["facebookUrl"] = pdata["facebookUrl"]
                    if pdata.get("instagramUrl"): clip_item["instagramUrl"] = pdata["instagramUrl"]
                    if pdata.get("facebookStoryId"): clip_item["facebookStoryId"] = pdata["facebookStoryId"]
                    if pdata.get("facebookPostId"): clip_item["facebookPostId"] = pdata["facebookPostId"]
                    if pdata.get("instagramStoryId"): clip_item["instagramStoryId"] = pdata["instagramStoryId"]
            except Exception as pe:
                print(f"Notice: Auto-publish part {clip_item['partNumber']} notice: {pe}")

    # 4. Finish job
    update_job_status(status="done", progress=100, step=f"✅ {len(clips)} clips ready and published!", clips=clips, source_title=title, total_duration=total_duration)
    print("SUCCESS: Pipeline complete.")


if __name__ == "__main__":
    run()
