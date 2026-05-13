import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { clientInfoFromHeaders } from "@/lib/auth/client-info";
import { setSessionCookie, signSessionToken, tryAuthSecretKeyBytes } from "@/lib/auth/session";
import { requireGoogleOAuthEnv } from "@/lib/auth/google-oauth-env";
import { prisma } from "@/lib/prisma";
import {
  clearGoogleOauthStateCookie,
  readGoogleOauthStateCookie,
} from "@/lib/auth/google-oauth-state";

export const runtime = "nodejs";

type TokenExchangeResponse = {
  access_token?: string;
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

function redirectToLogin(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/login", req.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function GET(req: Request) {
  if (!tryAuthSecretKeyBytes()) {
    return redirectToLogin(req, { msg: "missing_auth_secret" });
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  if (error) {
    await clearGoogleOauthStateCookie();
    return redirectToLogin(req, { msg: `oauth_error:${error}` });
  }

  const cookieState = await readGoogleOauthStateCookie();
  await clearGoogleOauthStateCookie();

  if (!cookieState) {
    return redirectToLogin(req, { msg: "missing_oauth_state" });
  }
  if (!state || state !== cookieState.csrf) {
    return redirectToLogin(req, { msg: "invalid_oauth_state" });
  }
  if (!code) {
    return redirectToLogin(req, { msg: "missing_oauth_code" });
  }

  let clientId: string;
  let clientSecret: string;
  try {
    ({ clientId, clientSecret } = requireGoogleOAuthEnv());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return redirectToLogin(req, { msg: msg.slice(0, 180) });
  }

  const origin = url.origin;
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();

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
    return redirectToLogin(req, {
      msg: `token_exchange_failed:${tokenRes.status}:${text.slice(0, 120)}`,
    });
  }

  const tokenJson = (await tokenRes.json()) as TokenExchangeResponse;
  const accessToken = tokenJson.access_token?.trim() ?? "";

  if (!accessToken) {
    return redirectToLogin(req, { msg: "missing_access_token" });
  }

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) {
    const text = await infoRes.text().catch(() => "");
    return redirectToLogin(req, { msg: `userinfo_failed:${infoRes.status}:${text.slice(0, 120)}` });
  }
  const info = (await infoRes.json()) as UserInfoResponse;
  const googleSub = info.sub?.trim() ?? "";
  const email = info.email ? normalizeEmail(info.email) : "";
  const emailVerified = info.email_verified;

  if (!googleSub || !email) {
    return redirectToLogin(req, { msg: "missing_userinfo" });
  }
  if (emailVerified === false) {
    return redirectToLogin(req, { msg: "google_email_not_verified" });
  }

  let user = await prisma.user.findUnique({ where: { googleSub } });

  if (!user) {
    const byUsername = await prisma.user.findUnique({ where: { username: email } });
    if (byUsername?.googleSub && byUsername.googleSub !== googleSub) {
      return redirectToLogin(req, { msg: "google_sub_mismatch_for_user" });
    }
    user = byUsername ?? null;
  }

  if (user) {
    if (!user.googleSub) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleSub, googleEmail: email },
      });
    } else if (user.googleSub !== googleSub) {
      return redirectToLogin(req, { msg: "google_sub_mismatch_for_user" });
    } else if (user.googleEmail !== email) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleEmail: email },
      });
    }
  } else {
    const randomPassword = randomBytes(32).toString("base64url");
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    user = await prisma.user.create({
      data: {
        username: email,
        passwordHash,
        googleSub,
        googleEmail: email,
      },
    });
  }

  const { ip, userAgent, country, region, city } = clientInfoFromHeaders(req.headers);

  let token: string;
  try {
    token = await signSessionToken(user.id, user.username, {
      approved: user.isApproved,
      admin: user.isAdmin,
    });
  } catch {
    return redirectToLogin(req, { msg: "missing_auth_secret" });
  }
  await setSessionCookie(token);

  await prisma.userLoginAudit.create({
    data: {
      userId: user.id,
      ip,
      country,
      region,
      city,
      userAgent,
      method: "GOOGLE",
    },
  });

  const dest = user.isApproved ? (cookieState.next ?? "/") : "/pending-approval";
  return NextResponse.redirect(new URL(dest, origin));
}

