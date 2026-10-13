"""
=============================================================================
  COLAB GPU BRIDGE SERVER — Google Colab Tesla T4 Bridge
  Zero signup, 100% free Cloudflare tunnel.
  Directly serves your Next.js website (http://localhost:3000)
  with your custom trained SDXL LoRA on Tesla T4 in 2-3 seconds!
=============================================================================

HOW TO RUN IN GOOGLE COLAB:
1. Paste and run this script in a Colab cell:
   !pip install -q flask flask-cors
   !wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   !chmod +x cloudflared-linux-amd64
   from colab_bridge_server import start_bridge
   start_bridge(pipe)

2. Copy the printed https://....trycloudflare.com URL
3. Paste it into your website at http://localhost:3000
=============================================================================
"""

import io
import time
import subprocess
import threading
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image

def start_bridge(pipe, port=5055):
    import torch

    app = Flask("ColabBridge")
    CORS(app)

    @app.route("/health", methods=["GET"])
    def bridge_health():
        return jsonify({
            "status": "ready",
            "model": "SDXL Base 1.0 + Custom Story Scene LoRA",
            "device": "cuda" if torch.cuda.is_available() else "cpu",
            "gpu": torch.cuda.get_device_name() if torch.cuda.is_available() else "CPU",
        })

    @app.route("/generate", methods=["POST"])
    def bridge_generate():
        data = request.json or {}
        prompt = data.get("prompt", "").strip()
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400

        aspect = data.get("aspect", "9:16 (Shorts / Reels)")
        style = data.get("style", "cinematic film still, 35mm photography, dramatic atmospheric lighting, natural depth of field, 8k")
        steps = int(data.get("steps", 20))
        guidance = float(data.get("guidance", 7.5))
        seed = data.get("seed", None)

        width, height = (768, 1344) if "9:16" in aspect else ((1344, 768) if "16:9" in aspect else (1024, 1024))
        full_prompt = f"{prompt}, {style}" if style else prompt

        device = pipe.device
        gen = torch.Generator(device=device).manual_seed(seed) if seed is not None else None
        t0 = time.time()
        with torch.inference_mode():
            result = pipe(
                prompt=full_prompt,
                negative_prompt="blurry, low quality, distorted, extra limbs, bad anatomy, text, watermark",
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=gen,
                height=(height // 8) * 8,
                width=(width // 8) * 8,
            )
            img = result.images[0]

        elapsed = time.time() - t0
        print(f"🎨 Synthesized scene: '{prompt[:45]}...' in {elapsed:.2f}s")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return send_file(buf, mimetype="image/png")

    def run_server():
        app.run(port=port, host="0.0.0.0", debug=False, use_reloader=False)

    threading.Thread(target=run_server, daemon=True).start()
    time.sleep(2)

    tunnel_proc = subprocess.Popen(
        ["./cloudflared-linux-amd64", "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    print("🚀 Starting 100% Free Cloudflare GPU Bridge Tunnel...")
    for line in iter(tunnel_proc.stdout.readline, ""):
        if "trycloudflare.com" in line:
            import re
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match:
                public_gpu_url = match.group(0)
                print("\n" + "=" * 70)
                print("🔥 YOUR GOOGLE COLAB GPU BRIDGE IS LIVE!")
                print(f"🌐 Tunnel URL: {public_gpu_url}")
                print("=" * 70)
                print("👉 Paste this URL into your website UI at http://localhost:3000")
                print("   Your website will now synthesize all scenes using your custom LoRA in 2-3s!\n")
                break
