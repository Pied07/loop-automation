import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { publishClipAndCleanup } from "@/app/viral-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipPath, partNumber, totalParts, title, description, hashtags, platforms, userEmail, connections } = body;

    if (!clipPath || !platforms?.length) {
      return NextResponse.json({ error: "Clip path and platforms are required." }, { status: 400 });
    }

    const result = await publishClipAndCleanup({
      clipPath,
      partNumber,
      totalParts,
      title,
      description,
      hashtags,
      platforms,
      userEmail,
      connections,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Publish clip error:", err);
    return NextResponse.json({ error: err.message || "Failed to publish clip." }, { status: 500 });
  }
}
