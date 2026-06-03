import { NextResponse } from "next/server";

import { loadSbListingsCatalog } from "@/lib/sb-listings-catalog";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await loadSbListingsCatalog();
    const listingCount = matches.reduce((n, m) => n + m.listings.length, 0);
    return NextResponse.json({
      ok: true,
      matches,
      configured: Boolean(getSeatsBrokersConfig()),
      listingCount,
      matchCount: matches.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
