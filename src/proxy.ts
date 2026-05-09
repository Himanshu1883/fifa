import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  tryAuthSecretKeyBytes,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Sessions: `/` and `/events/*` need a valid session cookie + `AUTH_SECRET`.
 * Public: `/login`, `/api/*`, and static assets.
 *
 * Local dev (optional): set `DISABLE_AUTH_PROXY=1` in `.env` to open `/` without login.
 *
 * Next.js **16.x** uses `proxy.ts` with a named `proxy` export here (Node runtime in this app).
 * The older `middleware.ts` / `middleware` name still works but is deprecated — see build warning
 * and https://nextjs.org/docs/messages/middleware-to-proxy
 */
export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DISABLE_AUTH_PROXY === "1"
  ) {
    return NextResponse.next();
  }

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
