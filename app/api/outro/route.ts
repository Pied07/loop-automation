import { NextRequest, NextResponse } from "next/server";
import { database } from "@/app/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { writeFile } from "node:fs/promises";
import { uploadVideoToCloudinary, deleteCloudinaryVideo } from "@/app/cloudinary-upload";

export const dynamic = "force-dynamic";

// GET: Returns the currently active outro video information
export async function GET() {
  try {
    // 1. Check custom outro from Firestore app_config/outro_settings
    if (database) {
      try {
        const snap = await getDoc(doc(database, "app_config", "outro_settings"));
        if (snap.exists() && snap.data().url) {
          const data = snap.data();
          return NextResponse.json({
            url: data.url,
            publicId: data.publicId || "",
            updatedAt: data.updatedAt || "",
            filename: data.filename || "custom-outro.mp4",
            isCustom: true,
          });
        }
      } catch (e: any) {
        console.warn("Firestore outro_settings get notice:", e.message);
      }
    }

    // 2. Fall back to local static asset
    const localAsset = path.join(process.cwd(), "public", "assets", "video-outro.mp4");
    if (fs.existsSync(localAsset)) {
      return NextResponse.json({
        url: "/assets/video-outro.mp4",
        isCustom: false,
        updatedAt: null,
      });
    }

    return NextResponse.json({
      url: "",
      isCustom: false,
      updatedAt: null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Uploads a new outro video, deletes the old outro video, and stores the new active outro
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Please provide an MP4 video file for the outro." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 5000) {
      return NextResponse.json({ error: "The uploaded file is empty or too small to be a valid video." }, { status: 400 });
    }

    // 1. Delete previous custom outro video from Cloudinary if it exists
    if (database) {
      try {
        const snap = await getDoc(doc(database, "app_config", "outro_settings"));
        if (snap.exists()) {
          const oldData = snap.data();
          if (oldData.publicId) {
            console.log(`[Outro API] Deleting previous outro video: ${oldData.publicId}...`);
            await deleteCloudinaryVideo(oldData.publicId).catch(() => {});
          }
        }
      } catch (delErr: any) {
        console.warn("Notice deleting old outro video:", delErr.message);
      }
    }

    // 2. Write new video to temp file for processing and Cloudinary upload
    const tmpOutroPath = path.join(os.tmpdir(), `new_outro_${Date.now()}.mp4`);
    await writeFile(tmpOutroPath, buffer);

    // Overwrite local public/assets/video-outro.mp4 if local disk is writable
    try {
      const localOutroPath = path.join(process.cwd(), "public", "assets", "video-outro.mp4");
      fs.writeFileSync(localOutroPath, buffer);
    } catch {}

    // 3. Upload new outro video to Cloudinary
    const newPublicId = `system_outro_${Date.now()}`;
    const cRes = await uploadVideoToCloudinary(tmpOutroPath, newPublicId);

    // Cleanup temp file
    try {
      fs.unlinkSync(tmpOutroPath);
    } catch {}

    // 4. Update Firestore with new active outro configuration
    const outroRecord = {
      url: cRes.secureUrl,
      publicId: cRes.publicId,
      filename: file.name || "video-outro.mp4",
      updatedAt: new Date().toISOString(),
      isCustom: true,
    };

    if (database) {
      try {
        await setDoc(doc(database, "app_config", "outro_settings"), outroRecord, { merge: true });
      } catch (setErr: any) {
        console.warn("Notice saving outro_settings to Firestore:", setErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "New outro video uploaded and activated! Previous outro was successfully replaced.",
      ...outroRecord,
    });
  } catch (err: any) {
    console.error("Outro upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload outro video." }, { status: 500 });
  }
}

// DELETE: Deletes the custom outro and reverts to default
export async function DELETE() {
  try {
    if (database) {
      try {
        const snap = await getDoc(doc(database, "app_config", "outro_settings"));
        if (snap.exists() && snap.data().publicId) {
          await deleteCloudinaryVideo(snap.data().publicId).catch(() => {});
        }
        await setDoc(doc(database, "app_config", "outro_settings"), {
          url: "",
          publicId: "",
          updatedAt: new Date().toISOString(),
          isCustom: false,
        }, { merge: true });
      } catch (e: any) {
        console.warn("Outro reset notice:", e.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Custom outro video removed.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
