import { NextResponse } from "next/server";

import {
  loadSbCatalogListingDetail,
  loadSbListingsCatalog,
  loadSbListingsCatalogSummary,
  loadSbListingsForEvent,
} from "@/lib/sb-listings-catalog";
import { totalCatalogListingCount } from "@/lib/sb-listings-catalog-types";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(url: string, key: string): number | null {
  const raw = new URL(url).searchParams.get(key);
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const eventId = parsePositiveInt(req.url, "eventId");
    const logId = parsePositiveInt(req.url, "logId");
    const full = url.searchParams.get("full") === "1";
    const repair = url.searchParams.get("repair") === "1";

    if (logId != null) {
      const listing = await loadSbCatalogListingDetail(logId);
      if (!listing) {
        return NextResponse.json({ ok: false, error: "Push log not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, listing, configured: Boolean(getSeatsBrokersConfig()) });
    }

    if (eventId != null) {
      const match = await loadSbListingsForEvent(eventId, { repair });
      if (!match) {
        return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        match,
        configured: Boolean(getSeatsBrokersConfig()),
      });
    }

    const matches = full ? await loadSbListingsCatalog() : await loadSbListingsCatalogSummary();
    const listingCount = matches.reduce((n, m) => n + totalCatalogListingCount(m), 0);

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
