import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import { parseSockAvailableGeojsonBody } from "@/lib/parse-sock-available-geojson-webhook";
import { computeSockAvailableDiff } from "@/lib/sock-available-diff";
import { syncSockAvailableForEvent } from "@/lib/sync-sock-available";
import { sendUltraMsgWhatsAppMessage } from "@/lib/whatsapp-ultramsg";

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

  if (
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code === "P2021" ||
    msg.includes("does not exist")
  ) {
    return "missing_migrations";
  }

  if (code === "P1001" || code === "P1002") {
    return "db_connectivity";
  }
  if (code === "P1010") {
    return "db_auth";
  }

  if (code === "P2028" || msg.includes("transaction already closed") || msg.includes("transaction api error")) {
    return "transaction_timeout";
  }

  return "unknown";
}

function amountRawToUsdString(raw: number | null): string {
  if (raw === null) return "—";
  const usd = raw / 1000;
  if (!Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(2)}`;
}

function buildWhatsAppText(input: {
  eventLabel: string;
  eventId: number;
  prefId: string;
  diff: { newCount: number; changedCount: number; priceChangedCount: number; sample: Array<{ line: string }> };
}): string {
  const { eventLabel, eventId, prefId, diff } = input;
  const header = `Sock Shop diff: ${eventLabel}\n(eventId ${eventId}, prefId ${prefId})`;
  const counts = `New ${diff.newCount} · Changed ${diff.changedCount} · Price ${diff.priceChangedCount}`;
  const lines = diff.sample.map((s) => s.line).filter(Boolean);
  const body = lines.length ? `\n\nSamples:\n${lines.join("\n")}` : "";
  const text = `${header}\n${counts}${body}`;

  // Keep messages compact to avoid WhatsApp/UI truncation.
  return text.length > 1400 ? `${text.slice(0, 1400)}…` : text;
}

/**
 * Shop (Last Minute) sock_available ingest.
 *
 * Same payload as `/api/webhooks/sock-available`, but always stores `kind=LAST_MINUTE`.
 * Replace is scoped to LAST_MINUTE only (RESALE rows are untouched).
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs = req.nextUrl.searchParams.get("prefId") ?? req.nextUrl.searchParams.get("resalePrefId");

  let parsedPrefId: string | undefined;
  let parsedFeatureCount: number | undefined;
  let parsedRowCount: number | undefined;

  try {
    const { prefId, rows, featureCount, skippedCount, skippedMissingSeatIdCount, skippedMissingCategoryIdCount } =
      parseSockAvailableGeojsonBody(raw, prefQs);
    parsedPrefId = prefId;
    parsedFeatureCount = featureCount;
    parsedRowCount = rows.length;

    const kind = "LAST_MINUTE" as const;

    const txnResult = await prisma.$transaction(
      async (tx) => {
        const ev = await tx.event.findFirst({
          where: {
            OR: [{ prefId }, { resalePrefId: prefId }],
          },
          select: { id: true, matchLabel: true, name: true },
        });

        if (!ev) return { ev: null, result: null, diff: null };

        const diff =
          rows.length > 0
            ? computeSockAvailableDiff({
                kind,
                incoming: rows,
                existing: await tx.sockAvailable.findMany({
                  where: { eventId: ev.id, kind },
                  select: {
                    areaId: true,
                    areaName: true,
                    blockId: true,
                    blockName: true,
                    seatId: true,
                    seatNumber: true,
                    resaleMovementId: true,
                    row: true,
                    categoryName: true,
                    categoryId: true,
                    amount: true,
                  },
                }),
                sampleLimit: 10,
              })
            : computeSockAvailableDiff({ kind, incoming: [], existing: [], sampleLimit: 10 });

        // IMPORTANT: diff is computed BEFORE snapshot deletion inside syncSockAvailableForEvent.
        const result = await syncSockAvailableForEvent(tx, prefId, kind, rows);

        return { ev, result, diff };
      },
      { maxWait: 20_000, timeout: 120_000 },
    );

    if (!txnResult.result || !txnResult.ev) {
      return NextResponse.json(
        {
          error: `No event for pref "${prefId}" (match prefId or resalePrefId) — seed the event first.`,
        },
        { status: 404 },
      );
    }

    const diff = txnResult.diff;

    const hasDiff =
      Boolean(diff) && (diff.newCount > 0 || diff.changedCount > 0 || diff.priceChangedCount > 0);

    const notify =
      hasDiff && diff
        ? await sendUltraMsgWhatsAppMessage(
            buildWhatsAppText({
              eventLabel: txnResult.ev.matchLabel || txnResult.ev.name,
              eventId: txnResult.ev.id,
              prefId,
              diff: {
                newCount: diff.newCount,
                changedCount: diff.changedCount,
                priceChangedCount: diff.priceChangedCount,
                sample: diff.sample.map((s) => {
                  if (s.change === "new") {
                    return {
                      line: `+ ${s.blockName} Row ${s.row} Seat ${s.seatNumber} Cat ${s.categoryId} ${amountRawToUsdString(s.amountRaw)}`,
                    };
                  }
                  const changed = (s.changedFields ?? []).filter((f) => f !== "amount");
                  const changeLabel = changed.length ? ` (${changed.join(",")})` : "";
                  const priceLabel =
                    s.prev && s.amountRaw !== s.prev.amountRaw
                      ? ` ${amountRawToUsdString(s.prev.amountRaw)}→${amountRawToUsdString(s.amountRaw)}`
                      : ` ${amountRawToUsdString(s.amountRaw)}`;
                  return {
                    line: `~ ${s.blockName} Row ${s.row} Seat ${s.seatNumber} Cat ${s.categoryId}${changeLabel}${priceLabel}`,
                  };
                }),
              },
            }),
          )
        : { attempted: false, ok: false, provider: "ultramsg" as const };

    return NextResponse.json({
      ok: true,
      partial: skippedCount > 0,
      lookup: "pref-or-resale",
      prefId,
      eventId: txnResult.result.eventId,
      featureCount,
      rowCount: rows.length,
      acceptedCount: rows.length,
      deletedCount: txnResult.result.deletedCount,
      insertedCount: txnResult.result.insertedCount,
      skippedCount,
      skippedMissingSeatIdCount,
      skippedMissingCategoryIdCount,
      kind,
      diff: diff
        ? {
            newCount: diff.newCount,
            changedCount: diff.changedCount,
            priceChangedCount: diff.priceChangedCount,
            sample: diff.sample,
          }
        : { newCount: 0, changedCount: 0, priceChangedCount: 0, sample: [] },
      notify,
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
      "[sock-available-shop webhook]",
      {
        errorId,
        hint,
        code,
        prefId: parsedPrefId ?? prefQs ?? "(unset)",
        path: req.nextUrl.pathname,
        contentLength: req.headers.get("content-length") ?? "(unknown)",
        parsedFeatureCount: parsedFeatureCount ?? "(unknown)",
        parsedRowCount: parsedRowCount ?? "(unknown)",
        kind: "LAST_MINUTE",
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
    kind: "LAST_MINUTE (shop)",
    lookup: "pref-or-resale",
    notes:
      'Same payload as `/api/webhooks/sock-available`, but this endpoint always stores rows with kind=LAST_MINUTE (Shop). Body can be FeatureCollection, Feature, raw array, or wrapper objects.',
    query: {
      prefId: "ticketing catalogue pref id (can match Event.prefId or Event.resalePrefId)",
      resalePrefId: "alias for prefId (same id value)",
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

