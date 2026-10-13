"""
=============================================================================
  LOCAL AI SCENE ENGINE SERVICE (HTTP Server)
  Persistent microservice running 100% locally on your PC.
  Keeps the PyTorch diffusion model warm in RAM for instantaneous generation.
  Serves your Next.js website (http://localhost:3000).
=============================================================================
"""

import os
import sys
import json
import time
import re
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configure HF cache to D: drive
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = "D:/huggingface_cache"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure public/generated_scenes exists in the website project root
ROOT_DIR = Path(__file__).parent.parent
PUBLIC_SCENES_DIR = ROOT_DIR / "public" / "generated_scenes"
PUBLIC_SCENES_DIR.mkdir(parents=True, exist_ok=True)

if str(Path(__file__).parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).parent))

from scene_engine import StorySceneEngine, STYLE_PRESETS, ASPECT_RATIOS

PORT = 5055
engine: StorySceneEngine = None


class SceneRequestHandler(BaseHTTPRequestHandler):

    def _set_cors_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors_headers(200)

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            global engine
            self._set_cors_headers(200)
            res = {
                "status": "ready" if engine is not None else "initializing",
                "model": getattr(engine, "model_id", "segmind/tiny-sd"),
                "device": getattr(engine, "device", "cpu"),
                "port": PORT,
            }
            self.wfile.write(json.dumps(res).encode("utf-8"))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        if self.path == "/generate":
            global engine
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body_bytes = self.rfile.read(content_length)
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}

                prompt = data.get("prompt", "").strip()
                if not prompt:
                    self._set_cors_headers(400)
                    self.wfile.write(json.dumps({"error": "Prompt is required"}).encode("utf-8"))
                    return

                style = data.get("style", "Cinematic Film")
                aspect = data.get("aspect", "9:16 (Shorts / Reels)")
                steps = int(data.get("steps", 4))  # 4 steps optimal for DPMSolver CPU speed & crisp visual
                guidance = float(data.get("guidance", 6.0))
                seed = data.get("seed", None)
                if seed is not None:
                    seed = int(seed)

                # Initialize engine if not loaded
                if engine is None:
                    engine = StorySceneEngine()

                ts = int(time.time() * 1000)
                clean_name = re.sub(r"[^a-zA-Z0-9]", "_", prompt[:20]).strip("_") or "scene"
                filename = f"scene_{clean_name}_{ts}.png"
                output_file = PUBLIC_SCENES_DIR / filename

                t0 = time.time()
                img = engine.generate(
                    prompt=prompt,
                    style_preset=style,
                    aspect_ratio=aspect,
                    steps=steps,
                    guidance_scale=guidance,
                    seed=seed,
                    output_path=str(output_file),
                )
                elapsed = time.time() - t0

                # Return public URL accessible by Next.js
                public_url = f"/generated_scenes/{filename}"
                self._set_cors_headers(200)
                res = {
                    "success": True,
                    "imageUrl": public_url,
                    "prompt": prompt,
                    "style": style,
                    "aspect": aspect,
                    "width": img.width,
                    "height": img.height,
                    "elapsed": round(elapsed, 2),
                }
                self.wfile.write(json.dumps(res).encode("utf-8"))
            except Exception as e:
                self._set_cors_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self._set_cors_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        # Clean custom logging
        sys.stdout.write(f"[SCENE SERVICE] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()


def run_service():
    global engine
    print(f"\n=======================================================")
    print(f"🚀 Initializing Local AI Scene Engine Service on port {PORT}")
    print(f"=======================================================")
    print(f"Loading PyTorch diffusion model into RAM...")
    engine = StorySceneEngine()
    print(f"✅ Model warm and ready in RAM!")

    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, SceneRequestHandler)
    print(f"🌐 Local AI Scene Service listening at http://127.0.0.1:{PORT}")
    print(f"Ready to synthesize visuals for your website at http://localhost:3000\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Local AI Scene Service...")
        httpd.server_close()


if __name__ == "__main__":
    run_service()
