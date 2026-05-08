import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  tryAuthSecretKeyBytes,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Authenticated areas: `/` (home) and `/events/*` require a valid session JWT cookie.
 * Public: `/login`, `/api/*` (webhooks, health, logout), and Next static assets.
 * Unauthenticated users hitting protected routes are sent to `/login` so the app stays gated.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const key = tryAuthSecretKeyBytes();

  if (!key) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const session = await verifySessionToken(token, key);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/events/:path*"],
};
