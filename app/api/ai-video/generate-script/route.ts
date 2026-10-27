import { NextRequest, NextResponse } from "next/server";
import { generateStoryParts } from "@/app/lib/story-engine";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === "string" ? body.category.trim() : "Horror";
    const customTag = typeof body.customTag === "string" ? body.customTag.trim() : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const duration = body.duration ? Math.max(60, Math.min(600, Number(body.duration))) : 60;
    const numImages = body.numImages ? Math.max(1, Math.min(20, Number(body.numImages))) : 5;
    const numParts = body.numParts ? Math.max(1, Math.min(5, Number(body.numParts))) : 1;
    const excludeId = typeof body.excludeId === "string" ? body.excludeId.trim() : "";
    const sceneStyle = typeof body.sceneStyle === "string" ? body.sceneStyle.trim() : "Realism";
    const seed = body.seed ? Number(body.seed) : (Math.floor(Math.random() * 1000000) + 1);

    let result: any = null;

    // 1. Try running ML story engine via Python CLI (utilizes trained ONNX model latent vectors)
    try {
      const pyExe = process.platform === "win32" ? "py" : "python3";
      const scriptPath = path.join(process.cwd(), "scripts", "story_engine.py");
      const safeCat = category.replace(/"/g, '\\"');
      const safeCustomTag = customTag.replace(/"/g, '\\"');
      const safePrompt = prompt.replace(/"/g, '\\"');
      const safeStyle = sceneStyle.replace(/"/g, '\\"');
      const safeExclude = excludeId.replace(/"/g, '\\"');

      const cmd = `"${pyExe}" "${scriptPath}" --category "${safeCat}" --custom-tag "${safeCustomTag}" --prompt "${safePrompt}" --duration ${duration} --num-images ${numImages} --num-parts ${numParts} --scene-style "${safeStyle}" --exclude-id "${safeExclude}" --seed ${seed}`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
      const jsonStart = stdout.indexOf("{");
      if (jsonStart !== -1) {
        result = JSON.parse(stdout.slice(jsonStart));
      }
    } catch (pyErr) {
      console.warn("Notice: Python story engine fallback to TS:", pyErr);
    }

    // 2. Fallback to in-process generative story synthesizer
    if (!result || !result.parts || result.parts.length === 0) {
      result = await generateStoryParts({
        category,
        customTag,
        prompt,
        duration,
        numImages,
        numParts,
        excludeId,
        sceneStyle,
        seed,
      });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("AI Script generation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate script" },
      { status: 500 }
    );
  }
}
