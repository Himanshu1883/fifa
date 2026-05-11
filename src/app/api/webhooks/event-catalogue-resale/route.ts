import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CataloguePayloadError,
  parseCatalogueWebhookBody,
} from "@/lib/price-range-catalogue";
import {
  syncEventCategoriesFromCatalogue,
  upsertEventCategoryBlockAvailabilityFromCatalogue,
} from "@/lib/sync-event-catalogue";

/** Prisma Client uses the `pg` driver; use Node runtime (not Edge). */
export const runtime = "nodejs";

/**
 * Same payload as `/api/webhooks/event-catalogue`, but resolves the event **only** via
 * `Event.resalePrefId ===` catalogue pref (`prefId` in body or `?resalePrefId=` / `?prefId=`).
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs =
    req.nextUrl.searchParams.get("resalePrefId") ?? req.nextUrl.searchParams.get("prefId");
  try {
    const { prefId, rows, availabilityRows } = parseCatalogueWebhookBody(raw, prefQs);

    const result = await prisma.$transaction(async (tx) => {
      const synced = await syncEventCategoriesFromCatalogue(tx, prefId, rows, "resale-only");
      if (!synced) return { missingEvent: true as const };
      const availability = await upsertEventCategoryBlockAvailabilityFromCatalogue(
        tx,
        synced.eventId,
        availabilityRows,
      );
      return { missingEvent: false as const, ...synced, ...availability };
    });

    if (result.missingEvent) {
      return NextResponse.json(
        {
          error: `No event with resalePrefId "${prefId}" — set Event.resalePrefId in seed (or DB) first.`,
        },
        { status: 404 },
      );
    }

    const uniqueCategoryIds = new Set(rows.map((r) => r.categoryId));

    return NextResponse.json({
      ok: true,
      lookup: "resale-only",
      resalePrefId: prefId,
      eventId: result.eventId,
      rowCount: rows.length,
      uniqueRowCount: result.uniqueRowCount,
      insertedCount: result.insertedCount,
      skippedExistingCount: result.skippedExistingCount,
      availabilityUniqueRowCount: result.availabilityUniqueRowCount,
      availabilityUpsertedCount: result.availabilityUpsertedCount,
      categoryCount: uniqueCategoryIds.size,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-catalogue-resale webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const base = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl: base,
    lookup: "resale-only",
    notes:
      "Resale-pref variant: catalogue `prefId` must match `Event.resalePrefId` (not Event.prefId). Same JSON body as /api/webhooks/event-catalogue.",
    body: {
      prefId:
        "ticketing / catalogue pref id that equals Event.resalePrefId (or omit and use ?resalePrefId= or ?prefId=)",
      categories: 'or "priceRangeCategories" — same seat-map array shape',
    },
    usage:
      "POST JSON here when you only want to target events by resale catalogue pref. Raw array bodies need ?resalePrefId=10229225516056 (or ?prefId=).",
    categoryBlockPricesResaleWebhook: new URL(
      "/api/webhooks/event-category-prices-resale",
      req.nextUrl.origin,
    ).toString(),
  });
}
