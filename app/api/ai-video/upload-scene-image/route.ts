import { NextRequest, NextResponse } from "next/server";
import { saveImageBuffer } from "@/app/image-storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ success: false, error: "Must be multipart/form-data" }, { status: 400 });
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sceneIndex = formData.get("sceneIndex");

    if (!file) {
      return NextResponse.json({ success: false, error: "No image file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `uploaded_scene_${Date.now()}_${safeName}`;

    const imageUrl = await saveImageBuffer(buffer, filename);

    return NextResponse.json({
      success: true,
      imageUrl,
      sceneIndex: Number(sceneIndex) || 0,
    });
  } catch (err: any) {
    console.error("Scene image upload error:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to upload image" }, { status: 500 });
  }
}
