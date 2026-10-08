import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readTokens, writeTokens } from '@/app/lib/tokens';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?error=oauth_rejected', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${new URL(request.url).origin}/api/auth/callback/youtube`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?error=missing_credentials', request.url));
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens securely
    const existingTokens = await readTokens();
    existingTokens.youtube = {
      ...existingTokens.youtube,
      ...tokens,
      refresh_token: tokens.refresh_token || existingTokens.youtube?.refresh_token,
    };
    await writeTokens(existingTokens);

    // Redirect back to app with success parameter
    return NextResponse.redirect(new URL('/?connected=youtube', request.url));
  } catch (err: any) {
    console.error('Error exchanging YouTube code for token:', err);
    return NextResponse.redirect(new URL(`/?error=token_exchange_failed&details=${encodeURIComponent(err.message || 'unknown')}`, request.url));
  }
}
