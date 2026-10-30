import path from "path";
import fs from "fs";

/**
 * Image storage handler:
 * Per user instructions: DO NOT save generated images to Cloudinary.
 * Images are returned directly as Base64 Data URIs (in-memory / session).
 * If the user does not download the image, it is lost when session ends.
 */
export async function saveImageBuffer(imageBuffer: Buffer, filename: string): Promise<string> {
  // If running in local dev and public/generated_scenes exists, we can optionally write for local reference
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!isVercel && process.env.SAVE_LOCAL_FILES === "1") {
    try {
      const publicDir = path.join(process.cwd(), "public", "generated_scenes");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, filename);
      fs.writeFileSync(filePath, imageBuffer);
      return `/generated_scenes/${filename}`;
    } catch {}
  }

  // Pure in-memory Base64 Data URI: Instant delivery, zero cloud footprint, zero Cloudinary
  const mimeType = filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}
