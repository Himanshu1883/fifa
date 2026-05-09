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
 * POST `{ prefId?, prices: [{ categoryId, categoryBlockId, minPrice, maxPrice }] }`
 * or raw `[…]` + `?prefId=`. Resolves event by resale pref first, then primary `prefId`.
 * Stored rows use `catalogueSource` PRIMARY_PREF vs RESELL_PREF accordingly.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs =
    req.nextUrl.searchParams.get("prefId") ?? req.nextUrl.searchParams.get("resalePrefId");
  const amountUnit = amountUnitFromSearchParam(req.nextUrl.searchParams.get("amountUnit"));
  try {
    const { prefId, rows } = parseCategoryPricesWebhookBody(raw, prefQs, { amountUnit });

    const result = await prisma.$transaction(async (tx) =>
      syncEventCategoryBlockPrices(tx, prefId, rows, "pref-or-resale"),
    );

    if (!result) {
      return NextResponse.json(
        {
          error: `No event for catalogue pref "${prefId}" (match prefId or resalePrefId) — seed the event first.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      lookup: "pref-or-resale",
      prefId,
      catalogueSource: result.catalogueSource,
      eventId: result.eventId,
      rowCount: rows.length,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-category-prices webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const fullUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl,
    body: {
      prefId: "catalogue pref (or ?prefId= / ?resalePrefId= — same id value)",
      prices:
        '[{ "categoryId": "…", "categoryBlockId": "…", "minPrice": 10, "maxPrice": 99 }]',
      seatPriceRangesByAreaBlock:
        "optional ticketing export — nested block id → seatPriceRangesBySeatCat → { min, max }",
    },
    notes:
      "Optional convenience route: resolves resalePrefId first, then prefId (same as catalogue webhook). For unambiguous integrations use the dedicated pref and resale URLs in `explicit*` below.",
    query: {
      amountUnit:
        "omit or cents — amounts are integer cents, persisted as USD (÷100). Use amountUnit=usd if JSON already uses dollar amounts.",
    },
    explicitPrimaryPrefWebhook: new URL(
      "/api/webhooks/event-category-prices-pref",
      req.nextUrl.origin,
    ).toString(),
    explicitResalePrefWebhook: new URL(
      "/api/webhooks/event-category-prices-resale",
      req.nextUrl.origin,
    ).toString(),
  });
}
