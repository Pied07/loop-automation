import { NextResponse } from "next/server";
import { readTokens } from "@/app/lib/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokens: any = await readTokens();
    const connections: string[] = [];

    if (tokens.youtube?.access_token || tokens.youtube?.refresh_token) {
      connections.push("YouTube");
    }
    if (tokens.facebook?.page_id && tokens.facebook?.page_access_token) {
      connections.push("Facebook");
    }
    if (tokens.facebook?.instagram_user_id || tokens.instagram?.access_token) {
      connections.push("Instagram");
    }
    if (tokens.gmail?.access_token || tokens.gmail?.refresh_token) {
      connections.push("Gmail");
    }

    return NextResponse.json({ success: true, connections });
  } catch (err: any) {
    return NextResponse.json({ success: false, connections: [] });
  }
}
