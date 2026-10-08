import { NextResponse } from "next/server";
import { readTokens, writeTokens } from "@/app/lib/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokens: any = await readTokens();
    const connections: string[] = [];

    // Verify YouTube token validity
    if (tokens.youtube?.refresh_token || tokens.youtube?.access_token) {
      try {
        const { google } = require("googleapis");
        const client = new google.auth.OAuth2(
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        client.setCredentials(tokens.youtube);
        const { token } = await client.getAccessToken();
        if (token) {
          connections.push("YouTube");
          if (token !== tokens.youtube.access_token) {
            tokens.youtube.access_token = token;
            await writeTokens(tokens);
          }
        }
      } catch (ytErr: any) {
        if (!ytErr?.message?.includes("invalid_grant") && !ytErr?.message?.includes("revoked")) {
          // Network hiccup or quota limit: keep YouTube if credentials exist
          connections.push("YouTube");
        }
      }
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
