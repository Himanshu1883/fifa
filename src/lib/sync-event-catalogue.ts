import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type {
  FlatCatalogueBlockAvailabilityRow,
  FlatCatalogueRow,
} from "@/lib/price-range-catalogue";
import { resolveEventForCataloguePref } from "@/lib/resolve-event-for-catalogue-pref";

/** How to map payload catalogue pref → Event row. */
export type CatalogueWebhookLookup = "pref-or-resale" | "resale-only";

export type CatalogueSyncMode = "insert-only" | "replace";

type Tx = Pick<
  PrismaClient,
  "event" | "eventCategory" | "eventCategoryBlockAvailability" | "$executeRaw"
>;

function dedupeCategoryBlockRows(rows: FlatCatalogueRow[]): FlatCatalogueRow[] {
  const seen = new Set<string>();
  const out: FlatCatalogueRow[] = [];
  for (const r of rows) {
    const key = `${r.categoryId}::${r.categoryBlockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function dedupeAvailabilityRows(
  rows: FlatCatalogueBlockAvailabilityRow[],
): FlatCatalogueBlockAvailabilityRow[] {
  const seen = new Set<string>();
  const out: FlatCatalogueBlockAvailabilityRow[] = [];
  for (const r of rows) {
    const key = `${r.categoryId}::${r.categoryBlockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Sync category×block rows from the catalogue payload.
 *
 * - `mode: "insert-only"`: add new rows; leave existing ones untouched.
 * - `mode: "replace"`: treat the payload as a full snapshot and replace the
 *   event's entire set of category×block rows (deletes rows not present).
 * Returns null when no matching event exists.
 */
export async function syncEventCategoriesFromCatalogue(
  tx: Tx,
  cataloguePrefId: string,
  rows: FlatCatalogueRow[],
  lookup: CatalogueWebhookLookup,
  opts?: { mode?: CatalogueSyncMode },
): Promise<{
  eventId: number;
  uniqueRowCount: number;
  insertedCount: number;
  skippedExistingCount: number;
  deletedCategoryCount?: number;
} | null> {
  const event =
    lookup === "resale-only"
      ? await tx.event.findFirst({
          where: { resalePrefId: cataloguePrefId },
          select: { id: true },
        })
      : await resolveEventForCataloguePref(tx, cataloguePrefId);

  if (!event) return null;

  // TODO: If upstream catalogue payloads expose stage / venue / country, map them onto `Event` here.

  const uniqueRows = dedupeCategoryBlockRows(rows);
  const mode: CatalogueSyncMode = opts?.mode ?? "insert-only";

  let deletedCategoryCount = 0;
  if (mode === "replace") {
    const deleted = await tx.eventCategory.deleteMany({ where: { eventId: event.id } });
    deletedCategoryCount = deleted.count;
  }

  let insertedCount = 0;
  if (uniqueRows.length > 0) {
    const created = await tx.eventCategory.createMany({
      data: uniqueRows.map((r) => ({
        ...r,
        eventId: event.id,
      })),
      skipDuplicates: true,
    });
    insertedCount = created.count;
  }

  return {
    eventId: event.id,
    uniqueRowCount: uniqueRows.length,
    insertedCount,
    skippedExistingCount: uniqueRows.length - insertedCount,
    ...(mode === "replace" ? { deletedCategoryCount } : {}),
  };
}

/**
 * Upsert per-block availability counts (changes over time).
 * Uses (eventId, categoryId, categoryBlockId) unique key.
 */
export async function upsertEventCategoryBlockAvailabilityFromCatalogue(
  tx: Tx,
  eventId: number,
  availabilityRows: FlatCatalogueBlockAvailabilityRow[],
): Promise<{
  availabilityUniqueRowCount: number;
  availabilityUpsertedCount: number;
}> {
  const uniqueRows = dedupeAvailabilityRows(availabilityRows);

  if (uniqueRows.length === 0) {
    return { availabilityUniqueRowCount: 0, availabilityUpsertedCount: 0 };
  }

  // Prisma doesn't support `createMany` with per-row updates; use a chunked multi-row upsert.
  // Keep chunks small enough to avoid query/parameter limits under very large catalogues.
  const CHUNK_SIZE = 500;
  let upserted = 0;

  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE);

    const values = chunk.map(
      (r) =>
        Prisma.sql`(${eventId}, ${r.categoryId}, ${r.categoryBlockId}, ${r.availability}, ${r.availabilityResale}, NOW())`,
    );

    const affected = await tx.$executeRaw(
      Prisma.sql`
        INSERT INTO "event_category_block_availability" (
          "event_id",
          "category_id",
          "category_block_id",
          "availability",
          "availability_resale",
          "updated_at"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("event_id", "category_id", "category_block_id")
        DO UPDATE SET
          "availability" = EXCLUDED."availability",
          "availability_resale" = EXCLUDED."availability_resale",
          "updated_at" = NOW()
      `,
    );

    // Postgres returns inserted+updated row count; Prisma exposes it as a number.
    upserted += typeof affected === "number" ? affected : chunk.length;
  }

  return {
    availabilityUniqueRowCount: uniqueRows.length,
    availabilityUpsertedCount: upserted,
  };
}
