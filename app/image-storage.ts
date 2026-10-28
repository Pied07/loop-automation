import path from "path";
import fs from "fs";

/**
 * Safely saves an image buffer in both serverless (Vercel read-only)
 * and local PC environments.
 * 
 * 1. If Cloudinary credentials are set, uploads to Cloudinary CDN.
 * 2. If on local writable disk, saves to public/generated_scenes.
 * 3. Fallback for read-only serverless: returns a Base64 data URI (never throws ENOENT).
 */
export async function saveImageBuffer(imageBuffer: Buffer, filename: string): Promise<string> {
  // 1. Try Cloudinary CDN if credentials exist in environment
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (cloudName && apiKey && apiSecret) {
    try {
      const { uploadImageToCloudinary } = await import("@/app/cloudinary-upload");
      const publicId = filename.replace(/\.[a-zA-Z0-9]+$/, "");
      const res = await uploadImageToCloudinary(imageBuffer, publicId);
      if (res?.secureUrl) {
        return res.secureUrl;
      }
    } catch (cErr: any) {
      console.warn("Cloudinary upload fallback:", cErr?.message || cErr);
    }
  }

  // 2. Try saving to public/generated_scenes if writable (local development)
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!isVercel) {
    try {
      const publicDir = path.join(process.cwd(), "public", "generated_scenes");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, filename);
      fs.writeFileSync(filePath, imageBuffer);
      return `/generated_scenes/${filename}`;
    } catch (fsErr: any) {
      console.warn("Local disk write warning:", fsErr?.message || fsErr);
    }
  }

  // 3. Resilient fallback for Vercel / serverless: Data URI
  const mimeType = filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}
