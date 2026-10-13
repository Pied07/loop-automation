"""
=============================================================================
  STORY SCENE STUDIO — Local AI Scene Generator & Trainer Web UI
  100% Free, runs locally on PC (CPU or GPU). Zero Google Colab needed.
  Generate cinematic scene visuals for YouTube scripts, train LoRA, and explore datasets.

  USAGE:
    py app.py
    Open: http://localhost:7860
=============================================================================
"""

import os
import sys
import time
from pathlib import Path
from typing import Optional, List, Tuple

# Point HF cache to D: drive
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = "D:/huggingface_cache"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import gradio as gr
from PIL import Image

from scene_engine import StorySceneEngine, STYLE_PRESETS, ASPECT_RATIOS
from dataset_manager import StorySceneDatasetManager
from train_local import train_local_lora

engine_instance: Optional[StorySceneEngine] = None


def get_engine(lora_path: Optional[str] = None) -> StorySceneEngine:
    global engine_instance
    if engine_instance is None:
        engine_instance = StorySceneEngine(lora_path=lora_path if lora_path and os.path.exists(lora_path) else None)
    elif lora_path and os.path.exists(lora_path) and lora_path != engine_instance.current_lora:
        engine_instance.load_lora(lora_path)
    return engine_instance


def ui_generate_scene(
    prompt: str,
    style_preset: str,
    aspect_ratio: str,
    lora_path: str,
    seed: int,
):
    if not prompt or not prompt.strip():
        return None, "⚠️ Please enter a story scene description or script text!"

    eff_lora = lora_path.strip() if lora_path and lora_path.strip() else None
    eff_seed = None if seed == -1 else int(seed)

    engine = get_engine(eff_lora)

    t0 = time.time()
    img = engine.generate(
        prompt=prompt.strip(),
        style_preset=style_preset,
        aspect_ratio=aspect_ratio,
        seed=eff_seed,
    )
    elapsed = time.time() - t0

    dims_text = f"{img.width}×{img.height}"
    status = f"✅ Scene synthesized in {elapsed:.1f}s ({dims_text} resolution, {style_preset} style)"
    return img, status


def ui_train_lora(epochs: int, lr: float, rank: int, samples: int, out_name: str):
    log_lines = []

    def callback(epoch, step, total_steps, loss):
        line = f"Epoch [{epoch}/{epochs}] Step [{step}/{total_steps}] — Loss: {loss:.4f}"
        log_lines.append(line)

    try:
        out_file = train_local_lora(
            epochs=int(epochs),
            lr=float(lr),
            rank=int(rank),
            max_samples=int(samples),
            save_name=out_name.strip() or "story_scene_lora.safetensors",
            log_callback=callback,
        )
        summary = f"🎉 Training Complete!\nSaved LoRA to: {out_file}\n\nRecent Steps:\n" + "\n".join(log_lines[-10:])
        return summary
    except Exception as e:
        return f"❌ Training Error: {str(e)}"


def ui_get_dataset_gallery():
    mgr = StorySceneDatasetManager()
    mgr.initialize_benchmark_dataset(force=False)
    records = mgr.load_dataset_records()

    gallery_items = []
    for r in records:
        frel = r.get("file_name", "")
        fpath = mgr.data_dir / frel if not Path(frel).is_absolute() else Path(frel)
        if not fpath.exists():
            fpath = mgr.images_dir / Path(frel).name

        if fpath.exists():
            try:
                img = Image.open(str(fpath))
                caption = f"[{r.get('genre', 'Scene')}] {r.get('text', '')[:65]}..."
                gallery_items.append((img, caption))
            except Exception:
                pass

    stats = mgr.get_stats()
    stats_text = f"📊 Total Benchmark Pairs: {stats['total_pairs']} | Genres: {', '.join(stats['genres'].keys())}"
    return gallery_items, stats_text


def create_app():
    theme = gr.themes.Soft(
        primary_hue="indigo",
        secondary_hue="purple",
    )

    with gr.Blocks(theme=theme, title="🎬 Story Scene Studio") as app:
        gr.Markdown(
            """
            # 🎬 Story Scene Studio — Local AI Scene Generator
            ### 100% Free & Local on PC | Fast Single-Step Diffusion (`stabilityai/sd-turbo`)
            Generate cinematic, narrative-driven scene visuals directly from your story scripts. Zero Google Colab required.
            """
        )

        with gr.Tabs():
            # ─────────────────────────────────────────────────────────────
            # TAB 1: SCENE GENERATOR
            # ─────────────────────────────────────────────────────────────
            with gr.Tab("🎨 Generate Scene Visual"):
                with gr.Row():
                    with gr.Column(scale=5):
                        prompt_in = gr.Textbox(
                            label="📜 Story Scene Description / Script Narration",
                            placeholder="E.g., An ancient stone dragon perched on mountain castle ruins at dawn, golden god rays, cinematic 8k...",
                            lines=3,
                        )

                        with gr.Row():
                            style_dropdown = gr.Dropdown(
                                label="🎨 Cinematic Style Preset",
                                choices=list(STYLE_PRESETS.keys()),
                                value="Cinematic Film",
                            )
                            aspect_dropdown = gr.Dropdown(
                                label="📐 Aspect Ratio",
                                choices=list(ASPECT_RATIOS.keys()),
                                value="9:16 (Shorts / Reels)",
                            )

                        with gr.Accordion("⚙️ Advanced Settings", open=False):
                            lora_input = gr.Textbox(
                                label="Custom LoRA Adapter Path (Optional)",
                                placeholder="weights/story_scene_lora.safetensors",
                                value="",
                            )
                            seed_in = gr.Number(
                                label="Seed (-1 for random)",
                                value=-1,
                                precision=0,
                            )

                        gen_btn = gr.Button("✨ Synthesize Scene Image", variant="primary", size="lg")

                    with gr.Column(scale=6):
                        img_out = gr.Image(label="Synthesized Scene Visual", type="pil")
                        status_out = gr.Markdown("")

                gr.Examples(
                    examples=[
                        ["An ancient ruined stone fortress perched high on misty mountain cliffs at sunrise, god rays", "Epic Fantasy", "9:16 (Shorts / Reels)"],
                        ["A futuristic cyberpunk metropolis at night in pouring rain with glowing neon reflections", "Sci-Fi Cyberpunk", "9:16 (Shorts / Reels)"],
                        ["Colossal Egyptian pharaoh statues flanking the desert entrance of a majestic temple at dusk", "Historical Epic", "16:9 (YouTube Standard)"],
                        ["A lone wanderer holding an amber lantern in a twisted nocturnal forest covered in supernatural mist", "Dark Mystery", "9:16 (Shorts / Reels)"],
                    ],
                    inputs=[prompt_in, style_dropdown, aspect_dropdown],
                )

                gen_btn.click(
                    fn=ui_generate_scene,
                    inputs=[prompt_in, style_dropdown, aspect_dropdown, lora_input, seed_in],
                    outputs=[img_out, status_out],
                )

            # ─────────────────────────────────────────────────────────────
            # TAB 2: LOCAL LORA TRAINER
            # ─────────────────────────────────────────────────────────────
            with gr.Tab("🧠 Train Custom Scene LoRA"):
                gr.Markdown(
                    """
                    ### 🚀 Local Scene LoRA Fine-Tuning
                    Fine-tune the model directly on your local PC using actual story scene datasets.
                    Uses pure PyTorch float32 with native LoRA adapters — **zero FP16 unscale errors or torchao bugs!**
                    """
                )
                with gr.Row():
                    with gr.Column(scale=5):
                        epochs_slider = gr.Slider(minimum=1, maximum=15, value=3, step=1, label="Epochs")
                        samples_slider = gr.Slider(minimum=2, maximum=20, value=5, step=1, label="Training Samples")
                        rank_slider = gr.Slider(minimum=2, maximum=16, value=4, step=2, label="LoRA Rank")
                        lr_num = gr.Number(value=0.0001, label="Learning Rate (AdamW)")
                        out_name_txt = gr.Textbox(value="story_scene_lora.safetensors", label="Output LoRA Filename")
                        train_btn = gr.Button("🚀 Start Local LoRA Training", variant="secondary", size="lg")

                    with gr.Column(scale=6):
                        train_status = gr.Textbox(label="Training Progress & Output Log", lines=12)

                train_btn.click(
                    fn=ui_train_lora,
                    inputs=[epochs_slider, lr_num, rank_slider, samples_slider, out_name_txt],
                    outputs=[train_status],
                )

            # ─────────────────────────────────────────────────────────────
            # TAB 3: DATASET EXPLORER
            # ─────────────────────────────────────────────────────────────
            with gr.Tab("📂 Actual Dataset Explorer"):
                gr.Markdown("### 📂 Actual Story Scene Benchmark Dataset")
                ds_stats_md = gr.Markdown("Loading dataset...")
                ds_gallery = gr.Gallery(label="Dataset Pairs", columns=3, height=500)
                refresh_ds_btn = gr.Button("🔄 Refresh Dataset View")

                refresh_ds_btn.click(
                    fn=ui_get_dataset_gallery,
                    inputs=[],
                    outputs=[ds_gallery, ds_stats_md],
                )
                app.load(
                    fn=ui_get_dataset_gallery,
                    inputs=[],
                    outputs=[ds_gallery, ds_stats_md],
                )

    return app


if __name__ == "__main__":
    demo = create_app()
    demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
