import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import { parseSeatListingsGeojsonBody } from "@/lib/parse-seat-listings-geojson-webhook";
import { syncResaleSeatListingsForEvent } from "@/lib/sync-event-seat-listings";

export const runtime = "nodejs";

/**
 * GeoJSON-style resale seat map: `{ features: [...] }` per event
 * (`Event.resalePrefId`). Same pref lookup as other resale webhooks:
 * `?resalePrefId=` / `?prefId=` or `resalePrefId` / `prefId` in JSON.
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
    const { resalePrefId, rows, featureCount, skippedCount } =
      parseSeatListingsGeojsonBody(raw, prefQs);

    const result = await prisma.$transaction(async (tx) =>
      syncResaleSeatListingsForEvent(tx, resalePrefId, rows),
    );

    if (!result) {
      return NextResponse.json(
        {
          error: `No event with resalePrefId "${resalePrefId}" — set Event.resalePrefId in seed (or DB) first.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      lookup: "resale-only",
      resalePrefId,
      eventId: result.eventId,
      featureCount,
      rowCount: rows.length,
      skippedCount,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[event-seat-listings-resale webhook]", err);
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
      "Body is { features: [ GeoJSON features ] }. prefId must match Event.resalePrefId. properties.amount is integer cents stored as-is in DB (minor units, not divided by 100).",
    query: {
      resalePrefId: "or prefId — ticketing resale catalogue id",
    },
    body: {
      features: "required array of features with properties.block, properties.area, geometry, etc.",
      resalePrefId: "optional if set via query",
      prefId: "alias for resalePrefId in JSON",
    },
    related: {
      categoryPricesResale: new URL(
        "/api/webhooks/event-category-prices-resale",
        req.nextUrl.origin,
      ).toString(),
    },
  });
}
