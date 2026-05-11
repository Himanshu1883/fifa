import { NextResponse } from "next/server";

import { tryAuthSecretKeyBytes } from "@/lib/auth/session";
import { requireGoogleOAuthEnv } from "@/lib/auth/google-oauth-env";
import { randomCsrfState, setGoogleOauthStateCookie } from "@/lib/auth/google-oauth-state";

export const runtime = "nodejs";

const SCOPES = ["openid", "email", "profile"];

function safeNextPath(raw: string | null): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (!v.startsWith("/")) return undefined;
  if (v.startsWith("//")) return undefined;
  if (v.includes("://")) return undefined;
  if (v.includes("\n") || v.includes("\r")) return undefined;
  return v;
}

export async function GET(req: Request) {
  if (!tryAuthSecretKeyBytes()) {
    const url = new URL("/login", req.url);
    url.searchParams.set("msg", "missing_auth_secret");
    return NextResponse.redirect(url);
  }

  let clientId: string;
  try {
    ({ clientId } = requireGoogleOAuthEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const url = new URL("/login", req.url);
    url.searchParams.set("msg", msg.slice(0, 180));
    return NextResponse.redirect(url);
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();

  const state = randomCsrfState();
  const next = safeNextPath(url.searchParams.get("next"));
  try {
    await setGoogleOauthStateCookie({ csrf: state, next });
  } catch {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("msg", "missing_auth_secret");
    return NextResponse.redirect(loginUrl);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}

