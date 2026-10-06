import { NextRequest, NextResponse } from "next/server";
import { autoFindViralVideo } from "@/app/viral-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === "string" ? body.category.trim() : "Trending";
    const result = await autoFindViralVideo(category);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to find viral video." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim() || "Trending";
    const result = await autoFindViralVideo(category);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to find viral video." },
      { status: 500 }
    );
  }
}
