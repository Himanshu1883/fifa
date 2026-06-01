import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadTransformedSeatOffersForEvent,
  parseOptionalMarkupPercentParam,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { sbCreateTicket } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import type { SbCategoryNum } from "@/lib/sb-category";
import { computeDateToShip } from "@/lib/sb-date-to-ship";
import { loadSbMatchCatalogForOffers, serializeSbCatalogBlocks } from "@/lib/seatsbrokers-catalog";
import {
  enrichMappedTicketForPush,
  isLikelyFifaSnowflakeId,
  mapOffersToSeatsBrokersCreateTickets,
} from "@/lib/seatsbrokers-offer-map";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["RESALE", "LAST_MINUTE"]).optional(),
  dryRun: z.enum(["0", "1", "true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

const ticketFieldSchema = z.record(z.string(), z.string());

const pushBodySchema = z.object({
  tickets: z
    .array(
      z.object({
        offerIndex: z.number().int().min(0).optional(),
        fields: ticketFieldSchema,
        summary: z
          .object({
            offerType: z.string(),
            quantity: z.number(),
            priceUsd: z.number().nullable(),
            fifaCategoryId: z.string().optional(),
            sbCategoryId: z.string().optional(),
            categoryName: z.string().optional(),
            categoryNum: z.number().int().min(1).max(4).nullable().optional(),
            categoryLabel: z.string().optional(),
            fifaBlockId: z.string().optional(),
            sbBlockId: z.string().optional(),
            sbBlockCode: z.string().optional(),
            sbBlockMatched: z.boolean().optional(),
            sbBlockOptions: z
              .array(z.object({ rowId: z.string(), blockId: z.string() }))
              .optional(),
            blockName: z.string().optional(),
            row: z.string(),
            seatNumbers: z.array(z.string()),
            priceRaw: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(500),
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

  const inventoryKind = parsedQuery.data.kind ?? SEATS_BROKERS_PUSH_INVENTORY_KIND;

  try {
    const loaded = await loadTransformedSeatOffersForEvent(id, {
      kind: inventoryKind,
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

    const offers = loaded.transform.offers.filter((o) => o.kind === inventoryKind);
    const eventDateIso = loaded.event.eventDate?.toISOString().slice(0, 10) ?? null;
    const dateToShip = computeDateToShip(loaded.event.eventDate);
    const catalog = await loadSbMatchCatalogForOffers(matchId, offers, sbConfig);
    const allMapped = mapOffersToSeatsBrokersCreateTickets(offers, matchId, sbConfig, dateToShip, catalog);
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
        inventoryKind,
        eventId: loaded.event.id,
        eventName: loaded.event.name,
        matchId,
        markupPercent: loaded.markupPercent,
        offerCount: rawOfferCount,
        mappableCount,
        pushCount: effectiveLimit,
        limit: limitParam ?? null,
        eventDate: eventDateIso,
        dateToShip,
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        inventoryKind,
        eventId: loaded.event.id,
        eventName: loaded.event.name,
        matchId,
        eventDate: eventDateIso,
        dateToShip,
        markupPercent: loaded.markupPercent,
        offerCount: rawOfferCount,
        mappableCount,
        pushCount: slice.length,
        limit: limitParam ?? null,
        offset: offsetParam,
        hasMore: offsetParam + slice.length < mappableCount,
        sbCatalog: {
          categories: catalog.categories,
          blocksByCategoryId: serializeSbCatalogBlocks(catalog),
          dropdownError: catalog.dropdownError ?? null,
        },
        tickets: slice.map((m) => {
          const { sbBlockOptions, ...summaryRest } = m.summary;
          return {
            offerIndex: m.offerIndex,
            fields: m.fields,
            summary: {
              ...summaryRest,
              priceRaw: offers[m.offerIndex]?.priceRaw ?? null,
            },
            sbBlockOptions,
          };
        }),
      });
    }

    let bodyTickets: z.infer<typeof pushBodySchema>["tickets"] | null = null;
    if (!dryRun) {
      try {
        const raw = await req.json();
        const parsedBody = pushBodySchema.safeParse(raw);
        if (parsedBody.success) bodyTickets = parsedBody.data.tickets;
      } catch {
        /* empty body → server-side limit slice */
      }
    }

    const rawTicketsToPush: typeof pushSlice =
      bodyTickets?.map((t, i) => ({
        offerIndex: t.offerIndex ?? i,
        fields: t.fields,
        summary: {
          offerType: (t.summary?.offerType === "together" ? "together" : "single") as "single" | "together",
          quantity: t.summary?.quantity ?? (Number.parseInt(t.fields.quantity ?? "0", 10) || 0),
          priceUsd: t.summary?.priceUsd ?? (Number.parseFloat(t.fields.price ?? "0") || null),
          fifaCategoryId: t.summary?.fifaCategoryId ?? "",
          sbCategoryId: t.summary?.sbCategoryId ?? t.fields.ticket_category ?? "",
          categoryName: t.summary?.categoryName ?? "",
          categoryNum: (() => {
            const fromSummary = t.summary?.categoryNum;
            if (fromSummary === 1 || fromSummary === 2 || fromSummary === 3 || fromSummary === 4) {
              return fromSummary as SbCategoryNum;
            }
            return null;
          })(),
          categoryLabel: t.summary?.categoryLabel ?? "",
          fifaBlockId: t.summary?.fifaBlockId ?? "",
          sbBlockId: t.summary?.sbBlockId ?? t.fields.ticket_block ?? "",
          sbBlockCode: t.summary?.sbBlockCode ?? "",
          sbBlockMatched: t.summary?.sbBlockMatched ?? Boolean(t.fields.ticket_block?.trim()),
          sbBlockOptions: t.summary?.sbBlockOptions ?? [],
          blockName: t.summary?.blockName ?? "",
          row: t.summary?.row ?? t.fields.ticket_row ?? "",
          seatNumbers:
            t.summary?.seatNumbers ?? (t.fields.ticket_details ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        },
      })) ?? pushSlice;

    const ticketsToPush: typeof pushSlice = [];
    for (const raw of rawTicketsToPush) {
      const enriched = enrichMappedTicketForPush(raw, offers, matchId, sbConfig, dateToShip, catalog);
      if (enriched) ticketsToPush.push(enriched);
    }

    const results: Array<{
      offerIndex: number;
      ok: boolean;
      status?: number;
      fields?: Record<string, string>;
      summary: (typeof allMapped)[0]["summary"];
      response?: unknown;
      error?: string;
    }> = [];

    let created = 0;
    let failed = 0;

    for (const item of ticketsToPush) {
      const fields: Record<string, string> = {
        ...item.fields,
        match_id: item.fields.match_id?.trim() || matchId,
      };
      const block = fields.ticket_block?.trim() ?? "";

      if (!block || isLikelyFifaSnowflakeId(block) || !item.summary.sbBlockMatched) {
        failed++;
        results.push({
          offerIndex: item.offerIndex,
          ok: false,
          fields,
          summary: item.summary,
          error: block
            ? `ticket_block "${block}" is not a valid SeatsBrokers block row id for this category. Open preview, pick SB block in Edit, then push again.`
            : "No SeatsBrokers ticket_block (block row id) mapped for this offer. Load preview and select a block from the SB list.",
        });
        continue;
      }

      const res = await sbCreateTicket(fields, sbConfig);
      if (res.ok) {
        created++;
        results.push({
          offerIndex: item.offerIndex,
          ok: true,
          status: res.status,
          fields,
          summary: item.summary,
          response: res.data,
        });
      } else {
        failed++;
        results.push({
          offerIndex: item.offerIndex,
          ok: false,
          status: res.status,
          fields,
          summary: item.summary,
          error: res.error,
          response: res.raw,
        });
      }
    }

    return NextResponse.json({
      ok: failed === 0,
      dryRun: false,
      inventoryKind,
      eventId: loaded.event.id,
      eventName: loaded.event.name,
      matchId,
      markupPercent: loaded.markupPercent,
      offerCount: rawOfferCount,
      mappableCount,
      pushCount: ticketsToPush.length,
      limit: limitParam ?? null,
      eventDate: eventDateIso,
      dateToShip,
      created,
      failed,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
