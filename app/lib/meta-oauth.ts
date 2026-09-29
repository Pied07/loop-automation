import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const graphVersion = "v26.0";
type MetaPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
};
type StoredTokens = Record<string, unknown> & { facebook?: Record<string, unknown> };

function redirect(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/?${query}`, request.url));
}

import { readTokens, writeTokens } from "@/app/lib/tokens";

export async function completeMetaOAuth(request: Request, provider: "facebook" | "instagram") {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("error")) return redirect(request, "error=oauth_rejected");
  const code = searchParams.get("code");
  if (!code) return redirect(request, "error=no_code");

  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) return redirect(request, "error=missing_credentials");

  try {
    const redirectUri = `${new URL(request.url).origin}/api/auth/callback/${provider}`;
    const tokenParams = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
    const tokenResponse = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${tokenParams}`, { cache: "no-store" });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Meta token exchange failed:", tokenData);
      return redirect(request, `error=token_exchange_failed&details=${encodeURIComponent(tokenData?.error?.message || "Meta API rejected token exchange")}`);
    }

    const longLivedParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: tokenData.access_token,
    });
    const longLivedResponse = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${longLivedParams}`, { cache: "no-store" });
    const longLivedData = await longLivedResponse.json();
    const userToken = longLivedResponse.ok && longLivedData.access_token ? longLivedData.access_token : tokenData.access_token;

    const pageParams = new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username}",
      access_token: userToken,
    });
    const pagesResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me/accounts?${pageParams}`, { cache: "no-store" });
    const pagesData = await pagesResponse.json();
    if (!pagesResponse.ok || pagesData.error) return redirect(request, "error=meta_permissions_missing");
    const pages: MetaPage[] = Array.isArray(pagesData.data) ? pagesData.data : [];
    if (!pages.length) return redirect(request, "error=meta_no_pages");

    const selectedPage = pages.find((page) => page.access_token) || pages[0];
    const instagramPage = pages.find((page) => page.instagram_business_account?.id && page.access_token);
    if (!selectedPage?.access_token) return redirect(request, "error=meta_page_access_missing");
    if (provider === "instagram" && !instagramPage) return redirect(request, "error=meta_no_instagram");

    const tokens = await readTokens();
    tokens.facebook = {
      ...(tokens.facebook || {}),
      access_token: userToken,
      page_id: selectedPage.id,
      page_name: selectedPage.name,
      page_access_token: selectedPage.access_token,
      instagram_page_id: instagramPage?.id,
      instagram_page_access_token: instagramPage?.access_token,
      instagram_user_id: instagramPage?.instagram_business_account?.id,
      instagram_username: instagramPage?.instagram_business_account?.username,
    };
    await writeTokens(tokens);

    const connected = ["facebook", ...(instagramPage ? ["instagram"] : [])].join(",");
    const query = new URLSearchParams({ connected });
    if (!instagramPage && provider === "facebook") query.set("warning", "meta_no_instagram");
    return redirect(request, query.toString());
  } catch (error: any) {
    console.error("Meta OAuth verification failed:", error?.message || "Unknown error");
    return redirect(request, `error=token_exchange_failed&details=${encodeURIComponent(error?.message || "Unknown error")}`);
  }
}
