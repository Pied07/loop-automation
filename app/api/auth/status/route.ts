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

    // Verify Facebook Page token validity
    if (tokens.facebook?.page_id && tokens.facebook?.page_access_token) {
      try {
        const fbTest = await fetch(
          `https://graph.facebook.com/v26.0/${tokens.facebook.page_id}?fields=id&access_token=${tokens.facebook.page_access_token}`,
          { signal: AbortSignal.timeout(4000) }
        );
        const fbData = await fbTest.json();
        if (fbTest.ok && fbData.id) {
          connections.push("Facebook");
        } else {
          console.warn("Facebook token expired or invalid:", fbData.error?.message);
        }
      } catch {
        connections.push("Facebook");
      }
    }

    // Verify Instagram token validity independently
    const igToken = tokens.instagram?.access_token || (tokens.facebook?.instagram_user_id ? tokens.facebook?.instagram_page_access_token : undefined);
    const igUserId = tokens.instagram?.user_id || tokens.facebook?.instagram_user_id;
    if (igToken && igUserId) {
      try {
        const igTest = await fetch(
          `https://graph.facebook.com/v26.0/${igUserId}?fields=id&access_token=${igToken}`,
          { signal: AbortSignal.timeout(4000) }
        );
        const igData = await igTest.json();
        if (igTest.ok && igData.id) {
          connections.push("Instagram");
        } else {
          console.warn("Instagram token expired or invalid:", igData.error?.message);
        }
      } catch {
        connections.push("Instagram");
      }
    }
    if (tokens.gmail?.access_token || tokens.gmail?.refresh_token) {
      connections.push("Gmail");
    }

    return NextResponse.json({ success: true, connections });
  } catch (err: any) {
    return NextResponse.json({ success: false, connections: [] });
  }
}
