import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveOfferForSeatIds } from "@/lib/sb-offer-match";
import {
  loadTransformedSeatOffersForEvent,
  parseOptionalMarkupPercentParam,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { parseSbTicketTypeId } from "@/lib/sb-ticket-types";
import { pushSingleSbOfferForEvent } from "@/lib/seatsbrokers-push-service";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const runtime = "nodejs";

const querySchema = z.object({
  offerIndex: z.coerce.number().int().min(0).max(10_000).optional(),
});

const bodySchema = z.object({
  seatIds: z.array(z.string().min(1)).min(1).max(50).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  if (!getSeatsBrokersConfig()) {
    return NextResponse.json(
      { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    offerIndex: url.searchParams.get("offerIndex")?.trim() || undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ ok: false, error: "Invalid query parameters." }, { status: 400 });
  }

  let markupPercent: number | "persisted" = "persisted";
  try {
    markupPercent = parseOptionalMarkupPercentParam(url.searchParams.get("markupPercent"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const ticketType = parseSbTicketTypeId(url.searchParams.get("ticketType")?.trim());

  let offerIndex = parsedQuery.data.offerIndex;
  let sourceSeatIds: string[] | undefined;

  const raw = await req.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(raw);
  const bodySeatIds =
    parsedBody.success && parsedBody.data.seatIds?.length ? parsedBody.data.seatIds : undefined;

  if (bodySeatIds?.length) {
    sourceSeatIds = bodySeatIds;
    if (offerIndex == null) {
      const loaded = await loadTransformedSeatOffersForEvent(id, {
        kind: SEATS_BROKERS_PUSH_INVENTORY_KIND,
        markupPercent,
      });
      if (!loaded) {
        return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
      }
      const offers = loaded.transform.offers.filter((o) => o.kind === SEATS_BROKERS_PUSH_INVENTORY_KIND);
      const resolved = resolveOfferForSeatIds(bodySeatIds, offers);
      if (!resolved) {
        return NextResponse.json(
          { ok: false, error: "No matching offer for these seats. Try refreshing the page." },
          { status: 422 },
        );
      }
      offerIndex = resolved.offerIndex;
    }
  }

  if (offerIndex == null) {
    return NextResponse.json(
      { ok: false, error: "Provide offerIndex query param or seatIds in JSON body." },
      { status: 400 },
    );
  }

  try {
    const result = await pushSingleSbOfferForEvent(id, offerIndex, { ticketType, sourceSeatIds });
    if (!result.ok) {
      const status = result.skipped ? 409 : 422;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
