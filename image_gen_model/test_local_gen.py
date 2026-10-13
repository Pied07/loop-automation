import os
import sys

os.environ["HF_HOME"] = "D:/huggingface_cache"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import time
import torch
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler

print(f"Python: {sys.version}")
print(f"PyTorch: {torch.__version__} | Diffusers loaded")
print(f"HF Cache Location: {os.environ.get('HF_HOME')}")

device = "cpu"
model_id = "segmind/tiny-sd"

print(f"\n[+] Loading {model_id} on {device}...")
t0 = time.time()
pipe = StableDiffusionPipeline.from_pretrained(
    model_id,
    torch_dtype=torch.float32,
    safety_checker=None,
)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.to(device)
print(f"[OK] Model loaded into memory in {time.time() - t0:.1f}s")

prompt = "cinematic scene of an ancient ruined fortress on a mountain cliff at sunset, god rays, photorealistic 8k"
print(f"\n[+] Generating test scene: \"{prompt}\"")
t_gen = time.time()

# 10-15 steps with DPMSolver is fast and crisp on tiny-sd
image = pipe(
    prompt=prompt,
    num_inference_steps=12,
    guidance_scale=7.0,
    height=512,
    width=512,
).images[0]

elapsed = time.time() - t_gen
print(f"[OK] Scene generated in {elapsed:.1f}s!")

os.makedirs("./test_output", exist_ok=True)
out_file = "./test_output/test_scene.png"
image.save(out_file)
print(f"[SAVED] Saved test scene image to: {os.path.abspath(out_file)}")
