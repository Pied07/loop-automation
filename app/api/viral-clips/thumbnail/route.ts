import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/app/lib/tokens";

export const dynamic = "force-dynamic";

// In-memory cache for resolved thumbnail URLs to minimize Graph API calls
const thumbCache = new Map<string, { url: string; expires: number }>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const facebookId = searchParams.get("facebookId");
  const format = searchParams.get("format") || "Trending";

  if (facebookId) {
    const cached = thumbCache.get(facebookId);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.redirect(cached.url, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }

    try {
      const tokens: any = await readTokens();
      const pageToken = tokens.facebook?.page_access_token || tokens.facebook?.access_token;
      if (pageToken) {
        const res = await fetch(
          `https://graph.facebook.com/v26.0/${facebookId}?fields=picture,thumbnails&access_token=${pageToken}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
          const data = await res.json();
          const preferredThumb =
            data.thumbnails?.data?.find((t: any) => t.is_preferred)?.uri ||
            data.thumbnails?.data?.[0]?.uri ||
            data.picture;

          if (preferredThumb) {
            thumbCache.set(facebookId, { url: preferredThumb, expires: Date.now() + 24 * 60 * 60 * 1000 });
            return NextResponse.redirect(preferredThumb, {
              status: 302,
              headers: {
                "Cache-Control": "public, max-age=86400, s-maxage=86400",
              },
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("Facebook thumbnail fetch notice:", err?.message);
    }
  }

  // Fallback: Generate an elegant dark gradient SVG poster with category badge
  const safeCategory = format.slice(0, 30);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#14151f"/>
        <stop offset="50%" stop-color="#0b0c10"/>
        <stop offset="100%" stop-color="#1b1016"/>
      </linearGradient>
      <linearGradient id="btn" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ff334b"/>
        <stop offset="100%" stop-color="#e50914"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="30" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="720" height="1280" fill="url(#bg)"/>
    <circle cx="360" cy="640" r="180" fill="#e50914" opacity="0.12" filter="url(#glow)"/>
    <circle cx="360" cy="640" r="70" fill="url(#btn)" stroke="#ffffff" stroke-width="3" opacity="0.9"/>
    <polygon points="350,610 385,640 350,670" fill="#ffffff"/>
    <rect x="220" y="760" width="280" height="48" rx="24" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.18"/>
    <text x="360" y="792" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="2">${safeCategory.toUpperCase()}</text>
  </svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
