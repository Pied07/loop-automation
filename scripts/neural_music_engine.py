"""
=============================================================================
  NEURAL MUSIC ENGINE — Local ML Music Generation Engine
  Synthesizes genre-conditioned music waveforms 100% from scratch with ML.
  Zero hardcoded MP3s, zero external dependencies.
=============================================================================
"""

import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

# Ensure UTF-8
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
MUSIC_MODEL_DIR = ROOT_DIR / "music_gen_model"
if str(MUSIC_MODEL_DIR) not in sys.path:
    sys.path.insert(0, str(MUSIC_MODEL_DIR))

try:
    from neural_music_composer import NeuralMusicComposer, generate_ml_music_track
except ImportError:
    from music_gen_model.neural_music_composer import NeuralMusicComposer, generate_ml_music_track


class NeuralMusicEngine:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(NeuralMusicEngine, cls).__new__(cls)
            cls._instance._composer = None
        return cls._instance

    def __init__(self):
        if self._composer is None:
            self._composer = NeuralMusicComposer()
            model_weights = ROOT_DIR / "scripts" / "models" / "neural_music_model.pt"
            if model_weights.exists():
                try:
                    import torch
                    self._composer.load_state_dict(torch.load(str(model_weights), map_location="cpu"))
                    self._composer.eval()
                    print(f"🎵 Neural Music Model loaded successfully: {model_weights.name}")
                except Exception as e:
                    print(f"Notice: Neural music weights load notice: {e}")

    def generate(
        self,
        category: str = "Interesting Facts",
        duration_seconds: float = 20.0,
        output_wav_path: Optional[str] = None,
        seed: Optional[int] = None,
        is_full_song: bool = False,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Generate background music or full vocal music track from scratch with ML.
        Returns:
            wav_path (str): path to synthesized broadcast WAV file
            meta (dict): track details (category, duration, bpm, has_vocals, instruments, mood)
        """
        cat_clean = category.strip().title()
        is_music_category = (cat_clean == "Music" or is_full_song)

        t0 = time.time()
        print(f"🎼 [ML MUSIC] Composing {'full vocal song with all instruments' if is_music_category else f'{cat_clean} background music'} from scratch...")

        wav_path, meta = generate_ml_music_track(
            category=cat_clean,
            duration_seconds=duration_seconds,
            output_wav_path=output_wav_path,
            seed=seed,
            is_full_song=is_music_category,
        )

        elapsed = time.time() - t0
        print(f"✅ [ML MUSIC] Synthesized in {elapsed:.2f}s: {meta['mood']} ({meta['bpm']} BPM, {meta['duration']}s)")
        print(f"   Instruments: {', '.join(meta['instruments'])}")
        return wav_path, meta


# Global engine instance
music_engine = NeuralMusicEngine()
