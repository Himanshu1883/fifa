import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { getAuthSecretKeyBytes } from "@/lib/auth/session";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

const STATE_TTL_SEC = 60 * 10;

type GoogleOauthStatePayload = {
  csrf: string;
  next?: string;
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
    path: "/api/auth/google/callback",
    maxAge: STATE_TTL_SEC,
  };
}

function safeNextPath(raw: string | null): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (!v.startsWith("/")) return undefined;
  if (v.startsWith("//")) return undefined;
  if (v.includes("://")) return undefined;
  if (v.includes("\n") || v.includes("\r")) return undefined;
  return v;
}

export function randomCsrfState(): string {
  return randomBytes(24).toString("base64url");
}

export async function setGoogleOauthStateCookie(payload: GoogleOauthStatePayload): Promise<void> {
  const key = getAuthSecretKeyBytes();
  const token = await new SignJWT({ csrf: payload.csrf, next: payload.next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SEC}s`)
    .sign(key);

  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_STATE_COOKIE, token, cookieOptions());
}

export async function readGoogleOauthStateCookie(): Promise<GoogleOauthStatePayload | null> {
  const jar = await cookies();
  const raw = jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!raw) return null;

  try {
    const key = getAuthSecretKeyBytes();
    const { payload } = await jwtVerify(raw, key, { algorithms: ["HS256"] });
    const csrf = payload.csrf;
    const next = safeNextPath(typeof payload.next === "string" ? payload.next : null);
    if (typeof csrf !== "string") return null;
    return { csrf, next };
  } catch {
    return null;
  }
}

export async function clearGoogleOauthStateCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_STATE_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

