import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  tryAuthSecretKeyBytes,
  verifySessionToken,
  signSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

function redirectToLogin(request: NextRequest, msg: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("msg", msg);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/login") {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}

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

  const path = request.nextUrl.pathname;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const key = tryAuthSecretKeyBytes();

  if (!key) {
    return redirectToLogin(request, "missing_auth_secret");
  }

  if (!token) {
    return redirectToLogin(request, "signin_required");
  }

  const session = await verifySessionToken(token, key);
  if (!session) {
    return redirectToLogin(request, "signin_required");
  }

  // If the session claims say "not approved/admin", do a secure DB check so
  // a newly-approved user doesn't have to log out/in just to refresh claims.
  // (We avoid DB hits on the common, already-approved path.)
  if (!session.approved || (path.startsWith("/admin") && !session.admin)) {
    const userId = Number(session.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return redirectToLogin(request, "signin_required");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, isApproved: true, isAdmin: true },
    });
    if (!user) {
      return redirectToLogin(request, "signin_required");
    }

    const isApproved = user.isApproved === true;
    const isAdmin = user.isAdmin === true;

    if (!isApproved && path !== "/pending-approval") {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      return NextResponse.redirect(url);
    }

    if (path.startsWith("/admin") && !isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Refresh claims if they differ from the cookie.
    if (session.approved !== isApproved || session.admin !== isAdmin || session.name !== user.username) {
      const refreshed = await signSessionToken(user.id, user.username, {
        approved: isApproved,
        admin: isAdmin,
      });
      const res = NextResponse.next();
      res.cookies.set(SESSION_COOKIE, refreshed, sessionCookieOptions());
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/events/:path*",
    "/gmail/:path*",
    "/settings/:path*",
    "/buying-criteria/:path*",
    "/resale/:path*",
    "/undetectable/:path*",
    "/admin/:path*",
    "/pending-approval",
  ],
};
