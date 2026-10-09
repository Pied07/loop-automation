import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, message: "Sync retired. Library fetches directly from user videos collection." });
}

export async function POST() {
  return NextResponse.json({ success: true, message: "Sync retired. Library fetches directly from user videos collection." });
}
