import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LOCAL_DAEMON_URL = "http://127.0.0.1:5055";

const COMPREHENSIVE_NEGATIVE_PROMPT =
  "collaged face, pasted face, cut-and-paste face, mismatched face, photo collage, cutout head, frankenstein face, " +
  "extra eyes, multi eyes, mutated eyes, duplicate eyes, crossed eyes, fused eyes, deformed iris, deformed pupils, " +
  "asymmetrical face, deformed face, bad face anatomy, distorted facial features, cloned face, morbid, mutilated, " +
  "extra limbs, missing limbs, malformed limbs, floating limbs, disconnected limbs, extra fingers, missing fingers, " +
  "fused fingers, too many fingers, deformed hands, poorly drawn hands, poorly drawn face, mutation, deformed, " +
  "blurry, bad proportions, gross proportions, unnatural body, plastic skin, deformed jaw, multiple heads, uncanny valley, " +
  "close-up, headshot, portrait, passport photo, mugshot, ID photo, centered face, static pose, " +
  "blank background, solid color background, plain background, studio backdrop, cropped head, " +
  "text, watermark, signature, username, error, " +
  "low quality, worst quality, normal quality, jpeg artifacts, overexposed, underexposed, bad lighting";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    const style = typeof body.style === "string" ? body.style : "Cinematic Film";
    const aspect = typeof body.aspect === "string" ? body.aspect : "9:16 (Shorts / Reels)";
    const steps = typeof body.steps === "number" ? Math.max(1, Math.min(20, body.steps)) : 4;
    const seed = typeof body.seed === "number" ? body.seed : undefined;
    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : 0;
    const partNumber = typeof body.partNumber === "number" ? body.partNumber : 1;
    const colabGpuUrl = typeof body.colabGpuUrl === "string" ? body.colabGpuUrl.trim() : "";
    const negativePrompt = typeof body.negativePrompt === "string" && body.negativePrompt.trim()
      ? body.negativePrompt.trim()
      : COMPREHENSIVE_NEGATIVE_PROMPT;

    // 1. Try Live Colab GPU Bridge or warm local daemon service
    let activeBridgeUrl = colabGpuUrl;
    if (!activeBridgeUrl) {
      const colabFile = path.join(process.cwd(), "image_gen_model", "colab_url.txt");
      if (fs.existsSync(colabFile)) {
        try {
          activeBridgeUrl = fs.readFileSync(colabFile, "utf-8").trim();
        } catch {}
      }
    }
    if (!activeBridgeUrl) {
      activeBridgeUrl = LOCAL_DAEMON_URL;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 min timeout for GPU inference

      const daemonRes = await fetch(`${activeBridgeUrl.replace(/\/$/, "")}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify({
          prompt,
          style,
          aspect,
          steps,
          seed,
          negative_prompt: negativePrompt,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (daemonRes.ok) {
        const publicScenesDir = path.join(process.cwd(), "public", "generated_scenes");
        if (!fs.existsSync(publicScenesDir)) {
          fs.mkdirSync(publicScenesDir, { recursive: true });
        }
        const cleanName = prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "scene";
        const filename = `scene_p${partNumber}_s${sceneIndex}_${cleanName}_${Date.now()}.png`;
        const outputPath = path.join(publicScenesDir, filename);

        const contentType = daemonRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const daemonData = await daemonRes.json();
          if (daemonData.success && daemonData.imageUrl) {
            return NextResponse.json({
              success: true,
              imageUrl: daemonData.imageUrl,
              prompt,
              style,
              aspect,
              sceneIndex,
              partNumber,
              engine: "gpu-bridge",
              elapsed: daemonData.elapsed,
            });
          }
        } else {
          // Direct image bytes returned by Colab Flask bridge
          const imageBuffer = Buffer.from(await daemonRes.arrayBuffer());
          fs.writeFileSync(outputPath, imageBuffer);
          return NextResponse.json({
            success: true,
            imageUrl: `/generated_scenes/${filename}`,
            prompt,
            style,
            aspect,
            sceneIndex,
            partNumber,
            engine: "colab-gpu-bridge",
          });
        }
      }
    } catch {
      // Bridge not reachable; fall through to local CLI inference
    }

    // 2. Direct CLI fallback using local PyTorch model on PC
    const publicScenesDir = path.join(process.cwd(), "public", "generated_scenes");
    if (!fs.existsSync(publicScenesDir)) {
      fs.mkdirSync(publicScenesDir, { recursive: true });
    }

    const cleanName = prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "scene";
    const filename = `scene_p${partNumber}_s${sceneIndex}_${cleanName}_${Date.now()}.png`;
    const outputPath = path.join(publicScenesDir, filename);

    const scriptPath = path.join(process.cwd(), "image_gen_model", "local_inference.py");
    const pyExe = process.platform === "win32" ? "py" : "python3";

    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/[\r\n]/g, " ");
    const escapedStyle = style.replace(/"/g, '\\"');
    const escapedAspect = aspect.replace(/"/g, '\\"');
    const escapedNegativePrompt = negativePrompt.replace(/"/g, '\\"');

    const cmd = `"${pyExe}" "${scriptPath}" --prompt "${escapedPrompt}" --style "${escapedStyle}" --aspect "${escapedAspect}" --steps ${steps} --output "${outputPath}" --negative-prompt "${escapedNegativePrompt}" --json ${seed !== undefined ? `--seed ${seed}` : ""}`;

    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        HF_HOME: process.env.HF_HOME || "D:/huggingface_cache",
        PYTHONIOENCODING: "utf-8",
      },
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Inference finished but image not found on disk: ${stderr || stdout}`);
    }

    const publicUrl = `/generated_scenes/${filename}`;

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl,
      prompt,
      style,
      aspect,
      sceneIndex,
      partNumber,
      engine: "local-cli",
    });
  } catch (err: any) {
    console.error("AI Scene Image Generation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate AI scene image." },
      { status: 500 }
    );
  }
}
