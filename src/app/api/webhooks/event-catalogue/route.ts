import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CataloguePayloadError,
  parseCatalogueWebhookBody,
} from "@/lib/price-range-catalogue";
import { syncEventCategoriesFromCatalogue } from "@/lib/sync-event-catalogue";

/** Prisma Client uses the `pg` driver; use Node runtime (not Edge). */
export const runtime = "nodejs";

/** POST `{ prefId?, priceRangeCategories? | categories?: [...] }`, or raw `[...]` + `?prefId=`. Replaces EventCategory rows after sorting. No auth. */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs = req.nextUrl.searchParams.get("prefId");
  try {
    const { prefId, rows } = parseCatalogueWebhookBody(raw, prefQs);

    const result = await prisma.$transaction(async (tx) => {
      const synced = await syncEventCategoriesFromCatalogue(tx, prefId, rows, "pref-or-resale");
      if (!synced) return { missingEvent: true as const };
      return { missingEvent: false as const, eventId: synced.eventId };
    });

    if (result.missingEvent) {
      return NextResponse.json(
        {
          error: `No event for catalogue pref "${prefId}" (match prefId or resalePrefId) — seed the event first.`,
        },
        { status: 404 },
      );
    }

    const uniqueCategoryIds = new Set(rows.map((r) => r.categoryId));

    return NextResponse.json({
      ok: true,
      lookup: "pref-or-resale",
      prefId,
      eventId: result.eventId,
      rowCount: rows.length,
      categoryCount: uniqueCategoryIds.size,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-catalogue webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const fullUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl,
    notes:
      "No token or Authorization header — anyone who can reach this URL can replace category data for an event prefId.",
    body: {
      prefId: "catalogue pref (or omit and use query ?prefId=)",
      priceRangeCategories:
        'array — same shape as ticketing API exports (alias: "categories" on the wrapper object)',
    },
    usage:
      'Body `prefId` is the catalogue/ticketing pref. Rows replace categories on the event whose `prefId` matches, or whose `resalePrefId` matches (e.g. Mexico vs South Africa + resale snapshot 10229225516056).',
    resaleOnlyWebhook: new URL(
      "/api/webhooks/event-catalogue-resale",
      req.nextUrl.origin,
    ).toString(),
  });
}
