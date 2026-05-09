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
 * Same price payload as /api/webhooks/event-category-prices, but event lookup is
 * **only** `Event.resalePrefId ===` pref (query `?resalePrefId=` / `?prefId=` or body prefId).
 * Stored `catalogueSource` is always RESELL_PREF.
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
  const amountUnit = amountUnitFromSearchParam(req.nextUrl.searchParams.get("amountUnit"));
  try {
    const { prefId, rows } = parseCategoryPricesWebhookBody(raw, prefQs, { amountUnit });

    const result = await prisma.$transaction(async (tx) =>
      syncEventCategoryBlockPrices(tx, prefId, rows, "resale-only"),
    );

    if (!result) {
      const byPrimary = await prisma.event.findFirst({
        where: { prefId },
        select: { resalePrefId: true, name: true },
      });
      const payload: Record<string, string> = {
        error: `No event with resalePrefId "${prefId}" — this route only matches Event.resalePrefId (resale catalogue), not Event.prefId.`,
      };
      if (byPrimary) {
        if (byPrimary.resalePrefId) {
          payload.hint = `The id you used is the primary pref for "${byPrimary.name}". For this resale-only webhook use resalePrefId=${byPrimary.resalePrefId}, or POST to /api/webhooks/event-category-prices-pref?prefId=${prefId} to store PRIMARY_PREF prices.`;
        } else {
          payload.hint = `The id matches primary pref for "${byPrimary.name}" but the event has no resalePrefId. Use /api/webhooks/event-category-prices-pref?prefId=${prefId} for primary prices, or set resalePrefId on the event.`;
        }
      }
      return NextResponse.json(payload, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      lookup: "resale-only",
      resalePrefId: prefId,
      catalogueSource: result.catalogueSource,
      eventId: result.eventId,
      rowCount: rows.length,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-category-prices-resale webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const base = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl: base,
    lookup: "resale-only",
    explicitPrimaryPrefWebhook: new URL(
      "/api/webhooks/event-category-prices-pref",
      req.nextUrl.origin,
    ).toString(),
    notes: "prefId / ?prefId= / ?resalePrefId= must match Event.resalePrefId only. Rows stored as catalogueSource RESELL_PREF.",
    body: {
      prefId: "must equal Event.resalePrefId (or omit and use ?resalePrefId=)",
      prices: "array of { categoryId, categoryBlockId, minPrice, maxPrice }",
    },
  });
}
