import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFilePromise = util.promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = body.category?.trim() || "Interesting Facts";
    const customTag = body.customTag?.trim() || "";
    const prompt = body.prompt?.trim() || "";
    const duration = body.duration ? Math.max(10, Math.min(120, Number(body.duration))) : 20;
    const numImages = body.numImages ? Math.max(1, Math.min(5, Number(body.numImages))) : 3;
    const numParts = body.numParts ? Math.max(1, Math.min(5, Number(body.numParts))) : 1;
    const excludeId = body.excludeId?.trim() || "";

    const pyExe = process.platform === "win32" ? "py" : "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "story_engine.py");

    const args = [
      scriptPath,
      "--category", category,
      "--custom-tag", customTag,
      "--prompt", prompt,
      "--duration", String(duration),
      "--num-images", String(numImages),
      "--num-parts", String(numParts),
    ];

    if (excludeId) {
      args.push("--exclude-id", excludeId);
    }

    const { stdout, stderr } = await execFilePromise(pyExe, args, {
      cwd: process.cwd(),
      timeout: 30000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    const jsonStart = stdout.indexOf("{");
    const jsonEnd = stdout.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Failed to parse script engine output: ${stderr || stdout}`);
    }

    const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
    return NextResponse.json({ success: true, ...parsed });
  } catch (err: any) {
    console.error("AI Script generation error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to generate script" }, { status: 500 });
  }
}
