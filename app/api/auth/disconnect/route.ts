import { NextRequest, NextResponse } from "next/server";
import { readTokens, writeTokens } from "@/app/lib/tokens";

export async function POST(req: NextRequest) {
  try {
    const { platform } = await req.json();
    if (!platform) {
      return NextResponse.json({ error: "Platform name is required" }, { status: 400 });
    }

    const tokens = await readTokens();
    const key = platform.toLowerCase();

    if (key === "youtube") {
      delete tokens.youtube;
    } else if (key === "facebook") {
      if (tokens.facebook) {
        delete tokens.facebook.page_id;
        delete tokens.facebook.page_name;
        delete tokens.facebook.page_access_token;
        if (!tokens.facebook.instagram_user_id) {
          delete tokens.facebook;
        }
      }
    } else if (key === "instagram") {
      delete tokens.instagram;
      if (tokens.facebook) {
        delete tokens.facebook.instagram_user_id;
        delete tokens.facebook.instagram_page_id;
        delete tokens.facebook.instagram_page_access_token;
        delete tokens.facebook.instagram_username;
        if (!tokens.facebook.page_id) {
          delete tokens.facebook;
        }
      }
    } else if (key === "gmail") {
      delete tokens.gmail;
    }

    await writeTokens(tokens);
    return NextResponse.json({ success: true, platform });
  } catch (err: any) {
    console.error("Disconnect error:", err);
    return NextResponse.json({ error: err.message || "Failed to disconnect" }, { status: 500 });
  }
}
