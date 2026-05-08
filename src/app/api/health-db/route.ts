import { NextResponse } from "next/server";

import { maskedDatabaseUrlAfterHydrate, prisma } from "@/lib/prisma";

/**
 * Dev helper: run `curl -s localhost:3000/api/health-db` to confirm DATABASE_URL + Postgres auth.
 * Disabled in production (returns 404).
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const maskedUrl = maskedDatabaseUrlAfterHydrate();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, databaseUrl: maskedUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        databaseUrl: maskedUrl,
        error: message.slice(0, 800),
      },
      { status: 503 },
    );
  }
}
