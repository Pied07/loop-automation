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
  "multiple swords, extra swords, floating swords, crossed swords, multiple blades, extra weapons, " +
  "elongated torso, long torso, stretched body, unnaturally tall torso, stacked torso, double torso, accordion torso, " +
  "repeating armor, ribbed armor distortion, repeating patterns, segmented body, " +
  "extra arms, multiple arms, extra limbs, missing limbs, malformed limbs, floating limbs, disconnected limbs, " +
  "horrifying face, grotesque face, scary distorted face, deformed face, disfigured face, twisted face, " +
  "hollow eyes, sunken eye sockets, dark eye sockets, black eyes, deformed pupils, missing eyes, blind eyes, mismatched eyes, " +
  "crossed eyes, strabismus, wall-eyed, cockeyed, misaligned eyes, lazy eye, asymmetrical eyes, crooked pupils, dilated pupils, " +
  "deformed eyes, missing pupils, unnatural iris, crooked mouth, twisted jaw, deformed teeth, melted face, claymation face, " +
  "zombie face, plastic dummy, uncanny valley, ugly proportions, malformed facial structure, bad anatomy, " +
  "spinal deformity, broken neck, mutilated neck, twisted spine, physical deformity, " +
  "extra fingers, missing fingers, fused fingers, too many fingers, deformed hands, poorly drawn hands, poorly drawn face, mutation, deformed, " +
  "elongated arms, rubbery arms, melted skin, mutated fingers, fused limbs, deformed body, unnatural posture, " +
  "blurry, bad proportions, gross proportions, unnatural body, plastic skin, multiple heads, multiple people, duplicate person, " +
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
    const userId = typeof body.userId === "string" ? body.userId.trim() : "creator";
    const colabGpuUrl = typeof body.colabGpuUrl === "string" ? body.colabGpuUrl.trim() : "";
    const forceCloud = Boolean(body.forceCloud);
    const negativePrompt = typeof body.negativePrompt === "string" && body.negativePrompt.trim()
      ? body.negativePrompt.trim()
      : (/horror|ghost|haunt|creepy|demon|spectral|phantom/i.test(`${prompt} ${style}`) ? HORROR_NEGATIVE_PROMPT : COMPREHENSIVE_NEGATIVE_PROMPT);

    const isVercel = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

    // 1. Try Live Colab GPU Bridge or warm local daemon service
    let activeBridgeUrl = colabGpuUrl;
    if (!activeBridgeUrl && !isVercel && !forceCloud) {
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

    if (activeBridgeUrl && !forceCloud) {
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
      }
    }

    // 2. Dispatch to GitHub Actions Cloud Runner (Serverless environment or cloud mode)
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || "Pied07/loop-automation";

    if (isVercel || forceCloud || !process.env.LOCAL_DEV) {
      if (githubPat) {
        const jobId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const appUrl = (
          process.env.APP_URL ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://the-viral-desk.vercel.app"))
        ).replace(/\/$/, "");

        // Report initial status to status tracker
        try {
          await fetch(`${appUrl}/api/viral-clips/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId,
              userId,
              status: "processing",
              progress: 15,
              step: "Starting native ML image generation in GitHub Actions cloud runner...",
              sourceTitle: prompt ? prompt.slice(0, 60) : undefined,
            }),
          });
        } catch (stErr) {
          console.warn("Initial status update notice:", stErr);
        }

        const dispatchUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/generate-ai-image.yml/dispatches`;
        const ghRes = await fetch(dispatchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubPat}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "The-Viral-Desk-App",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              jobId,
              prompt,
              style,
              aspect,
              steps: String(steps),
              seed: seed !== undefined ? String(seed) : "",
              negativePrompt: negativePrompt || "",
              isDirectPrompt: isDirectPrompt ? "true" : "false",
              category,
              userId,
              appUrl,
              cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
              cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
              cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
            },
          }),
        });

        if (ghRes.ok || ghRes.status === 204) {
          return NextResponse.json({
            success: true,
            pending: true,
            cloudMode: "github-actions",
            jobId,
            message: "Dispatched image generation to GitHub Actions native ML runner.",
            engine: "github-actions",
          });
        } else {
          const ghErr = await ghRes.text();
          console.error("GitHub Actions dispatch error:", ghRes.status, ghErr);
        }
      }

      if (isVercel) {
        return NextResponse.json(
          {
            success: false,
            error:
              "GitHub Actions runner is not configured (missing GITHUB_PAT) and Colab GPU Bridge is disconnected. Please add GITHUB_PAT to your environment secrets or provide a Google Colab GPU URL.",
          },
          { status: 503 }
        );
      }
    }

    // 3. Direct CLI fallback using local PyTorch model on PC (Local development)
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
