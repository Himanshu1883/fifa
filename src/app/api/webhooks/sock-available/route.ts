import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import { parseSockAvailableGeojsonBody } from "@/lib/parse-sock-available-geojson-webhook";
import { syncSockAvailableForEvent } from "@/lib/sync-sock-available";

export const runtime = "nodejs";

type WebhookErrorHint =
  | "missing_database_url"
  | "railway_internal_url"
  | "missing_migrations"
  | "db_connectivity"
  | "db_auth"
  | "transaction_timeout"
  | "unknown";

function createErrorId(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as { code?: unknown };
  return typeof anyErr.code === "string" && anyErr.code.trim() ? anyErr.code.trim() : undefined;
}

function classifyWebhookError(code: string | undefined, message: string): WebhookErrorHint {
  const msg = message.toLowerCase();

  if (msg.includes("database_url is missing") || msg.includes("database_url is not")) {
    return "missing_database_url";
  }
  if (msg.includes(".railway.internal")) {
    return "railway_internal_url";
  }

  // Missing table/column (Postgres) or missing Prisma migration.
  if (
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code === "P2021" ||
    msg.includes("does not exist")
  ) {
    return "missing_migrations";
  }

  // Prisma / DB connectivity/auth.
  if (code === "P1001" || code === "P1002") {
    return "db_connectivity";
  }
  if (code === "P1010") {
    return "db_auth";
  }

  // Prisma interactive transaction timeout / closed transaction.
  if (code === "P2028" || msg.includes("transaction already closed") || msg.includes("transaction api error")) {
    return "transaction_timeout";
  }

  return "unknown";
}

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
  const kindQs =
    req.nextUrl.searchParams.get("kind") ??
    req.nextUrl.searchParams.get("source") ??
    req.nextUrl.searchParams.get("dataKind");

  let parsedPrefId: string | undefined;
  let parsedFeatureCount: number | undefined;
  let parsedRowCount: number | undefined;
  let parsedKind: string | undefined;

  try {
    const {
      prefId,
      rows,
      featureCount,
      skippedCount,
      skippedMissingSeatIdCount,
      skippedMissingCategoryIdCount,
      kind: kindFromBody,
    } = parseSockAvailableGeojsonBody(raw, prefQs);
    parsedPrefId = prefId;
    parsedFeatureCount = featureCount;
    parsedRowCount = rows.length;
    parsedKind = kindQs?.trim() ? kindQs.trim() : kindFromBody;

    const kind =
      parsedKind?.toLowerCase() === "last_minute" ||
      parsedKind?.toLowerCase() === "lastminute" ||
      parsedKind?.toLowerCase() === "last-minute"
        ? "LAST_MINUTE"
        : "RESALE";

    const result = await prisma.$transaction(
      async (tx) => syncSockAvailableForEvent(tx, prefId, kind, rows),
      // Large payloads can take longer than Prisma's default interactive transaction timeout.
      { maxWait: 20_000, timeout: 120_000 },
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
      partial: skippedCount > 0,
      lookup: "pref-or-resale",
      prefId,
      eventId: result.eventId,
      featureCount,
      rowCount: rows.length,
      acceptedCount: rows.length,
      deletedCount: result.deletedCount,
      insertedCount: result.insertedCount,
      skippedCount,
      skippedMissingSeatIdCount,
      skippedMissingCategoryIdCount,
      kind,
    });
  } catch (err) {
    if (err instanceof CataloguePayloadError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }

    const errorId = createErrorId();
    const code = extractErrorCode(err);
    const message = err instanceof Error ? err.message : String(err);
    const hint = classifyWebhookError(code, message);

    console.error(
      "[sock-available webhook]",
      {
        errorId,
        hint,
        code,
        prefId: parsedPrefId ?? prefQs ?? "(unset)",
        path: req.nextUrl.pathname,
        contentLength: req.headers.get("content-length") ?? "(unknown)",
        parsedFeatureCount: parsedFeatureCount ?? "(unknown)",
        parsedRowCount: parsedRowCount ?? "(unknown)",
        kind: parsedKind ?? kindQs ?? "(default)",
      },
      err,
    );

    const isProd = process.env.NODE_ENV === "production";
    return NextResponse.json(
      {
        error: "Internal server error",
        errorId,
        ...(code ? { code } : {}),
        ...(hint !== "unknown" ? { hint } : {}),
        ...(!isProd ? { message } : {}),
      },
      { status: 500 },
    );
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
      kind: 'optional: "resale" (default) or "last_minute" — replace is scoped to this kind',
    },
    mapping: {
      amount:
        "properties.amount (optional; integer cents) OR properties.seatBasedPriceAmount (optional; integer cents)",
      areaId: "properties.area.id",
      areaName: "properties.area.name.en (best-effort locale)",
      blockId: "properties.block.id",
      blockName: "properties.block.name.en (best-effort locale)",
      contingentId: "properties.contingentId",
      seatId: "properties.id (or properties.seatId or feature.id)",
      seatNumber: "properties.number",
      resaleMovementId:
        "properties.resaleMovementId (or properties.movementId / properties.listingId). Optional; if missing it is stored as NULL.",
      row: "properties.row",
      categoryName: "properties.seatCategory",
      categoryId: "properties.seatCategoryId",
    },
  });
}

