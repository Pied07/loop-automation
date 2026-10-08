import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const metaAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback/instagram`;

  // Standard Meta unified OAuth (uses Meta Business App ID)
  if (metaAppId) {
    const params = new URLSearchParams({
      client_id: metaAppId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
    });
    return NextResponse.redirect(`https://www.facebook.com/v26.0/dialog/oauth?${params}`);
  }

  // Fallback to standalone Instagram OAuth if separate Instagram credentials configured
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?error=instagram_credentials_missing", request.url));
  }

  const state = randomBytes(32).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish",
    enable_fb_login: "0",
    state,
  });
  const response = NextResponse.redirect(`https://www.instagram.com/oauth/authorize?${params}`);
  response.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/callback/instagram",
    maxAge: 600,
  });
  return response;
}
