import { NextRequest, NextResponse } from "next/server";
import { assertCloudinaryConfigured } from "@/app/cloudinary-upload";
import { createHash, randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { cloudName, apiKey, apiSecret } = assertCloudinaryConfigured();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const uploadId = randomUUID().replace(/-/g, "").slice(0, 12);
    const publicId = `viral_sources/${uploadId}`;

    const params: Record<string, string> = {
      public_id: publicId,
      timestamp,
    };

    const signatureBase = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    const signature = createHash("sha1").update(`${signatureBase}${apiSecret}`).digest("hex");

    return NextResponse.json({
      success: true,
      cloudName,
      apiKey,
      timestamp,
      publicId,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create upload signature" }, { status: 500 });
  }
}
