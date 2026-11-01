import { createHash, randomUUID } from "node:crypto";
import { open, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const SESSION_DIR = path.join(os.tmpdir(), "viral_desk_sessions");
if (!fs.existsSync(SESSION_DIR)) {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch {}
}

// In-memory registry for temporary session image paths
const sessionImageRegistry = new Map<string, string>();

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CHUNK_SIZE = 20 * 1024 * 1024;
export const MAX_CLOUDINARY_UPLOAD_BYTES = Number(process.env.CLOUDINARY_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

export function assertCloudinaryConfigured() {
  return {
    cloudName: CLOUDINARY_CLOUD_NAME || "",
    apiKey: CLOUDINARY_API_KEY || "",
    apiSecret: CLOUDINARY_API_SECRET || "",
  };
}

function signParams(params: Record<string, string>, apiSecret: string) {
  const signatureBase = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${signatureBase}${apiSecret}`).digest("hex");
}

async function signedRequest(endpoint: string, params: Record<string, string>, resourceType: "video" | "image" = "video") {
  const { cloudName, apiKey, apiSecret } = assertCloudinaryConfigured();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedParams = { ...params, timestamp };
  const form = new FormData();
  for (const [key, value] of Object.entries(signedParams)) form.append(key, value);
  form.append("api_key", apiKey);
  form.append("signature", signParams(signedParams, apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/${endpoint}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const result = await readCloudinaryJson(response) as { error?: { message?: string }; [key: string]: unknown };
  if (!response.ok) throw new Error(result.error?.message || `Cloudinary ${endpoint} failed (HTTP ${response.status}).`);
  return result;
}

async function readCloudinaryJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

export async function uploadVideoToCloudinary(filePath: string, publicId: string) {
  // Cloudinary completely bypassed per user instructions (credits exhausted)
  console.log(`🎬 [Session Storage] Video stored in session/locally (0 Cloudinary): ${filePath}`);
  return { secureUrl: filePath, publicId: `session_${publicId}` };
}

export async function deleteSessionImage(idOrPath: string): Promise<boolean> {
  if (!idOrPath) return false;
  try {
    // 1. Direct path check
    if (fs.existsSync(idOrPath)) {
      try {
        fs.unlinkSync(idOrPath);
        return true;
      } catch {}
    }

    // 2. Registry lookup
    const registered = sessionImageRegistry.get(idOrPath);
    if (registered && fs.existsSync(registered)) {
      try {
        fs.unlinkSync(registered);
        sessionImageRegistry.delete(idOrPath);
        return true;
      } catch {}
    }

    // 3. Normalized session_ prefix lookup
    const cleanId = idOrPath.replace(/^session_/, "");
    const cleanRegistered = sessionImageRegistry.get(cleanId);
    if (cleanRegistered && fs.existsSync(cleanRegistered)) {
      try {
        fs.unlinkSync(cleanRegistered);
        sessionImageRegistry.delete(cleanId);
        return true;
      } catch {}
    }

    // 4. Prefix sweep in SESSION_DIR
    const safePrefix = cleanId.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (safePrefix && fs.existsSync(SESSION_DIR)) {
      const files = fs.readdirSync(SESSION_DIR);
      let removed = false;
      for (const file of files) {
        if (file.startsWith(safePrefix)) {
          const fullPath = path.join(SESSION_DIR, file);
          try {
            fs.unlinkSync(fullPath);
            removed = true;
          } catch {}
        }
      }
      if (removed) return true;
    }
  } catch (err: any) {
    console.warn(`[Session Storage] Error deleting session image (${idOrPath}):`, err?.message);
  }
  return false;
}

export async function deleteCloudinaryAsset(publicId: string, resourceType: "video" | "image" = "video") {
  if (!publicId) return false;

  // Intercept all session assets, local files, and ephemeral session images
  if (
    publicId.startsWith("session_") ||
    resourceType === "image" ||
    sessionImageRegistry.has(publicId) ||
    fs.existsSync(publicId)
  ) {
    const deletedSession = await deleteSessionImage(publicId);
    if (deletedSession) return true;
    if (publicId.startsWith("session_")) return true;
  }

  // If a real Cloudinary asset ID exists (e.g. video), attempt to destroy it on Cloudinary to free up storage
  try {
    const cleanId = publicId.replace(/\.[a-zA-Z0-9]+$/, "");
    const result = await signedRequest("destroy", { public_id: cleanId }, resourceType);
    return result.result === "ok";
  } catch (err: any) {
    console.warn(`deleteCloudinaryAsset warning (${publicId}):`, err?.message);
    return false;
  }
}

export async function deleteCloudinaryVideo(publicId: string) {
  return deleteCloudinaryAsset(publicId, "video");
}

export async function deleteCloudinaryImage(publicId: string) {
  await deleteSessionImage(publicId);
  return deleteCloudinaryAsset(publicId, "image");
}

/**
 * Image upload handler:
 * Per user instructions: DO NOT save images to Cloudinary (credits exhausted/failing).
 * Images are saved in a temporary session directory and returned as session Data URIs.
 * After posting, the temporary session file is deleted.
 */
export async function uploadImageToCloudinary(
  filePathOrBuffer: string | Buffer,
  publicId: string
): Promise<{ secureUrl: string; publicId: string; sessionPath: string }> {
  const isBuf = Buffer.isBuffer(filePathOrBuffer);
  const fileBuffer = isBuf ? filePathOrBuffer : await readFile(filePathOrBuffer);
  const filename = isBuf ? "story_card.png" : path.basename(filePathOrBuffer);
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const sessionDataUri = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  // Save to temporary session directory
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const safeId = publicId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const sessionFilename = `${safeId}_${Date.now()}.${ext}`;
  const sessionFilePath = path.join(SESSION_DIR, sessionFilename);

  try {
    await writeFile(sessionFilePath, fileBuffer);
    sessionImageRegistry.set(publicId, sessionFilePath);
    sessionImageRegistry.set(`session_${publicId}`, sessionFilePath);
    sessionImageRegistry.set(sessionFilePath, sessionFilePath);
    console.log(`📸 [Session Storage] Image saved temporarily in session (0 Cloudinary credits): ${sessionFilePath}`);
  } catch (err: any) {
    console.warn("Notice saving temporary session image:", err.message);
  }

  return {
    secureUrl: sessionDataUri,
    publicId: `session_${publicId}`,
    sessionPath: sessionFilePath,
  };
}

