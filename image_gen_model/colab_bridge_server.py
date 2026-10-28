"""
=============================================================================
  COLAB GPU BRIDGE SERVER — Google Colab Tesla T4 Bridge
  Zero signup, 100% free Cloudflare tunnel.
  Directly serves your Next.js website (https://the-viral-desk.vercel.app)
  with your custom trained SDXL LoRA on Tesla T4 in 2-3 seconds!
=============================================================================
"""

import io
import os
import json
import time
import subprocess
import threading
import traceback
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image

COMPREHENSIVE_NEGATIVE_PROMPT = (
    "bent sword, crooked sword, warped blade, rubber sword, curved blade, duplicate blade, split blade, double blade, multiple swords, extra swords, extra arms, third arm, 3 arms, arm behind shoulder, extra hands, three hands, distorted face, smudged face, melted face, deformed eyes, crossed eyes, bad eyes, blurry face, messy face, two people, 2 characters, background people, crowd, blank background, plain background, white background, border, frame, margin, parchment, "
    "deformed hands, poorly drawn hands, mutated hands, extra fingers, missing fingers, fused fingers, too many fingers, conjoined fingers, claw hands, mangled hands, deformed wrists, disembodied hands, floating hands, disconnected hands, malformed hands, webbed fingers, broken fingers, twisted fingers, overlapping fingers, amputated hands, "
    "anatomical dissimilarity, figure dissimilarity, mutated figure, deformed body, asymmetrical body, non-human anatomy, grotesque anatomy, disproportionate body, malformed torso, extra limbs, conjoined limbs, unnatural body shape, distorted figure, "
    "three arms, extra arms, multi-armed, third arm, arm behind head, three hands, extra hands, "
    "multiple swords, extra swords, floating swords, crossed swords, multiple blades, extra weapons, "
    "distorted torso, twisted body, elongated torso, bad anatomy, grotesque proportions, deformed body, unnatural posture, warped torso, deformed figure, non-human body, "
    "duplicate person, multiple people, two characters, three characters, 3 people, multiple clones, clone duplication, totem pole, stacked characters, stacked body, double torso, second body, conjoined, "
    "multiple heads, two heads, three heads, stacked heads, vertical repetition, extra limbs, extra legs, duplicate hands, duplicate arms, "
    "floating sword, disconnected sword, hazy sword, blurry blade, double katana, translucent sword, dull blade, miniature sword, blunt blade, "
    "messy, chaotic, visual noise, grainy, noisy, haphazard, cluttered composition, debris, floating junk, distorted shapes, messy lines, "
    "rough sketch, scribbles, jittery lines, jagged edges, "
    "solid aura, metallic blob, gold clutter, yellow blob, crushed metal, crumpled fabric, "
    "mutated limbs, malformed limbs, disconnected limbs, floating limbs, "
    "bad anatomy, grotesque proportions, malformed facial features, disfigured, "
    "multiple swords, extra swords, floating swords, crossed swords, multiple blades, extra weapons, "
    "elongated torso, long torso, stretched body, unnaturally tall torso, stacked torso, double torso, accordion torso, repeating armor, ribbed armor distortion, repeating patterns, "
    "full body far away, distant tiny character, "
    "retro comic, vintage comic, western comic, comic book panel, ink hatching, crosshatching, heavy linework, woodblock print, ukiyo-e, sketch, "
    "ugly face, deformed face, bad eyes, small eyes, scars, scarred face, rough skin, weathered face, wrinkles, "
    "collaged face, pasted face, cut-and-paste face, mismatched face, photo collage, cutout head, frankenstein face, "
    "extra eyes, multi eyes, mutated eyes, duplicate eyes, crossed eyes, fused eyes, deformed iris, deformed pupils, "
    "asymmetrical face, deformed face, bad face anatomy, distorted facial features, cloned face, morbid, mutilated, "
    "blurry, bad proportions, gross proportions, unnatural body, plastic skin, deformed jaw, uncanny valley, "
    "blank background, solid color background, plain background, studio backdrop, cropped head, "
    "text, watermark, signature, username, error, "
    "low quality, worst quality, normal quality, jpeg artifacts, overexposed, underexposed, bad lighting"
)


def start_bridge(pipe=None, port=5055):
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"

    if pipe is None:
        print("⏳ Preloading SDXL Base 1.0 pipeline onto GPU...")
        from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
        pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True,
        )
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
        pipe.to(device)
        if os.path.exists("./story_scene_sdxl_lora"):
            try:
                pipe.load_lora_weights("./story_scene_sdxl_lora")
                print("✅ Loaded custom trained SDXL LoRA adapter!")
            except Exception as lora_err:
                print(f"LoRA note: {lora_err}")
        print("✅ SDXL Pipeline is ready!")

    app = Flask("ColabBridge")
    CORS(app)

    @app.route("/health", methods=["GET"])
    def bridge_health():
        try:
            gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
            return jsonify({
                "status": "ready",
                "model": "SDXL Base 1.0 + Custom Story Scene LoRA",
                "device": str(device),
                "gpu": gpu_name,
                "pipe_loaded": pipe is not None,
            })
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    @app.route("/generate", methods=["POST"])
    def bridge_generate():
        try:
            data = request.get_json(force=True, silent=True) or {}
            prompt = data.get("prompt", "").strip()
            if not prompt:
                return jsonify({"error": "Prompt is required"}), 400

            aspect = data.get("aspect", "9:16 (Shorts / Reels)")
            style = data.get("style", "Realistic / Photorealism")
            steps = max(20, int(data.get("steps", 25)))
            guidance = float(data.get("guidance", 7.5))
            seed = data.get("seed", None)
            negative_prompt = data.get("negative_prompt", "").strip() or COMPREHENSIVE_NEGATIVE_PROMPT

            has_scars = bool(re.search(r"\b(?:scars?|scarred|battle\s+scars?)\b", prompt, re.I))
            is_rough = bool(re.search(r"\b(?:ronin|samurai|rough|ruthless|weathered|battle-hardened|scarred|scars?)\b", prompt, re.I))
            if has_scars or is_rough:
                negative_prompt = re.sub(
                    r"\b(?:scars?|scarred(?:\s+face)?|body\s+scars?|rough\s+skin|weathered\s+face|aged\s+skin)\b,?\s*",
                    "",
                    negative_prompt,
                    flags=re.IGNORECASE,
                )
                negative_prompt = f"pretty boy, bishounen, clean face, flawless smooth skin, porcelain skin, baby face, feminine, gentle smile, cheerful smile, child, {negative_prompt}"

            # Optimal SDXL buckets preventing limb duplication and torso stretching
            if "9:16" in aspect:
                width, height = 832, 1216
            elif "16:9" in aspect:
                width, height = 1216, 832
            elif "4:3" in aspect:
                width, height = 1152, 896
            else:
                width, height = 1024, 1024

            try:
                from prompt_synthesizer import synthesize_scene_prompt
                full_prompt = synthesize_scene_prompt(
                    script_sentence=prompt,
                    category="Custom",
                    style_preset=style,
                    aspect_ratio="9:16" if height > width else "16:9",
                )
            except Exception:
                full_prompt = f"{prompt}, {style}" if style else prompt

            eff_negative = negative_prompt or COMPREHENSIVE_NEGATIVE_PROMPT
            if re.search(r"\b(?:scars?|scarred|battle\s+scars?)\b", prompt, re.I):
                eff_negative = re.sub(r"\b(?:scars?|scarred(?:\s+face)?|body\s+scars?)\b,?\s*", "", eff_negative, flags=re.I)

            gen = torch.Generator(device=device).manual_seed(seed) if seed is not None else None
            t0 = time.time()
            with torch.inference_mode():
                result = pipe(
                    prompt=full_prompt,
                    negative_prompt=eff_negative,
                    num_inference_steps=steps,
                    guidance_scale=guidance,
                    generator=gen,
                    height=height,
                    width=width,
                )
                img = result.images[0]

            elapsed = time.time() - t0
            print(f"🎨 Synthesized scene: '{prompt[:45]}...' in {elapsed:.2f}s")

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            return send_file(buf, mimetype="image/png")
        except Exception as e:
            err_msg = traceback.format_exc()
            print(f"Error generating scene: {err_msg}")
            return jsonify({"error": str(e), "trace": err_msg}), 500

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
                print("👉 Paste this URL into your website UI at https://the-viral-desk.vercel.app")
                print("   Your website will now synthesize all scenes using your custom LoRA in 2-3s!\n")
                break
