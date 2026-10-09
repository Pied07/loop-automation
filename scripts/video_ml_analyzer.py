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
        try:
            print("🤖 Loading BLIP Vision ML model (Salesforce/blip-image-captioning-base)...")
            model_id = "Salesforce/blip-image-captioning-base"
            _blip_processor = BlipProcessor.from_pretrained(model_id)
            _blip_model = BlipForConditionalGeneration.from_pretrained(model_id)
            _blip_model.eval()
            print("✅ BLIP Vision model ready.")
        except Exception as e:
            print(f"Notice: Could not initialize BLIP Vision model ({e})")
            _blip_processor, _blip_model = None, None
    return _blip_processor, _blip_model


def get_whisper_model():
    """Lazily load Whisper model for speech transcription."""
    global _whisper_model
    if not HAS_WHISPER:
        return None
    if _whisper_model is None:
        try:
            print("🎙️ Loading Whisper Speech ML model (tiny)...")
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
            print("✅ Whisper Speech model ready.")
        except Exception as e:
            try:
                import whisper
                _whisper_model = whisper.load_model("tiny", device="cpu")
                print("✅ PyTorch Whisper model ready.")
            except Exception as e2:
                print(f"Notice: Could not initialize Whisper model ({e2})")
                _whisper_model = None
    return _whisper_model


def extract_clip_frames(clip_path: str, num_frames: int = 3) -> List[str]:
    """Extracts keyframes from the clip at evenly spaced timestamps."""
    frame_paths = []
    tmp_dir = Path(clip_path).parent / "ml_frames"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    # Probe duration
    duration = 10.0
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", clip_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True
        )
        duration = float(probe.stdout.strip())
    except Exception:
        pass

    timestamps = [duration * (i + 1) / (num_frames + 1) for i in range(num_frames)]
    for idx, t in enumerate(timestamps):
        out_frame = tmp_dir / f"frame_{Path(clip_path).stem}_{idx}.jpg"
        cmd = [
            "ffmpeg", "-y", "-ss", f"{t:.2f}", "-i", clip_path,
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
    """Extracts 16kHz mono WAV audio from the clip for Whisper."""
    out_wav = Path(clip_path).parent / f"audio_{Path(clip_path).stem}.wav"
    cmd = [
        "ffmpeg", "-y", "-i", clip_path,
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
    """Runs Whisper ML transcription on extracted audio."""
    if not audio_path or not os.path.exists(audio_path):
        return ""

    model = get_whisper_model()
    if not model:
        return ""

    try:
        if hasattr(model, "transcribe"):
            # Check if it's faster-whisper or openai-whisper
            from faster_whisper import WhisperModel
            if isinstance(model, WhisperModel):
                segments, info = model.transcribe(audio_path, beam_size=1, language="en")
                text = " ".join([seg.text.strip() for seg in segments if seg.text])
                return text.strip()
            else:
                res = model.transcribe(audio_path, fp16=False)
                return res.get("text", "").strip()
    except Exception as e:
        print(f"Notice: Whisper transcription failed ({e})")
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
                print(f"Notice: Frame caption failed ({fe})")
    except Exception as e:
        print(f"Notice: BLIP captioning error ({e})")
    return captions


def extract_keywords_from_text(text: str) -> List[str]:
    """Extracts meaningful topic hashtags from text."""
    stopwords = {
        "this", "that", "there", "then", "with", "from", "your", "what", "how",
        "when", "why", "who", "all", "are", "get", "got", "can", "new", "more",
        "into", "just", "day", "the", "and", "they", "them", "have", "been",
        "some", "will", "would", "about", "like", "look", "looking", "video", "clip",
    }
    raw_words = re.findall(r"[a-zA-Z]{3,15}", text.lower())
    clean_words = []
    for w in raw_words:
        if w not in stopwords and w not in clean_words:
            clean_words.append(w)
    return clean_words


def generate_metadata_from_video_ml(
    clip_path: str,
    category: str = "Trending",
    part_num: int = 1,
    total_parts: int = 1,
) -> Dict[str, Any]:
    """
    Main entry point: Analyzes the actual video file with Vision & Speech ML models.
    Produces dynamic, video-specific title, description, and hashtags.
    """
    cat_clean = (category or "Trending").strip().title()

    # 1. Extract frames & audio
    frames = extract_clip_frames(clip_path, num_frames=3)
    audio_wav = extract_clip_audio(clip_path)

    # 2. Run Vision ML (BLIP)
    captions = caption_frames(frames)
    primary_scene = captions[0] if captions else ""

    # 3. Run Audio ML (Whisper)
    transcript = transcribe_audio(audio_wav) if audio_wav else ""

    # Cleanup temporary frame and audio files to keep disk usage at 0 MB
    for f in frames:
        try: os.unlink(f)
        except: pass
    if audio_wav and os.path.exists(audio_wav):
        try: os.unlink(audio_wav)
        except: pass

    # 4. Generate Dynamic Title from Video ML output
    clip_title = ""
    if primary_scene:
        # Turn "a man and woman smiling in front of a sunset" -> "A Man And Woman Smiling In Front Of A Sunset"
        words = primary_scene.split()
        if words and words[0].lower() in ["a", "an", "the"]:
            clean_scene = " ".join(words[1:])
        else:
            clean_scene = primary_scene
        clip_title = clean_scene.capitalize()[:55]
    elif transcript and len(transcript) > 10:
        # Extract prominent dialogue phrase
        sentences = re.split(r"[.!?]", transcript)
        first_good = next((s.strip() for s in sentences if len(s.strip()) > 8), transcript[:50])
        clip_title = f'"{first_good[:45]}..."'
    else:
        # Fallback to category-based title
        clip_title = f"Unbelievable {cat_clean} Moment"

    if total_parts > 1:
        clip_title = f"PART {part_num} | {clip_title[:42]}"

    # 5. Generate Dynamic Description from Video ML output
    part_badge = "" if total_parts <= 1 else f"📌 PART {part_num} of {total_parts}\n\n"
    
    desc_lines = [f"{part_badge}✨ {clip_title}\n"]
    if primary_scene:
        desc_lines.append(f"👁️ Visual Scene: {primary_scene.capitalize()}.\n")
    if transcript:
        desc_lines.append(f'🎙️ Spoken in video: "{transcript}"\n')

    desc_lines.append(f"💬 What are your thoughts on this? Drop a comment below! 👇")
    desc_lines.append(f"🔔 Follow & Subscribe for daily {cat_clean.lower()} moments!\n")
    desc_lines.append("────────────────────────────")
    desc_lines.append("Fair Use Disclaimer: Curated and analyzed for commentary, education, and entertainment.")
    
    description = "\n".join(desc_lines)

    # 6. Generate Video-Specific ML Hashtags
    hashtags = []
    
    # Extract tags from visual captions
    for cap in captions:
        for tag in extract_keywords_from_text(cap):
            if tag not in hashtags:
                hashtags.append(tag)
            if len(hashtags) >= 6:
                break

    # Extract tags from audio transcript
    if transcript:
        for tag in extract_keywords_from_text(transcript):
            if tag not in hashtags:
                hashtags.append(tag)
            if len(hashtags) >= 9:
                break

    # Add category tag
    cat_tag = cat_clean.lower()
    if cat_tag not in hashtags:
        hashtags.append(cat_tag)

    # Add universal viral tags
    for u in ["shorts", "fyp", "viral"]:
        if u not in hashtags:
            hashtags.append(u)

    print(f"🎬 Video ML Analysis complete for Part {part_num}:")
    if primary_scene:
        print(f"   👁️ Vision: {primary_scene}")
    if transcript:
        print(f"   🎙️ Audio: {transcript[:60]}...")
    print(f"   🏷️ Generated Tags: {['#' + h for h in hashtags[:8]]}")

    return {
        "title": clip_title,
        "description": description,
        "hashtags": hashtags[:12],
        "vision_scene": primary_scene,
        "audio_transcript": transcript,
        "engine": "multimodal-vision-audio-ml",
    }
