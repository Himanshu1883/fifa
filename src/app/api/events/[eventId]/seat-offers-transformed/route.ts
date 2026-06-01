import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadTransformedSeatOffersForEvent,
  parseOptionalMarkupPercentParam,
} from "@/lib/event-seat-offers-service";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["RESALE", "LAST_MINUTE"]).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    kind: url.searchParams.get("kind")?.trim().toUpperCase() || undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query. kind must be RESALE or LAST_MINUTE." },
      { status: 400 },
    );
  }

  let markupPercent: number | "persisted" = "persisted";
  try {
    markupPercent = parseOptionalMarkupPercentParam(url.searchParams.get("markupPercent"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const loaded = await loadTransformedSeatOffersForEvent(id, {
      kind: parsedQuery.data.kind,
      markupPercent,
    });
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
    }

    const { offers, skippedEmptyBuckets, summary } = loaded.transform;

    return NextResponse.json({
      ok: true,
      eventId: loaded.event.id,
      sbEventId: loaded.event.sbEventId,
      prefId: loaded.event.prefId,
      resalePrefId: loaded.event.resalePrefId,
      eventName: loaded.event.name,
      sourceRowCount: loaded.sourceRowCount,
      offerCount: offers.length,
      skippedEmptyBuckets,
      markupPercent: loaded.markupPercent,
      rules: {
        together: "4→1, 5→2, 6→2, 7→4, 10→4; other counts pass through",
        single: "4→1, 5→2, 6→2, 7→2; other counts pass through",
        markup:
          "Uses persisted UI markup when ?markupPercent is omitted; ?markupPercent=N overrides for testing; multiplies priceUsd and priceRaw by (1 + N/100); UI prices are unmarked",
        note: "See TOGETHER_QUANTITY_MAP / SINGLE_QUANTITY_MAP in seat-offers-transform.ts",
      },
      offers: offers satisfies TransformedSeatOffer[],
      summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
