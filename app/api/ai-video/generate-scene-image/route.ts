import { NextRequest, NextResponse } from "next/server";
import path from "path";
import os from "os";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { saveImageBuffer } from "@/app/image-storage";

const execAsync = promisify(exec);

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LOCAL_DAEMON_URL = "http://127.0.0.1:5055";

const COMPREHENSIVE_NEGATIVE_PROMPT =
  "horrifying face, grotesque face, scary distorted face, deformed face, disfigured face, twisted face, " +
  "crossed eyes, strabismus, wall-eyed, cockeyed, misaligned eyes, lazy eye, asymmetrical eyes, crooked pupils, dilated pupils, " +
  "deformed eyes, missing pupils, unnatural iris, crooked mouth, twisted jaw, deformed teeth, melted face, claymation face, " +
  "zombie face, plastic dummy, uncanny valley, ugly proportions, malformed facial structure, bad anatomy, " +
  "spinal deformity, broken neck, mutilated neck, twisted spine, physical deformity, " +
  "collaged face, pasted face, cut-and-paste face, mismatched face, photo collage, cutout head, frankenstein face, " +
  "extra eyes, multi eyes, mutated eyes, duplicate eyes, fused eyes, " +
  "extra limbs, missing limbs, malformed limbs, floating limbs, disconnected limbs, extra fingers, missing fingers, " +
  "fused fingers, too many fingers, deformed hands, poorly drawn hands, poorly drawn face, mutation, deformed, " +
  "blurry, bad proportions, gross proportions, unnatural body, plastic skin, multiple heads, " +
  "close-up, headshot, portrait, passport photo, mugshot, ID photo, centered face, static pose, " +
  "blank background, solid color background, plain background, studio backdrop, cropped head, " +
  "text, watermark, signature, username, error, " +
  "low quality, worst quality, normal quality, jpeg artifacts, overexposed, underexposed, bad lighting";

const HORROR_NEGATIVE_PROMPT =
  "happy smile, cheerful face, laughing, friendly smile, sunny day, bright cheerful lighting, pastel colors, " +
  "cartoon, 3d cute pixar, anime, childish, " +
  "collaged face, pasted face, cut-and-paste face, mismatched photo, cutout head, frankenstein collage, " +
  "extra limbs, missing limbs, malformed limbs, floating limbs, disconnected limbs, extra fingers, missing fingers, " +
  "fused fingers, too many fingers, deformed hands, poorly drawn hands, " +
  "blurry, bad proportions, gross proportions, plastic skin, " +
  "close-up passport photo, mugshot, centered headshot, solid color background, " +
  "text, watermark, signature, username, error, low quality, worst quality, normal quality, jpeg artifacts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    const isDirectPrompt = Boolean(body.isDirectPrompt);
    const category = typeof body.category === "string" ? body.category : (isDirectPrompt ? "Custom" : "General");
    const style = typeof body.style === "string" ? body.style : "Cinematic Film";
    const aspect = typeof body.aspect === "string" ? body.aspect : "9:16 (Shorts / Reels)";
    const steps = typeof body.steps === "number" ? Math.max(1, Math.min(20, body.steps)) : 4;
    const seed = typeof body.seed === "number" ? body.seed : undefined;
    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : 0;
    const partNumber = typeof body.partNumber === "number" ? body.partNumber : 1;
    const colabGpuUrl = typeof body.colabGpuUrl === "string" ? body.colabGpuUrl.trim() : "";
    const negativePrompt = typeof body.negativePrompt === "string" && body.negativePrompt.trim()
      ? body.negativePrompt.trim()
      : (/horror|ghost|haunt|creepy|demon|spectral|phantom/i.test(`${prompt} ${style}`) ? HORROR_NEGATIVE_PROMPT : COMPREHENSIVE_NEGATIVE_PROMPT);

    const isVercel = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

    // 1. Try Live Colab GPU Bridge or warm local daemon service
    let activeBridgeUrl = colabGpuUrl;
    if (!activeBridgeUrl && !isVercel) {
      const colabFile = path.join(process.cwd(), "image_gen_model", "colab_url.txt");
      if (fs.existsSync(colabFile)) {
        try {
          activeBridgeUrl = fs.readFileSync(colabFile, "utf-8").trim();
        } catch {}
      }
      if (!activeBridgeUrl) {
        activeBridgeUrl = LOCAL_DAEMON_URL;
      }
    }

    if (activeBridgeUrl) {
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
            const cleanName = prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "scene";
            const filename = isDirectPrompt
              ? `gen_${cleanName}_${Date.now()}.png`
              : `scene_p${partNumber}_s${sceneIndex}_${cleanName}_${Date.now()}.png`;

            const imageUrl = await saveImageBuffer(imageBuffer, filename);
            return NextResponse.json({
              success: true,
              imageUrl,
              prompt,
              style,
              aspect,
              sceneIndex,
              partNumber,
              engine: "colab-gpu-bridge",
            });
          }
        }
      } catch (bridgeErr: any) {
        console.warn("GPU Bridge call error:", bridgeErr?.message || bridgeErr);
        // Fall through to local CLI inference if on local PC
      }
    }

    // 2. Handling Vercel Serverless environment where local PyTorch GPU is unavailable
    if (isVercel) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Colab GPU Bridge is not connected. To generate images with your native ML model from the live website, please paste your Google Colab URL (e.g. from Cloudflare Tunnel or ngrok) into the 'Colab GPU Bridge URL' input, or run the app locally on your PC via 'npm run dev'.",
        },
        { status: 503 }
      );
    }

    // 3. Direct CLI fallback using local PyTorch model on PC
    const tempOutputDir = os.tmpdir();
    const cleanName = prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "scene";
    const filename = isDirectPrompt
      ? `gen_${cleanName}_${Date.now()}.png`
      : `scene_p${partNumber}_s${sceneIndex}_${cleanName}_${Date.now()}.png`;
    const tempOutputPath = path.join(tempOutputDir, filename);

    const scriptPath = path.join(process.cwd(), "image_gen_model", "local_inference.py");
    const pyExe = process.platform === "win32" ? "py" : "python3";

    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/[\r\n]/g, " ");
    const escapedStyle = style.replace(/"/g, '\\"');
    const escapedAspect = aspect.replace(/"/g, '\\"');
    const escapedNegativePrompt = negativePrompt.replace(/"/g, '\\"');

    const cmd = `"${pyExe}" "${scriptPath}" --prompt "${escapedPrompt}" --style "${escapedStyle}" --aspect "${escapedAspect}" --steps ${steps} --category "${category}" --output "${tempOutputPath}" --negative-prompt "${escapedNegativePrompt}" --json ${seed !== undefined ? `--seed ${seed}` : ""}${colabGpuUrl ? ` --colab-url "${colabGpuUrl}"` : ""}`;

    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        HF_HOME: process.env.HF_HOME || "D:/huggingface_cache",
        PYTHONIOENCODING: "utf-8",
      },
    });

    if (!fs.existsSync(tempOutputPath)) {
      throw new Error(`Inference finished but image not found on disk: ${stderr || stdout}`);
    }

    const imageBuffer = fs.readFileSync(tempOutputPath);
    const finalImageUrl = await saveImageBuffer(imageBuffer, filename);

    // Clean up temp file
    try {
      fs.unlinkSync(tempOutputPath);
    } catch {}

    return NextResponse.json({
      success: true,
      imageUrl: finalImageUrl,
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
