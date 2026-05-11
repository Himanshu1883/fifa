import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { getAuthSecretKeyBytes } from "@/lib/auth/session";

export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

const STATE_TTL_SEC = 60 * 10;

type GmailOauthStatePayload = {
  csrf: string;
  userId: number;
};

function cookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail/oauth/callback",
    maxAge: STATE_TTL_SEC,
  };
}

export function randomCsrfState(): string {
  return randomBytes(24).toString("base64url");
}

export async function setGmailOauthStateCookie(payload: GmailOauthStatePayload): Promise<void> {
  const key = getAuthSecretKeyBytes();
  const token = await new SignJWT({ csrf: payload.csrf, userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SEC}s`)
    .sign(key);

  const jar = await cookies();
  jar.set(GMAIL_OAUTH_STATE_COOKIE, token, cookieOptions());
}

export async function readGmailOauthStateCookie(): Promise<GmailOauthStatePayload | null> {
  const jar = await cookies();
  const raw = jar.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  if (!raw) return null;

  try {
    const key = getAuthSecretKeyBytes();
    const { payload } = await jwtVerify(raw, key, { algorithms: ["HS256"] });
    const csrf = payload.csrf;
    const userId = payload.userId;
    if (typeof csrf !== "string") return null;
    if (typeof userId !== "number" || !Number.isFinite(userId)) return null;
    return { csrf, userId };
  } catch {
    return null;
  }
}

export async function clearGmailOauthStateCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(GMAIL_OAUTH_STATE_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

