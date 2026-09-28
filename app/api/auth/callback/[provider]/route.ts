import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    console.error(`OAuth Error for ${provider}:`, error);
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (code && (provider === "youtube" || provider === "gmail")) {
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      // Reconstruct the exact redirect URI used in the initial request
      const redirectUri = `${url.origin}/api/auth/callback/${provider}`;
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();
      
      if (tokens.error) {
        console.error("Token Exchange Error:", tokens);
      } else {
        // Save the tokens locally for the dev environment so the backend can use them!
        const fs = require('fs');
        let allTokens: Record<string, any> = {};
        try { allTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8')); } catch(e) {}
        allTokens[provider] = tokens;
        fs.writeFileSync('tokens.json', JSON.stringify(allTokens, null, 2));
        
        console.log(`Successfully obtained and saved tokens for ${provider}`);
      }
    } catch (exchangeError) {
      console.error("Failed to exchange OAuth code:", exchangeError);
    }
  }
  
  // Redirect back to the homepage
  return NextResponse.redirect(new URL(`/?connected=${provider}`, request.url));
}
