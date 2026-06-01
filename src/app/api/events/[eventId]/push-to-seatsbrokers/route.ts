import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadTransformedSeatOffersForEvent,
  parseOptionalMarkupPercentParam,
} from "@/lib/event-seat-offers-service";
import { sbCreateTicket } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { mapOffersToSeatsBrokersCreateTickets } from "@/lib/seatsbrokers-offer-map";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["RESALE", "LAST_MINUTE"]).optional(),
  dryRun: z.enum(["0", "1", "true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const sbConfig = getSeatsBrokersConfig();
  if (!sbConfig) {
    return NextResponse.json(
      {
        ok: false,
        error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    kind: url.searchParams.get("kind")?.trim().toUpperCase() || undefined,
    dryRun: url.searchParams.get("dryRun")?.trim() || undefined,
    limit: url.searchParams.get("limit")?.trim() || undefined,
    offset: url.searchParams.get("offset")?.trim() || undefined,
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

  const dryRun =
    parsedQuery.data.dryRun === "1" ||
    parsedQuery.data.dryRun === "true" ||
    url.searchParams.get("dryRun") === "1";

  try {
    const loaded = await loadTransformedSeatOffersForEvent(id, {
      kind: parsedQuery.data.kind,
      markupPercent,
    });
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
    }

    const matchId = loaded.event.sbEventId?.trim();
    if (!matchId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Event has no SB ID (match_id). Add it via the Add SB ID button first.",
          eventId: loaded.event.id,
          eventName: loaded.event.name,
        },
        { status: 422 },
      );
    }

    const { offers } = loaded.transform;
    const allMapped = mapOffersToSeatsBrokersCreateTickets(offers, matchId, sbConfig);
    const mappableCount = allMapped.length;
    const rawOfferCount = offers.length;
    const limitParam = parsedQuery.data.limit;
    const offsetParam = parsedQuery.data.offset ?? 0;
    const remaining = Math.max(0, mappableCount - offsetParam);
    const pageSize =
      limitParam != null && Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, remaining)
        : remaining;
    const slice = allMapped.slice(offsetParam, offsetParam + pageSize);
    const effectiveLimit =
      limitParam != null && Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, mappableCount)
        : mappableCount;
    const pushSlice = allMapped.slice(0, effectiveLimit);

    const countOnly = url.searchParams.get("countOnly") === "1";

    if (dryRun && countOnly) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        countOnly: true,
        eventId: loaded.event.id,
        eventName: loaded.event.name,
        matchId,
        markupPercent: loaded.markupPercent,
        offerCount: rawOfferCount,
        mappableCount,
        pushCount: effectiveLimit,
        limit: limitParam ?? null,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        eventId: loaded.event.id,
        eventName: loaded.event.name,
        matchId,
        markupPercent: loaded.markupPercent,
        offerCount: rawOfferCount,
        mappableCount,
        pushCount: slice.length,
        limit: limitParam ?? null,
        offset: offsetParam,
        hasMore: offsetParam + slice.length < mappableCount,
        tickets: slice.map((m) => ({ fields: m.fields, summary: m.summary })),
      });
    }

    const results: Array<{
      offerIndex: number;
      ok: boolean;
      status?: number;
      summary: (typeof allMapped)[0]["summary"];
      response?: unknown;
      error?: string;
    }> = [];

    let created = 0;
    let failed = 0;

    for (const item of pushSlice) {
      const res = await sbCreateTicket(item.fields, sbConfig);
      if (res.ok) {
        created++;
        results.push({
          offerIndex: item.offerIndex,
          ok: true,
          status: res.status,
          summary: item.summary,
          response: res.data,
        });
      } else {
        failed++;
        results.push({
          offerIndex: item.offerIndex,
          ok: false,
          status: res.status,
          summary: item.summary,
          error: res.error,
          response: res.raw,
        });
      }
    }

    return NextResponse.json({
      ok: failed === 0,
      dryRun: false,
      eventId: loaded.event.id,
      eventName: loaded.event.name,
      matchId,
      markupPercent: loaded.markupPercent,
      offerCount: rawOfferCount,
      mappableCount,
      pushCount: pushSlice.length,
      limit: limitParam ?? null,
      created,
      failed,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
