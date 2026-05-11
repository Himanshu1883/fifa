import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import {
  amountUnitFromSearchParam,
  parseCategoryPricesWebhookBody,
} from "@/lib/parse-category-prices-webhook";
import { syncEventCategoryBlockPrices } from "@/lib/sync-event-category-prices";

export const runtime = "nodejs";

/**
 * **Primary pref only:** `prefId` must match `Event.prefId` (ticketing catalogue).
 * Does not look at `resalePrefId`. Rows stored as `catalogue_source` = PRIMARY_PREF.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs = req.nextUrl.searchParams.get("prefId");
  const amountUnit = amountUnitFromSearchParam(req.nextUrl.searchParams.get("amountUnit"));
  try {
    const { prefId, rows } = parseCategoryPricesWebhookBody(raw, prefQs, { amountUnit });

    const result = await prisma.$transaction(async (tx) =>
      syncEventCategoryBlockPrices(tx, prefId, rows, "primary-only"),
    );

    if (!result) {
      return NextResponse.json(
        {
          error: `No event with prefId "${prefId}" — id must match Event.prefId (primary catalogue), not resale.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      lookup: "primary-only",
      prefId,
      catalogueSource: result.catalogueSource,
      eventId: result.eventId,
      rowCount: rows.length,
      uniqueRowCount: result.uniqueRowCount,
      insertedCount: result.insertedCount,
      skippedExistingCount: result.skippedExistingCount,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-category-prices-pref webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const base = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl: base,
    lookup: "primary-only",
    notes:
      "Use this URL when your feed sends the primary ticketing pref id (Event.prefId). For resale catalogue ids use /api/webhooks/event-category-prices-resale.",
    body: {
      prefId: "must match Event.prefId (or ?prefId= with raw array body)",
      prices: "array of { categoryId, categoryBlockId, minPrice, maxPrice }",
    },
    resalePriceWebhook: new URL(
      "/api/webhooks/event-category-prices-resale",
      req.nextUrl.origin,
    ).toString(),
    autoLookupWebhook: new URL("/api/webhooks/event-category-prices", req.nextUrl.origin).toString(),
  });
}
