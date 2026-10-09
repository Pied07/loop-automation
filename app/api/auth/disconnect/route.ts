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
        delete tokens.facebook.access_token;
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

    // Also prune local tokens.json if present
    try {
      const fs = require("fs");
      const path = require("path");
      const tokensFile = path.join(process.cwd(), "tokens.json");
      if (fs.existsSync(tokensFile)) {
        const local = JSON.parse(fs.readFileSync(tokensFile, "utf8"));
        if (key === "youtube") delete local.youtube;
        else if (key === "facebook") {
          if (local.facebook) {
            delete local.facebook.page_id;
            delete local.facebook.page_name;
            delete local.facebook.page_access_token;
            delete local.facebook.access_token;
            if (!local.facebook.instagram_user_id) delete local.facebook;
          }
        } else if (key === "instagram") {
          delete local.instagram;
          if (local.facebook) {
            delete local.facebook.instagram_user_id;
            delete local.facebook.instagram_page_id;
            delete local.facebook.instagram_page_access_token;
            delete local.facebook.instagram_username;
            if (!local.facebook.page_id) delete local.facebook;
          }
        } else if (key === "gmail") delete local.gmail;
        fs.writeFileSync(tokensFile, JSON.stringify(local, null, 2));
      }
    } catch {}

    return NextResponse.json({ success: true, platform });
  } catch (err: any) {
    console.error("Disconnect error:", err);
    return NextResponse.json({ error: err.message || "Failed to disconnect" }, { status: 500 });
  }
}
