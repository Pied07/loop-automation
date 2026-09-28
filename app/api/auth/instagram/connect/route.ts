import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const sameMetaApp = clientId && clientId === process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET || (sameMetaApp ? process.env.META_APP_SECRET : undefined);
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?error=instagram_credentials_missing", request.url));
  }

  const state = randomBytes(32).toString("hex");
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${new URL(request.url).origin}/api/auth/callback/instagram`;
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
