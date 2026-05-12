import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CataloguePayloadError } from "@/lib/price-range-catalogue";
import type { Prisma } from "@/generated/prisma/client";

/** Prisma Client uses the `pg` driver; use Node runtime (not Edge). */
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

function coerceNonEmptyString(value: unknown): string {
  const s = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  return s.trim();
}

function parseEventId(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n > 0) return n;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\d+$/.test(t)) {
      const n = Number.parseInt(t, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  throw new CataloguePayloadError(`${label} must be a positive integer`);
}

type NormalizedRow = {
  categoryId: string;
  categoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
  categoryPrice: string | null;
  blockPrice: string | null;
};

function centsDigitsToUsdDecimalString(centsDigits: string): string {
  const digits = centsDigits.replace(/^0+(?=\d)/, "");
  if (digits.length === 0) return "0.00";
  if (digits.length === 1) return `0.0${digits}`;
  if (digits.length === 2) return `0.${digits}`;
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function normalizeMoneyToUsdDecimalString(value: unknown): { value: string | null; skipped: boolean } {
  if (value === null || value === undefined || value === "") {
    return { value: null, skipped: false };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { value: null, skipped: true };
    if (Number.isInteger(value)) {
      if (value < 0) return { value: null, skipped: true };
      if (!Number.isSafeInteger(value)) return { value: null, skipped: true };
      // Integer numbers are treated as cents (minor units).
      return { value: centsDigitsToUsdDecimalString(String(value)), skipped: false };
    }
    // Non-integers are treated as USD dollars.
    const s = value.toString();
    if (s.trim().startsWith("-")) return { value: null, skipped: true };
    return { value: s, skipped: false };
  }

  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return { value: null, skipped: false };
    if (/^\d+$/.test(t)) {
      // String digits-only are treated as cents.
      return { value: centsDigitsToUsdDecimalString(t), skipped: false };
    }
    // Decimal strings are treated as USD dollars.
    const cleaned = t.replace(/,/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return { value: null, skipped: true };
    }
    if (cleaned.startsWith("-")) return { value: null, skipped: true };
    return { value: cleaned, skipped: false };
  }

  return { value: null, skipped: true };
}

function pickRowValue(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
  }
  return undefined;
}

function normalizeIncomingRows(rawRows: unknown): { rows: NormalizedRow[]; receivedCount: number; skippedCount: number } {
  if (!Array.isArray(rawRows)) {
    throw new CataloguePayloadError('Body must be an array of rows, or an object like { eventId, rows: [...] }');
  }

  const out: NormalizedRow[] = [];
  let skippedCount = 0;

  for (const row of rawRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      skippedCount += 1;
      continue;
    }
    const o = row as Record<string, unknown>;

    const categoryId = coerceNonEmptyString(pickRowValue(o, "categoryId", "category_id"));
    const categoryName = coerceNonEmptyString(pickRowValue(o, "categoryName", "category_name"));
    const categoryBlockId = coerceNonEmptyString(pickRowValue(o, "categoryBlockId", "category_block_id", "categoryBlockID", "category_blockID"));
    const categoryBlockName = coerceNonEmptyString(pickRowValue(o, "categoryBlockName", "category_block_name"));

    if (!categoryId || !categoryName || !categoryBlockId || !categoryBlockName) {
      skippedCount += 1;
      continue;
    }

    const catPriceRaw = pickRowValue(o, "categoryPrice", "category_price");
    const blockPriceRaw = pickRowValue(o, "blockPrice", "block_price");
    const catMoney = normalizeMoneyToUsdDecimalString(catPriceRaw);
    const blockMoney = normalizeMoneyToUsdDecimalString(blockPriceRaw);

    if (catMoney.skipped || blockMoney.skipped) {
      // If either money field is unparsable, skip the entire row (conservative).
      skippedCount += 1;
      continue;
    }

    out.push({
      categoryId,
      categoryName,
      categoryBlockId,
      categoryBlockName,
      categoryPrice: catMoney.value,
      blockPrice: blockMoney.value,
    });
  }

  return { rows: out, receivedCount: rawRows.length, skippedCount };
}

function parseWebhookBody(
  raw: unknown,
  eventIdFromQuery: string | null,
): { eventId: number; receivedCount: number; rows: NormalizedRow[]; skippedCount: number } {
  if (Array.isArray(raw)) {
    const eventId = parseEventId(eventIdFromQuery, "eventId (query param)");
    const { rows, receivedCount, skippedCount } = normalizeIncomingRows(raw);
    return { eventId, receivedCount, rows, skippedCount };
  }

  if (!raw || typeof raw !== "object") {
    throw new CataloguePayloadError("Body must be JSON (array of rows or wrapper object)");
  }

  const o = raw as Record<string, unknown>;
  const wrapperEventId = pickRowValue(o, "eventId", "event_id");
  const eventId = parseEventId(wrapperEventId ?? eventIdFromQuery, "eventId");
  const wrapperRows = pickRowValue(o, "rows");

  const { rows, receivedCount, skippedCount } = normalizeIncomingRows(wrapperRows);
  return { eventId, receivedCount, rows, skippedCount };
}

/**
 * Snapshot replace for `shop_event_category` rows.
 *
 * Input format (flexible):
 * - POST raw array `[...]` with `?eventId=123`
 * - POST wrapper object `{ eventId, rows: [...] }` (or `event_id`)
 *
 * Row keys accept camelCase or snake_case:
 * - categoryId / category_id
 * - categoryName / category_name
 * - categoryBlockId / category_block_id
 * - categoryBlockName / category_block_name
 * - categoryPrice / category_price
 * - blockPrice / block_price
 *
 * Prices:
 * - Integers (or digit-only strings) are treated as cents and stored as USD dollars (÷ 100).
 * - Decimal strings/numbers are treated as USD dollars as-is.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const eventIdQs = req.nextUrl.searchParams.get("eventId");

  let parsedEventId: number | undefined;
  let receivedCount: number | undefined;

  try {
    const parsed = parseWebhookBody(raw, eventIdQs);
    parsedEventId = parsed.eventId;
    receivedCount = parsed.receivedCount;

    const exists = await prisma.event.findUnique({
      where: { id: parsed.eventId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        {
          error: `No event with id ${parsed.eventId} — create/seed the Event first.`,
        },
        { status: 404 },
      );
    }

    // Dedupe within payload (eventId is constant per request).
    const seen = new Set<string>();
    const uniqueRows: Array<
      Prisma.ShopEventCategoryBlockCreateManyInput & {
        eventId: number;
      }
    > = [];
    let skippedDuplicateInPayloadCount = 0;

    for (const r of parsed.rows) {
      const key = `${r.categoryId}\u0000${r.categoryBlockId}`;
      if (seen.has(key)) {
        skippedDuplicateInPayloadCount += 1;
        continue;
      }
      seen.add(key);
      uniqueRows.push({
        eventId: parsed.eventId,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryBlockId: r.categoryBlockId,
        categoryBlockName: r.categoryBlockName,
        categoryPrice: r.categoryPrice,
        blockPrice: r.blockPrice,
      });
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        const deleted = await tx.shopEventCategoryBlock.deleteMany({
          where: { eventId: parsed.eventId },
        });
        const inserted =
          uniqueRows.length === 0
            ? { count: 0 }
            : await tx.shopEventCategoryBlock.createMany({
                data: uniqueRows,
                skipDuplicates: true,
              });
        return { deletedCount: deleted.count, insertedCount: inserted.count };
      },
      { maxWait: 20_000, timeout: 120_000 },
    );

    const acceptedCount = uniqueRows.length;
    const skippedCount = parsed.skippedCount + skippedDuplicateInPayloadCount;

    return NextResponse.json({
      ok: true,
      eventId: parsed.eventId,
      receivedCount: parsed.receivedCount,
      acceptedCount,
      deletedCount: txResult.deletedCount,
      insertedCount: txResult.insertedCount,
      skippedCount,
      partial: skippedCount > 0,
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
      "[shop-event-category webhook]",
      {
        errorId,
        hint,
        code,
        eventId: parsedEventId ?? eventIdQs ?? "(unset)",
        path: req.nextUrl.pathname,
        contentLength: req.headers.get("content-length") ?? "(unknown)",
        receivedCount: receivedCount ?? "(unknown)",
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
    table: "shop_event_category",
    notes:
      "Snapshot replace: each POST deletes all existing shop_event_category rows for the given eventId then inserts the new unique payload rows. No auth.",
    query: {
      eventId: "required only when POST body is a raw array",
    },
    body: {
      eventId: "required when using wrapper object; optional if using ?eventId=",
      rows: [
        {
          categoryId: "string",
          categoryName: "string",
          categoryBlockId: "string",
          categoryBlockName: "string",
          categoryPrice: "optional: integer cents OR decimal USD string/number",
          blockPrice: "optional: integer cents OR decimal USD string/number",
        },
      ],
      rawArray: "[{ categoryId, categoryName, categoryBlockId, categoryBlockName, ... }]",
    },
    pricingRules: {
      integers: "treated as cents and stored as USD dollars (÷ 100) in Decimal columns",
      decimals: "treated as USD dollars as-is (string or number)",
    },
    sampleCurl: [
      `curl -sS "${fullUrl}"`,
      `curl -sS -X POST "${fullUrl}?eventId=123" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  --data-binary '[{"categoryId":"1","categoryName":"Cat 1","categoryBlockId":"A","categoryBlockName":"Block A","categoryPrice":25000,"blockPrice":"249.99"}]'`,
      `curl -sS -X POST "${fullUrl}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  --data-binary '{"eventId":123,"rows":[{"category_id":"1","category_name":"Cat 1","category_block_id":"A","category_block_name":"Block A","category_price":"250.00","block_price":24999}]}'`,
    ],
  });
}

