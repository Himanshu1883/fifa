import type { Prisma } from "@/generated/prisma/client";
import type { CataloguePriceSource } from "@/generated/prisma/enums";
import type { FlatPriceRow } from "@/lib/parse-category-prices-webhook";
import { resolveEventForCataloguePrefWithSource } from "@/lib/resolve-event-for-catalogue-pref";

export type PriceWebhookLookup = "pref-or-resale" | "primary-only" | "resale-only";

type Tx = Pick<Prisma.TransactionClient, "eventCategoryBlockPrice" | "event">;

function toSourceEnum(matched: "resale" | "primary"): CataloguePriceSource {
  return matched === "resale" ? "RESELL_PREF" : "PRIMARY_PREF";
}

function dedupePriceRows(rows: FlatPriceRow[]): FlatPriceRow[] {
  const seen = new Set<string>();
  const out: FlatPriceRow[] = [];
  for (const r of rows) {
    const key = `${r.categoryId}::${r.categoryBlockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Insert-only: add new block price rows for the event + catalogue source (primary vs resale channel).
 * Existing (eventId, categoryId, categoryBlockId, catalogueSource) rows are left untouched.
 */
export async function syncEventCategoryBlockPrices(
  tx: Tx,
  cataloguePrefId: string,
  rows: FlatPriceRow[],
  lookup: PriceWebhookLookup,
): Promise<{
  eventId: number;
  catalogueSource: CataloguePriceSource;
  uniqueRowCount: number;
  insertedCount: number;
  skippedExistingCount: number;
} | null> {
  let resolved: { id: number; matched: "resale" | "primary" } | null;

  if (lookup === "resale-only") {
    const ev = await tx.event.findFirst({
      where: { resalePrefId: cataloguePrefId },
      select: { id: true },
    });
    resolved = ev ? { id: ev.id, matched: "resale" } : null;
  } else if (lookup === "primary-only") {
    const ev = await tx.event.findFirst({
      where: { prefId: cataloguePrefId },
      select: { id: true },
    });
    resolved = ev ? { id: ev.id, matched: "primary" } : null;
  } else {
    resolved = await resolveEventForCataloguePrefWithSource(tx, cataloguePrefId);
  }

  if (!resolved) return null;

  const catalogueSource = toSourceEnum(resolved.matched);
  const eventId = resolved.id;

  const uniqueRows = dedupePriceRows(rows);
  const created =
    uniqueRows.length > 0
      ? await tx.eventCategoryBlockPrice.createMany({
          data: uniqueRows.map((r) => ({
            eventId,
            categoryId: r.categoryId,
            categoryBlockId: r.categoryBlockId,
            minPrice: r.minPrice,
            maxPrice: r.maxPrice,
            catalogueSource,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

  const insertedCount = created.count;
  return {
    eventId,
    catalogueSource,
    uniqueRowCount: uniqueRows.length,
    insertedCount,
    skippedExistingCount: uniqueRows.length - insertedCount,
  };
}
