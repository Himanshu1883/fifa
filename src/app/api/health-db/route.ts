import { NextResponse } from "next/server";

import { maskedDatabaseUrlAfterHydrate, prisma } from "@/lib/prisma";
import { formatDbConnectionError } from "@/lib/db-query";

function healthDbAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const secret =
    process.env.HEALTH_DB_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const qs = new URL(request.url).searchParams.get("secret")?.trim();
  return bearer === secret || qs === secret;
}

/**
 * Dev helper: `curl -s localhost:3000/api/health-db`
 * Production (requires HEALTH_DB_SECRET or CRON_SECRET):
 *   curl -sS -H "Authorization: Bearer $CRON_SECRET" https://eventdetail.vercel.app/api/health-db
 */
export async function GET(request: Request) {
  if (!healthDbAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const maskedUrl = maskedDatabaseUrlAfterHydrate();
  const hostHint = (() => {
    try {
      const raw = process.env.DATABASE_URL?.trim();
      if (!raw) return null;
      const host = new URL(raw.replace(/^postgres(ql)?:/i, "http:")).hostname;
      if (host.endsWith(".railway.internal")) return "railway-internal";
      if (host.endsWith(".proxy.rlwy.net")) return "railway-public-proxy";
      return host;
    } catch {
      return null;
    }
  })();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, databaseUrl: maskedUrl, hostHint });
  } catch (e) {
    const message = formatDbConnectionError(e);
    return NextResponse.json(
      {
        ok: false,
        databaseUrl: maskedUrl,
        hostHint,
        error: message.slice(0, 800),
      },
      { status: 503 },
    );
  }
}
