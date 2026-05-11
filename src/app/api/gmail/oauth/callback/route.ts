import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireGmailOAuthEnv } from "@/lib/gmail/oauth-env";
import {
  clearGmailOauthStateCookie,
  readGmailOauthStateCookie,
} from "@/lib/gmail/oauth-state";
import { encryptRefreshToken } from "@/lib/gmail/token-crypto";

export const runtime = "nodejs";

type TokenExchangeResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

function redirectToGmail(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/gmail", req.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  if (error) {
    await clearGmailOauthStateCookie();
    return redirectToGmail(req, { gmailErr: `oauth_error:${error}` });
  }

  const cookieState = await readGmailOauthStateCookie();
  await clearGmailOauthStateCookie();

  if (!cookieState) {
    return redirectToGmail(req, { gmailErr: "missing_oauth_state" });
  }
  if (!state || state !== cookieState.csrf) {
    return redirectToGmail(req, { gmailErr: "invalid_oauth_state" });
  }
  if (!code) {
    return redirectToGmail(req, { gmailErr: "missing_oauth_code" });
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = requireGmailOAuthEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return redirectToGmail(req, { gmailErr: msg.slice(0, 180) });
  }

  const origin = url.origin;
  const redirectUri = new URL("/api/gmail/oauth/callback", origin).toString();

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    return redirectToGmail(req, { gmailErr: `token_exchange_failed:${tokenRes.status}:${text.slice(0, 120)}` });
  }

  const tokenJson = (await tokenRes.json()) as TokenExchangeResponse;
  const accessToken = tokenJson.access_token?.trim() ?? "";
  const refreshToken = tokenJson.refresh_token?.trim() ?? "";

  if (!accessToken) {
    return redirectToGmail(req, { gmailErr: "missing_access_token" });
  }

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) {
    const text = await infoRes.text().catch(() => "");
    return redirectToGmail(req, { gmailErr: `userinfo_failed:${infoRes.status}:${text.slice(0, 120)}` });
  }
  const info = (await infoRes.json()) as UserInfoResponse;
  const googleSub = info.sub?.trim() ?? "";
  const email = info.email?.trim() ?? "";

  if (!googleSub || !email) {
    return redirectToGmail(req, { gmailErr: "missing_userinfo" });
  }

  const userId = cookieState.userId;

  const existing = await prisma.gmailAccount.findUnique({
    where: { userId_googleSub: { userId, googleSub } },
  });

  if (!refreshToken && !existing) {
    return redirectToGmail(req, { gmailErr: "missing_refresh_token" });
  }

  let encryptedRefreshToken: string | null = null;
  if (refreshToken) {
    try {
      encryptedRefreshToken = encryptRefreshToken(refreshToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return redirectToGmail(req, { gmailErr: msg.slice(0, 180) });
    }
  }

  if (existing) {
    await prisma.gmailAccount.update({
      where: { id: existing.id },
      data: {
        email,
        ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
      },
    });
  } else {
    await prisma.gmailAccount.create({
      data: {
        userId,
        email,
        googleSub,
        encryptedRefreshToken: encryptedRefreshToken!,
      },
    });
  }

  return redirectToGmail(req, { gmailOk: "connected" });
}

