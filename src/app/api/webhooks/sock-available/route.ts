import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import { parseSockAvailableGeojsonBody } from "@/lib/parse-sock-available-geojson-webhook";
import { syncSockAvailableForEvent } from "@/lib/sync-sock-available";

export const runtime = "nodejs";

/**
 * GeoJSON-style seat listing availability features per event.
 *
 * Event lookup: accept `?prefId=` or `?resalePrefId=` and match Event.prefId OR Event.resalePrefId.
 * Replace semantics: each POST deletes all existing `sock_available` rows for the event
 * and inserts the new snapshot.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs =
    req.nextUrl.searchParams.get("prefId") ??
    req.nextUrl.searchParams.get("resalePrefId");

  try {
    const { prefId, rows, featureCount, skippedCount } = parseSockAvailableGeojsonBody(
      raw,
      prefQs,
    );

    const result = await prisma.$transaction(async (tx) =>
      syncSockAvailableForEvent(tx, prefId, rows),
    );

    if (!result) {
      return NextResponse.json(
        {
          error: `No event for pref "${prefId}" (match prefId or resalePrefId) — seed the event first.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      lookup: "pref-or-resale",
      prefId,
      eventId: result.eventId,
      featureCount,
      rowCount: rows.length,
      deletedCount: result.deletedCount,
      insertedCount: result.insertedCount,
      skippedCount,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("[sock-available webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const base = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl: base,
    lookup: "pref-or-resale",
    notes:
      'Body can be a GeoJSON FeatureCollection ({ type:"FeatureCollection", features:[...] }), a single Feature ({ type:"Feature", properties:{...} }), a raw feature array, or wrapper objects (data/payload/body). Event lookup matches Event.prefId OR Event.resalePrefId.',
    query: {
      prefId: "ticketing catalogue pref id (can match Event.prefId or Event.resalePrefId)",
      resalePrefId: "alias for prefId (same id value)",
    },
    mapping: {
      amount: "properties.amount (optional; integer cents persisted as-is)",
      areaId: "properties.area.id",
      areaName: "properties.area.name.en (best-effort locale)",
      blockId: "properties.block.id",
      blockName: "properties.block.name.en (best-effort locale)",
      contingentId: "properties.contingentId",
      seatId: "properties.id",
      seatNumber: "properties.number",
      resaleMovementId: "properties.resaleMovementId",
      row: "properties.row",
      categoryName: "properties.seatCategory",
      categoryId: "properties.seatCategoryId",
    },
  });
}

