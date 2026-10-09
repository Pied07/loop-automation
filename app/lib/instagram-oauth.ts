import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

type StoredTokens = Record<string, unknown> & { facebook?: Record<string, unknown> };

import { readTokens, writeTokens } from "@/app/lib/tokens";

function redirect(request: Request, query: string) {
  const response = NextResponse.redirect(new URL(`/?${query}`, request.url));
  response.cookies.set("instagram_oauth_state", "", { path: "/api/auth/callback/instagram", maxAge: 0 });
  return response;
}

export async function completeInstagramLogin(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("error")) return redirect(request, "error=oauth_rejected");
  const code = searchParams.get("code");
  const expectedState = request.headers.get("cookie")?.match(/(?:^|;\s*)instagram_oauth_state=([^;]+)/)?.[1];
  if (!code || !searchParams.get("state") || searchParams.get("state") !== expectedState) {
    return redirect(request, "error=instagram_oauth_state_invalid");
  }

  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const sameMetaApp = clientId && clientId === process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET || (sameMetaApp ? process.env.META_APP_SECRET : undefined);
  if (!clientId || !clientSecret) return redirect(request, "error=instagram_credentials_missing");
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${new URL(request.url).origin}/api/auth/callback/instagram`;

  try {
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      cache: "no-store",
    });
    const shortToken = await tokenResponse.json();
    if (!tokenResponse.ok || !shortToken.access_token) return redirect(request, "error=instagram_token_exchange_failed");

    const longParams = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: clientSecret,
      access_token: shortToken.access_token,
    });
    const longResponse = await fetch(`https://graph.instagram.com/access_token?${longParams}`, { cache: "no-store" });
    const longToken = await longResponse.json();
    if (!longResponse.ok || !longToken.access_token) return redirect(request, "error=instagram_token_exchange_failed");

    const profileParams = new URLSearchParams({ fields: "user_id,username", access_token: longToken.access_token });
    const profileResponse = await fetch(`https://graph.instagram.com/me?${profileParams}`, { cache: "no-store" });
    const profile = await profileResponse.json();
    const instagramUserId = profile.user_id || profile.id || shortToken.user_id || longToken.user_id;
    if (!profileResponse.ok || !instagramUserId) return redirect(request, "error=instagram_profile_unavailable");

    const tokens = await readTokens();
    tokens.facebook = {
      ...(tokens.facebook || {}),
      instagram_login: true,
      instagram_user_id: String(instagramUserId),
      instagram_access_token: longToken.access_token,
      instagram_username: profile.username,
      instagram_expires_at: Date.now() + Number(longToken.expires_in || 5184000) * 1000,
    };
    tokens.instagram = {
      ...(tokens.instagram || {}),
      access_token: longToken.access_token,
      user_id: String(instagramUserId),
      username: profile.username,
    };
    await writeTokens(tokens);
    return redirect(request, "connected=instagram");
  } catch (error) {
    console.error("Instagram Login failed:", error instanceof Error ? error.message : "Unknown error");
    return redirect(request, "error=instagram_token_exchange_failed");
  }
}
