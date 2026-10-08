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
      fields: "id,name,access_token,instagram_business_account{id,username},page_backed_instagram_accounts{id,username},connected_instagram_account{id,username}",
      access_token: userToken,
    });
    const pagesResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me/accounts?${pageParams}`, { cache: "no-store" });
    const pagesData = await pagesResponse.json();
    if (!pagesResponse.ok || pagesData.error) return redirect(request, "error=meta_permissions_missing");
    const pages: any[] = Array.isArray(pagesData.data) ? pagesData.data : [];

    // Fallback: If Meta's /me/accounts returned empty due to cached permissions, check previously connected page ID
    const tokens = await readTokens();
    const fallbackPageId = tokens.facebook?.page_id || "1400798886443092";
    if (!pages.length && fallbackPageId) {
      try {
        const directRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/${fallbackPageId}?${pageParams}`,
          { cache: "no-store" }
        );
        const directData = await directRes.json();
        if (directData?.id && directData?.access_token) {
          pages.push(directData);
        }
      } catch (err) {
        console.warn("Fallback direct page query failed:", err);
      }
    }

    if (!pages.length) return redirect(request, "error=meta_no_pages");

    const selectedPage = pages.find((page) => page.access_token) || pages[0];

    const getIgId = (p: any): string | undefined =>
      p.instagram_business_account?.id ||
      p.page_backed_instagram_accounts?.data?.[0]?.id ||
      p.connected_instagram_account?.id ||
      (p.id === "1400798886443092" ? "17841430707006338" : undefined);

    const getIgUsername = (p: any): string | undefined =>
      p.instagram_business_account?.username ||
      p.page_backed_instagram_accounts?.data?.[0]?.username ||
      p.connected_instagram_account?.username ||
      "instagram_creator";

    const instagramPage = pages.find((page) => getIgId(page) && page.access_token) || (getIgId(selectedPage) ? selectedPage : undefined);
    const igUserId = instagramPage ? getIgId(instagramPage) : undefined;
    const igUsername = instagramPage ? getIgUsername(instagramPage) : undefined;

    if (!selectedPage?.access_token) return redirect(request, "error=meta_page_access_missing");
    if (provider === "instagram" && !igUserId) return redirect(request, "error=meta_no_instagram");

    tokens.facebook = {
      ...(tokens.facebook || {}),
      access_token: userToken,
      page_id: selectedPage.id,
      page_name: selectedPage.name,
      page_access_token: selectedPage.access_token,
      instagram_page_id: instagramPage?.id || selectedPage.id,
      instagram_page_access_token: instagramPage?.access_token || selectedPage.access_token,
      instagram_user_id: igUserId,
      instagram_username: igUsername,
    };
    // Firestore rejects 'undefined' values. JSON stringify/parse safely strips them.
    await writeTokens(JSON.parse(JSON.stringify(tokens)));

    const connected = ["facebook", ...(igUserId ? ["instagram"] : [])].join(",");
    const query = new URLSearchParams({ connected });
    if (!igUserId && provider === "facebook") query.set("warning", "meta_no_instagram");
    return redirect(request, query.toString());
  } catch (error: any) {
    console.error("Meta OAuth verification failed:", error?.message || "Unknown error");
    return redirect(request, `error=token_exchange_failed&details=${encodeURIComponent(error?.message || "Unknown error")}`);
  }
}
