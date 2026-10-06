import { createHash, randomUUID } from "node:crypto";
import { open, stat } from "node:fs/promises";
import path from "node:path";

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CHUNK_SIZE = 20 * 1024 * 1024;
export const MAX_CLOUDINARY_UPLOAD_BYTES = Number(process.env.CLOUDINARY_MAX_UPLOAD_BYTES || 100 * 1024 * 1024);

export function assertCloudinaryConfigured() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env to store clips in Cloudinary.");
  }
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
}

function signParams(params: Record<string, string>, apiSecret: string) {
  const signatureBase = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${signatureBase}${apiSecret}`).digest("hex");
}

async function signedRequest(endpoint: string, params: Record<string, string>) {
  const { cloudName, apiKey, apiSecret } = assertCloudinaryConfigured();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedParams = { ...params, timestamp };
  const form = new FormData();
  for (const [key, value] of Object.entries(signedParams)) form.append(key, value);
  form.append("api_key", apiKey);
  form.append("signature", signParams(signedParams, apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/${endpoint}`, {
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
  const { cloudName, apiKey, apiSecret } = assertCloudinaryConfigured();
  const fileSize = (await stat(filePath)).size;
  if (fileSize > MAX_CLOUDINARY_UPLOAD_BYTES) {
    const mb = (fileSize / 1024 / 1024).toFixed(1);
    const maxMb = (MAX_CLOUDINARY_UPLOAD_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(`Clip is ${mb} MB, which exceeds the Cloudinary upload limit of ${maxMb} MB. Shorter compressed clips are required.`);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedParams = { public_id: publicId, timestamp };
  const signature = signParams(signedParams, apiSecret);
  const uploadId = randomUUID();
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`;
  const file = await open(filePath, "r");

  try {
    for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
      const length = Math.min(CHUNK_SIZE, fileSize - start);
      const chunk = Buffer.allocUnsafe(length);
      const { bytesRead } = await file.read(chunk, 0, length, start);
      if (bytesRead !== length) throw new Error(`Could not read the complete clip ${path.basename(filePath)}.`);

      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(chunk)], { type: "video/mp4" }), path.basename(filePath));
      form.append("api_key", apiKey);
      form.append("timestamp", timestamp);
      form.append("public_id", publicId);
      form.append("signature", signature);

      const end = start + bytesRead - 1;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Unique-Upload-Id": uploadId,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      const result = await readCloudinaryJson(response) as {
        done?: boolean;
        secure_url?: string;
        public_id?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message || `Cloudinary upload failed (HTTP ${response.status}).`);

      if (end + 1 === fileSize) {
        const secureUrl = result.secure_url || (result as any).url;
        const confirmedPublicId = result.public_id || publicId;
        if (!secureUrl) {
          throw new Error("Cloudinary did not return a media URL for the uploaded clip.");
        }
        return { secureUrl, publicId: confirmedPublicId };
      }
    }
  } finally {
    await file.close();
  }

  throw new Error("Cloudinary upload ended without a completed response.");
}

export async function deleteCloudinaryVideo(publicId: string) {
  try {
    const result = await signedRequest("destroy", { public_id: publicId });
    return result.result === "ok";
  } catch {
    return false;
  }
}
