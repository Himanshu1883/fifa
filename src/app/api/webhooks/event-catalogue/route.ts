import { randomUUID } from "node:crypto";
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

type WebhookErrorHint =
  | "missing_database_url"
  | "railway_internal_url"
  | "missing_migrations"
  | "db_connectivity"
  | "db_auth"
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
  if (code === "42P01" || code === "P2021" || msg.includes("does not exist")) {
    return "missing_migrations";
  }
  if (code === "P1001" || code === "P1002") {
    return "db_connectivity";
  }
  if (code === "P1010") {
    return "db_auth";
  }
  return "unknown";
}

/** POST `{ prefId?, priceRangeCategories? | categories?: [...] }`, or raw `[...]` + `?prefId=`. Snapshot replace: replaces category×block rows + availability for the event. No auth. */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prefQs = req.nextUrl.searchParams.get("prefId");
  try {
    const { prefId, rows, availabilityRows } = parseCatalogueWebhookBody(raw, prefQs);

    const result = await prisma.$transaction(async (tx) => {
      const synced = await syncEventCategoriesFromCatalogue(tx, prefId, rows, "pref-or-resale", {
        mode: "replace",
      });
      if (!synced) return { missingEvent: true as const };

      const deletedAvailability = await tx.eventCategoryBlockAvailability.deleteMany({
        where: { eventId: synced.eventId },
      });

      const availability = await upsertEventCategoryBlockAvailabilityFromCatalogue(
        tx,
        synced.eventId,
        availabilityRows,
      );
      return {
        missingEvent: false as const,
        ...synced,
        deletedAvailabilityCount: deletedAvailability.count,
        ...availability,
      };
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
      syncMode: "replace",
      prefId,
      eventId: result.eventId,
      rowCount: rows.length,
      uniqueRowCount: result.uniqueRowCount,
      deletedCategoryCount: result.deletedCategoryCount ?? 0,
      insertedCount: result.insertedCount,
      skippedExistingCount: result.skippedExistingCount,
      deletedAvailabilityCount: result.deletedAvailabilityCount,
      availabilityUniqueRowCount: result.availabilityUniqueRowCount,
      availabilityUpsertedCount: result.availabilityUpsertedCount,
      categoryCount: uniqueCategoryIds.size,
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
      "[event-catalogue webhook]",
      {
        errorId,
        hint,
        code,
        prefId: prefQs ?? "(unset)",
        path: req.nextUrl.pathname,
        contentLength: req.headers.get("content-length") ?? "(unknown)",
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
  const fullUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl,
    notes:
      "No token or Authorization header — anyone who can reach this URL can replace an event's category×block snapshot by prefId. Missing blocks/categories in the payload are deleted.",
    body: {
      prefId: "catalogue pref (or omit and use query ?prefId=)",
      priceRangeCategories:
        'array — same shape as ticketing API exports (alias: "categories" on the wrapper object)',
    },
    usage:
      'Body `prefId` is the catalogue/ticketing pref. Rows are replaced for the event whose `prefId` matches, or whose `resalePrefId` matches (e.g. Mexico vs South Africa + resale snapshot 10229225516056). The payload is treated as a full snapshot (old category×block + availability rows are removed).',
    resaleOnlyWebhook: new URL(
      "/api/webhooks/event-catalogue-resale",
      req.nextUrl.origin,
    ).toString(),
    categoryBlockPricesWebhook: new URL(
      "/api/webhooks/event-category-prices",
      req.nextUrl.origin,
    ).toString(),
  });
}
