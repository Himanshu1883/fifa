import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AUTH_SECRET_SETUP_ROUTE } from "@/lib/auth-secret-docs";

export const SESSION_COOKIE = "session";
/** 7 days */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

const MIN_SECRET_LEN = 32;

/** Dev-only escape hatch; requires explicit opt-in. Never use in production. */
const DEV_INSECURE_FALLBACK = "dev-insecure-auth-secret-change-in-production";

function resolveAuthSecretRaw(): string | null {
  const raw = process.env.AUTH_SECRET?.trim();
  if (raw && raw.length >= MIN_SECRET_LEN) return raw;
  if (raw && raw.length > 0) return null;

  if (
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_INSECURE_DEV_AUTH === "1"
  ) {
    return DEV_INSECURE_FALLBACK;
  }

  return null;
}

export function getAuthSecretKeyBytes(): Uint8Array {
  const secret = resolveAuthSecretRaw();
  if (!secret) {
    throw new Error(
      `AUTH_SECRET must be set to a random string of at least ${MIN_SECRET_LEN} characters. See DEPLOY.md (repo) or open ${AUTH_SECRET_SETUP_ROUTE} in this app.`,
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * For Edge middleware: return null if secret is missing/short (misconfiguration).
 */
export function tryAuthSecretKeyBytes(): Uint8Array | null {
  const secret = resolveAuthSecretRaw();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export type SessionPayload = { sub: string; name: string };

export async function signSessionToken(userId: number, username: string): Promise<string> {
  const key = getAuthSecretKeyBytes();
  return new SignJWT({ name: username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(key);
}

export async function verifySessionToken(
  token: string,
  key?: Uint8Array,
): Promise<SessionPayload | null> {
  try {
    const k = key ?? tryAuthSecretKeyBytes();
    if (!k) return null;
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    const sub = payload.sub;
    const name = payload.name;
    if (typeof sub !== "string" || typeof name !== "string") return null;
    return { sub, name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return verifySessionToken(raw);
}

export function sessionCookieOptions(): {
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
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
