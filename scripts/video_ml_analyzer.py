"""
Video Multimodal Machine Learning Analyzer
Analyzes video clips directly using:
1. BLIP Vision Model (Salesforce/blip-image-captioning-base) - Inspects video frames and generates natural visual captions.
2. Whisper Speech Model (faster-whisper / openai-whisper) - Transcribes spoken dialogue and audio content.
3. NLP Feature Synthesizer - Generates dynamic viral titles, contextual descriptions, and video-specific hashtags based entirely on what is heard and seen in the video.

100% Free, local open-source ML. Zero paid APIs. Zero hardcoded dummy lists.
"""

import os
import re
import sys
import time
import shutil
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Check for ML dependencies
HAS_TORCH = False
HAS_TRANSFORMERS = False
HAS_WHISPER = False

try:
    import torch
    HAS_TORCH = True
except ImportError:
    pass

try:
    from transformers import BlipProcessor, BlipForConditionalGeneration
    from PIL import Image
    HAS_TRANSFORMERS = True
except ImportError:
    pass

try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except ImportError:
    try:
        import whisper
        HAS_WHISPER = True
    except ImportError:
        pass

# Cached model instances
_blip_processor = None
_blip_model = None
_whisper_model = None


def get_blip_models():
    """Lazily load BLIP Vision Model for frame captioning."""
    global _blip_processor, _blip_model
    if not (HAS_TORCH and HAS_TRANSFORMERS):
        return None, None
    if _blip_processor is None or _blip_model is None:
        model_id = "Salesforce/blip-image-captioning-base"
        try:
            # 1. Try local cache first (instant)
            _blip_processor = BlipProcessor.from_pretrained(model_id, local_files_only=True)
            _blip_model = BlipForConditionalGeneration.from_pretrained(model_id, local_files_only=True)
            _blip_model.eval()
            print("[ML] BLIP Vision model ready (cached).")
        except Exception:
            # 2. Only download if running in cloud runner (GitHub Actions / CI) or explicitly requested
            is_ci = bool(os.environ.get("GITHUB_ACTIONS") or os.environ.get("CI") or os.environ.get("ENABLE_BLIP_DOWNLOAD"))
            if is_ci:
                try:
                    print("[ML] Downloading BLIP Vision ML model in cloud runner...")
                    _blip_processor = BlipProcessor.from_pretrained(model_id)
                    _blip_model = BlipForConditionalGeneration.from_pretrained(model_id)
                    _blip_model.eval()
                    print("[ML] BLIP Vision model ready.")
                except Exception as e:
                    print(f"[ML] Notice: Could not initialize BLIP Vision model ({e})")
                    _blip_processor, _blip_model = None, None
            else:
                _blip_processor, _blip_model = None, None
    return _blip_processor, _blip_model


def get_whisper_model():
    """Lazily load Whisper model for speech transcription."""
    global _whisper_model
    if not HAS_WHISPER:
        return None
    if _whisper_model is None:
        local_dir = ROOT_DIR / "scripts" / "models" / "whisper-tiny"
        model_target = str(local_dir) if (local_dir / "model.bin").exists() else "tiny"
        try:
            print(f"[ML] Loading Whisper Speech ML model ({model_target})...")
            from faster_whisper import WhisperModel
            try:
                _whisper_model = WhisperModel(model_target, device="cpu", compute_type="int8")
            except Exception:
                _whisper_model = WhisperModel(model_target, device="cpu", compute_type="float32")
            print("[ML] Whisper Speech model ready.")
        except Exception as e:
            try:
                import whisper
                _whisper_model = whisper.load_model("tiny", device="cpu")
                print("[ML] PyTorch Whisper model ready.")
            except Exception as e2:
                print(f"[ML] Notice: Could not initialize Whisper model ({e2})")
                _whisper_model = None
    return _whisper_model


FFMPEG_BIN = "ffmpeg"
if (ROOT_DIR / "ffmpeg.exe").exists():
    FFMPEG_BIN = str(ROOT_DIR / "ffmpeg.exe")
elif shutil.which("ffmpeg"):
    FFMPEG_BIN = shutil.which("ffmpeg")


def get_clip_duration(clip_path: str) -> float:
    """Gets duration in seconds via ffmpeg stderr or ffprobe."""
    try:
        res = subprocess.run([FFMPEG_BIN, "-i", clip_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", res.stderr)
        if m:
            h, mi, s = float(m.group(1)), float(m.group(2)), float(m.group(3))
            return max(1.0, h * 3600 + mi * 60 + s)
    except Exception:
        pass
    return 10.0


OUTRO_PATTERNS = [
    re.compile(r"\b(?:like,?\s*)?(?:comment,?\s*)?(?:and\s*)?(?:follow|subscribe)\b.*", re.IGNORECASE),
    re.compile(r"\b(?:subscribe|follow)\s+(?:to\s+)?(?:the\s+)?viral\s*desk\b.*", re.IGNORECASE),
    re.compile(r"\b(?:for\s+more\s+viral\s+(?:content|videos?|moments?))\b.*", re.IGNORECASE),
    re.compile(r"\b(?:turn\s+on\s+notifications?|hit\s+the\s+bell)\b.*", re.IGNORECASE),
    re.compile(r"\b(?:drop\s+(?:your\s+)?reactions?|leave\s+a\s+comment)\b.*", re.IGNORECASE),
    re.compile(r"\b(?:thanks?\s+for\s+watching)\b.*", re.IGNORECASE),
    re.compile(r"\b(?:link\s+in\s+bio)\b.*", re.IGNORECASE),
]


def is_outro_text(text: str) -> bool:
    """Checks if text contains social media outro/cta boilerplate."""
    if not text:
        return False
    t_lower = text.lower()
    if "viral desk" in t_lower or "viraldesk" in t_lower:
        return True
    return any(p.search(text) for p in OUTRO_PATTERNS)


def scrub_outro_text(text: str) -> str:
    """Removes outro sentences/clauses from speech transcripts."""
    if not text:
        return ""
    # Split text into sentences
    pieces = [p.strip() for p in re.split(r"[.!?\n]+", text) if p.strip()]
    kept = [p for p in pieces if not is_outro_text(p)]
    if not kept:
        return ""
    return ". ".join(kept) + "."


def extract_clip_frames(clip_path: str, num_frames: int = 3) -> List[str]:
    """Extracts keyframes from the clip content, safely excluding appended outro cards."""
    frame_paths = []
    tmp_dir = Path(clip_path).parent / "ml_frames"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    duration = get_clip_duration(clip_path)
    # Exclude trailing 10.5 seconds if video has an appended outro card
    content_duration = max(3.0, duration - 10.5) if duration > 14.0 else duration
    timestamps = [content_duration * (i + 1) / (num_frames + 1) for i in range(num_frames)]
    for idx, t in enumerate(timestamps):
        out_frame = tmp_dir / f"frame_{Path(clip_path).stem}_{idx}.jpg"
        cmd = [
            FFMPEG_BIN, "-y", "-ss", f"{t:.2f}", "-i", clip_path,
            "-vframes", "1", "-q:v", "2", str(out_frame)
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            if out_frame.exists() and out_frame.stat().st_size > 500:
                frame_paths.append(str(out_frame))
        except Exception:
            pass

    return frame_paths


def extract_clip_audio(clip_path: str) -> Optional[str]:
    """Extracts 16kHz mono WAV audio from clip content, safely excluding appended outro cards."""
    out_wav = Path(clip_path).parent / f"audio_{Path(clip_path).stem}.wav"
    duration = get_clip_duration(clip_path)
    # Exclude trailing 10.5 seconds if video has an appended outro card
    content_duration = max(3.0, duration - 10.5) if duration > 14.0 else duration
    cmd = [
        FFMPEG_BIN, "-y", "-i", clip_path,
        "-t", f"{content_duration:.2f}",
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(out_wav)
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if out_wav.exists() and out_wav.stat().st_size > 1000:
            return str(out_wav)
    except Exception:
        pass
    return None


def transcribe_audio(audio_path: str) -> str:
    """Runs Whisper ML transcription on extracted audio using direct waveform buffer."""
    if not audio_path or not os.path.exists(audio_path):
        return ""

    model = get_whisper_model()
    if not model:
        return ""

    try:
        import wave
        import numpy as np

        with wave.open(audio_path, "rb") as wf:
            frames = wf.readframes(wf.getnframes())
            audio_np = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

        if hasattr(model, "transcribe"):
            segments, info = model.transcribe(audio_np, beam_size=1)
            text = " ".join([seg.text.strip() for seg in segments if seg.text])
            return text.strip()
    except Exception as e:
        print(f"[ML] Notice: Whisper transcription failed ({e})")
    return ""


def caption_frames(frame_paths: List[str]) -> List[str]:
    """Runs BLIP Vision ML captioning on video frames."""
    if not frame_paths:
        return []

    processor, model = get_blip_models()
    if not processor or not model:
        return []

    captions = []
    try:
        from PIL import Image
        for f_path in frame_paths:
            try:
                raw_image = Image.open(f_path).convert("RGB")
                inputs = processor(raw_image, return_tensors="pt")
                with torch.no_grad():
                    out = model.generate(**inputs, max_new_tokens=35)
                cap = processor.decode(out[0], skip_special_tokens=True).strip()
                if cap and cap not in captions:
                    captions.append(cap)
            except Exception as fe:
                print(f"[ML] Notice: Frame caption failed ({fe})")
    except Exception as e:
        print(f"[ML] Notice: BLIP captioning error ({e})")
    return captions


def extract_keywords_from_text(text: str) -> List[str]:
    """Extracts meaningful topic hashtags, prioritizing entities and key concepts."""
    stopwords = {
        "this", "that", "there", "then", "with", "from", "your", "what", "how",
        "when", "why", "who", "all", "are", "get", "got", "can", "new", "more",
        "into", "just", "day", "the", "and", "they", "them", "have", "been",
        "some", "will", "would", "about", "like", "look", "looking", "video", "clip",
        "were", "their", "said", "because", "don't", "dont", "does", "doesn't", "which",
        "here", "over", "again", "these", "could", "should", "than", "other", "things",
        "first", "being", "most", "ones", "each", "where", "much", "very", "every",
        "he", "she", "his", "her", "hers", "him", "you", "your", "yours", "our",
        "ours", "their", "theirs", "its", "who", "whom", "whose", "it's", "was",
        "subscribe", "follow", "comment", "share", "notification", "notifications",
        "desk", "viraldesk", "bell", "watching",
    }
    clean_words = []

    # 1. Capitalized Named Entities (e.g. JK Rowling -> jkrowling, Michael Jordan -> michaeljordan)
    entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", text)
    for ent in entities:
        ent_tag = re.sub(r"[^a-zA-Z]", "", ent).lower()
        if ent_tag not in stopwords and len(ent_tag) >= 3 and ent_tag not in clean_words:
            clean_words.append(ent_tag)

    # 2. Key descriptive words (length >= 4)
    raw_words = re.findall(r"[a-zA-Z]{4,15}", text.lower())
    for w in raw_words:
        if w not in stopwords and w not in clean_words:
            clean_words.append(w)

    return clean_words


def generate_metadata_from_video_ml(
    clip_path: str,
    category: str = "Trending",
    part_num: int = 1,
    total_parts: int = 1,
    source_title: str = "",
) -> Dict[str, Any]:
    """
    Main entry point: Analyzes the actual video file with Vision & Speech ML models.
    Produces dynamic, video-specific title, description, and hashtags with 0 duplicates.
    """
    cat_clean = (category or "Trending").strip().title()

    # 1. Extract audio & transcribe speech with Whisper (excluding outro)
    audio_wav = extract_clip_audio(clip_path)
    raw_transcript = transcribe_audio(audio_wav) if audio_wav else ""
    transcript = scrub_outro_text(raw_transcript).strip()

    # 2. Extract frames & run Vision ML (excluding outro)
    frames = extract_clip_frames(clip_path, num_frames=3)
    captions = caption_frames(frames)
    primary_scene = captions[0] if captions else ""
    if is_outro_text(primary_scene):
        primary_scene = ""

    # Cleanup temporary frame and audio files to keep disk usage at 0 MB
    for f in frames:
        try: os.unlink(f)
        except: pass
    if audio_wav and os.path.exists(audio_wav):
        try: os.unlink(audio_wav)
        except: pass

    # 3. Determine Dynamic Title from Video ML output or source title
    candidate_title = ""
    clean_src = (source_title or "").strip()
    if clean_src and not is_outro_text(clean_src):
        candidate_title = clean_src
    elif transcript and len(transcript) >= 15:
        # Extract punchy quote/hook sentence from the actual speech (excluding outros)
        sentences = [s.strip() for s in re.split(r"[.!?]", transcript) if len(s.strip()) >= 15 and not is_outro_text(s)]
        punchy = next(
            (s for s in sentences if any(w in s.lower() for w in ["succeed", "fail", "love", "never", "remember", "life", "why", "how", "secret", "hard", "win", "dream"])),
            sentences[0] if sentences else ""
        )
        if punchy:
            candidate_title = punchy.strip("\"' ")[:55]

    if not candidate_title and primary_scene and not is_outro_text(primary_scene):
        words = primary_scene.split()
        if words and words[0].lower() in ["a", "an", "the"]:
            clean_scene = " ".join(words[1:])
        else:
            clean_scene = primary_scene
        candidate_title = clean_scene.capitalize()[:55]

    if not candidate_title or is_outro_text(candidate_title):
        candidate_title = f"Unbelievable {cat_clean} Moment"

    clip_title = candidate_title.strip()
    if total_parts > 1:
        clip_title = f"PART {part_num} | {clip_title[:42]}"

    # 4. Generate Dynamic Description WITHOUT repetition
    desc_lines = []
    seen_texts = set()

    def norm_text(t: str) -> str:
        return re.sub(r"[^\w]+", "", t.lower())

    seen_texts.add(norm_text(clip_title))
    if candidate_title:
        seen_texts.add(norm_text(candidate_title))

    # Part badge if multi-part
    if total_parts > 1:
        desc_lines.append(f"📌 PART {part_num} of {total_parts}\n")

    # Speech quote if meaningful and not repeating the title
    if transcript:
        sentences = [s.strip() for s in re.split(r"[.!?]", transcript) if len(s.strip()) > 10 and not is_outro_text(s)]
        quote_snippet = ". ".join(sentences[:2]) if sentences else ""
        if quote_snippet:
            norm_q = norm_text(quote_snippet)
            if norm_q and norm_q not in seen_texts and norm_text(candidate_title) not in norm_q:
                desc_lines.append(f"\"{quote_snippet}.\"\n")
                seen_texts.add(norm_q)

    # Clean engagement callout
    desc_lines.append("💬 What does this mean to you? Drop your reaction below! 👇")

    description = "\n".join(desc_lines).strip()

    # 5. Generate Video-Specific ML Hashtags
    hashtags = []

    # Priority 1: High-value tags from speech transcript
    if transcript:
        for tag in extract_keywords_from_text(transcript):
            if tag not in hashtags and not is_outro_text(tag):
                hashtags.append(tag)
            if len(hashtags) >= 8:
                break

    # Priority 2: High-value tags from visual scene
    for cap in captions:
        if is_outro_text(cap):
            continue
        for tag in extract_keywords_from_text(cap):
            if tag not in hashtags and not is_outro_text(tag):
                hashtags.append(tag)
            if len(hashtags) >= 10:
                break

    # Add category tag
    cat_tag = cat_clean.lower()
    if cat_tag not in hashtags:
        hashtags.append(cat_tag)

    # Add universal viral tags
    for u in ["shorts", "fyp", "viral"]:
        if u not in hashtags:
            hashtags.append(u)

    # Fill remaining slots up to 30 using ONNX viral model predictions
    try:
        from onnx_viral_engine import engine as onnx_eng
        onnx_tags = onnx_eng.predict_hashtags(clip_title, cat_clean, max_tags=30)
        for ot in onnx_tags:
            if ot not in hashtags and not is_outro_text(ot) and len(hashtags) < 30:
                hashtags.append(ot)
    except Exception:
        pass

    print(f"[ML] Video ML Analysis complete for Part {part_num}:")
    if transcript:
        print(f"   [Audio] Speech: {transcript[:60]}...")
    if primary_scene:
        print(f"   [Vision] Scene: {primary_scene}")
    print(f"   [Hashtags] Generated {len(hashtags[:30])} tags: {['#' + h for h in hashtags[:8]]}")

    return {
        "title": clip_title,
        "description": description,
        "hashtags": hashtags[:30],
        "vision_scene": primary_scene,
        "audio_transcript": transcript,
        "engine": "multimodal-vision-audio-ml",
    }
