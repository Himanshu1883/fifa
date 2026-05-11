import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/** Prisma Client uses the `pg` driver; use Node runtime (not Edge). */
export const runtime = "nodejs";

type PriceRangeCategoryLike = {
  id?: unknown;
  name?: unknown;
  areaBlocksAvailability?: unknown;
};

type AvailabilityLike = {
  availability?: unknown;
  availabilityResale?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return 0;
    const n = Number(s);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

function extractCategoryName(rawName: unknown, categoryIdFallback: string): string {
  if (typeof rawName === "string") return rawName.trim() || categoryIdFallback;
  if (!isRecord(rawName)) return categoryIdFallback;

  const en = asNonEmptyString(rawName.en);
  if (en) return en;

  for (const v of Object.values(rawName)) {
    const s = asNonEmptyString(v);
    if (s) return s;
  }

  return categoryIdFallback;
}

function unwrapCommonEnvelopes(raw: unknown): unknown {
  let cur = raw;
  for (let i = 0; i < 5; i++) {
    if (typeof cur === "string") {
      const s = cur.trim();
      if (!s) return cur;
      try {
        cur = JSON.parse(s) as unknown;
        continue;
      } catch {
        return cur;
      }
    }

    if (isRecord(cur)) {
      const payload = cur.payload;
      const data = cur.data;
      if (payload !== undefined) {
        cur = payload;
        continue;
      }
      if (data !== undefined) {
        cur = data;
        continue;
      }
    }

    return cur;
  }
  return cur;
}

function extractPrefId(raw: unknown, prefFromQuery: string | null): string {
  if (prefFromQuery?.trim()) return prefFromQuery.trim();
  if (!isRecord(raw)) {
    throw new Error('Missing "prefId" (use ?prefId= or include in JSON wrapper)');
  }
  const prefId = asNonEmptyString(raw.prefId) ?? asNonEmptyString(raw.resalePrefId);
  if (!prefId) {
    throw new Error('Missing "prefId" (use ?prefId= or include in JSON wrapper)');
  }
  return prefId;
}

function extractPriceRangeCategories(payload: unknown): PriceRangeCategoryLike[] {
  if (Array.isArray(payload)) return payload as PriceRangeCategoryLike[];
  if (!isRecord(payload)) return [];

  const direct =
    (payload.priceRangeCategories ?? payload.categories ?? payload.price_range_categories) as unknown;
  if (Array.isArray(direct)) return direct as PriceRangeCategoryLike[];

  if (isRecord(payload.data) || Array.isArray(payload.data)) {
    return extractPriceRangeCategories(payload.data);
  }
  if (isRecord(payload.payload) || Array.isArray(payload.payload)) {
    return extractPriceRangeCategories(payload.payload);
  }
  return [];
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  try {
    const prefQs =
      req.nextUrl.searchParams.get("prefId") ?? req.nextUrl.searchParams.get("resalePrefId");

    const unwrapped = unwrapCommonEnvelopes(raw);
    const prefId = extractPrefId(isRecord(raw) ? raw : unwrapped, prefQs);

    const categories = (() => {
      const fromRaw = extractPriceRangeCategories(raw);
      if (fromRaw.length) return fromRaw;
      return extractPriceRangeCategories(unwrapped);
    })();
    const rows: Array<{
      categoryId: string;
      categoryName: string;
      blockId: string;
      availability: number;
      availabilityResale: number;
    }> = [];

    for (const c of categories) {
      const categoryId = String(c?.id ?? "").trim();
      if (!categoryId) continue;

      const categoryName = extractCategoryName(c?.name, categoryId);

      const blocks = c?.areaBlocksAvailability;
      if (!isRecord(blocks)) continue;

      for (const [blockIdRaw, availabilityRaw] of Object.entries(blocks)) {
        const blockId = String(blockIdRaw ?? "").trim();
        if (!blockId) continue;

        const avail = isRecord(availabilityRaw) ? (availabilityRaw as AvailabilityLike) : {};

        rows.push({
          categoryId,
          categoryName,
          blockId,
          availability: toInt(avail.availability),
          availabilityResale: toInt(avail.availabilityResale),
        });
      }
    }

    const uniqueCategoryIds = new Set(rows.map((r) => r.categoryId));

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          OR: [{ prefId }, { resalePrefId: prefId }],
        },
        select: { id: true },
      });
      if (!event) return null;

      const deleted = await tx.eventBlockSeatNow.deleteMany({ where: { eventId: event.id } });
      const inserted = rows.length
        ? await tx.eventBlockSeatNow.createMany({
            data: rows.map((r) => ({ eventId: event.id, ...r })),
          })
        : { count: 0 };

      return {
        eventId: event.id,
        deletedCount: deleted.count,
        insertedCount: inserted.count,
      };
    });

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
      syncMode: "replace",
      prefId,
      eventId: result.eventId,
      categoryCount: categories.length,
      uniqueCategoryCount: uniqueCategoryIds.size,
      rowCount: rows.length,
      deletedCount: result.deletedCount,
      insertedCount: result.insertedCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.startsWith("Missing ")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[event-block-seat-now webhook]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const fullUrl = new URL(req.nextUrl.pathname, req.nextUrl.origin).toString();
  return NextResponse.json({
    method: "POST",
    fullUrl,
    lookup: "pref-or-resale",
    notes:
      'Body shape: { priceRangeCategories: [{ id, name: { en: "Category 1", ... }, areaBlocksAvailability: { "<blockId>": { availability, availabilityResale } } }] }. Snapshot replace: each POST deletes existing rows for the event then inserts the new snapshot.',
    query: {
      prefId: "catalogue pref (can match Event.prefId OR Event.resalePrefId)",
      resalePrefId: "alias for prefId (same id value)",
    },
    sampleBody: {
      priceRangeCategories: [
        {
          id: 10229531982577,
          name: { en: "Category 1" },
          areaBlocksAvailability: {
            "10229531905110": { availability: 0, availabilityResale: 4 },
          },
        },
      ],
    },
  });
}

