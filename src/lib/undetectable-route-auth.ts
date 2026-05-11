import { NextResponse } from "next/server";

function expectedOriginFromRequest(req: Request): string | null {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return null;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function isSameOriginBrowserRequest(req: Request): boolean {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return false;

  const expected = expectedOriginFromRequest(req);
  if (!expected) return false;

  if (origin !== expected) return false;

  // Best-effort: only browsers set this reliably; curl typically doesn't.
  const secFetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "same-origin") return true;

  const referer = req.headers.get("referer")?.trim();
  if (referer && referer.startsWith(expected)) return true;

  return false;
}

export function undetectableUnauthorized(req: Request): NextResponse | null {
  const secret = process.env.UNDETECTABLE_API_SECRET?.trim();
  if (!secret) return null;

  // Allow the local UI (same-origin browser fetches) without exposing the secret to the client.
  if (isSameOriginBrowserRequest(req)) return null;

  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const q = new URL(req.url).searchParams.get("secret")?.trim() ?? "";

  if (bearer === secret || q === secret) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

