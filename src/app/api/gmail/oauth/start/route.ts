import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/require-user";
import { gmailTokenSecretStatus, requireGmailOAuthEnv } from "@/lib/gmail/oauth-env";
import { randomCsrfState, setGmailOauthStateCookie } from "@/lib/gmail/oauth-state";

export const runtime = "nodejs";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

export async function GET(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  let clientId: string;
  try {
    ({ clientId } = requireGmailOAuthEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const tokenSecret = gmailTokenSecretStatus();
  if (!tokenSecret.ok) {
    return NextResponse.json({ error: tokenSecret.reason }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = new URL("/api/gmail/oauth/callback", origin).toString();

  const state = randomCsrfState();
  await setGmailOauthStateCookie({ csrf: state, userId });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}

