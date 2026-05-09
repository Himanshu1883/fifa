import type { Prisma } from "@/generated/prisma/client";
import type { CataloguePriceSource } from "@/generated/prisma/enums";
import type { FlatPriceRow } from "@/lib/parse-category-prices-webhook";
import { resolveEventForCataloguePrefWithSource } from "@/lib/resolve-event-for-catalogue-pref";

export type PriceWebhookLookup = "pref-or-resale" | "primary-only" | "resale-only";

type Tx = Pick<Prisma.TransactionClient, "eventCategoryBlockPrice" | "event">;

function toSourceEnum(matched: "resale" | "primary"): CataloguePriceSource {
  return matched === "resale" ? "RESELL_PREF" : "PRIMARY_PREF";
}

/**
 * Replaces all block price rows for the event + catalogue source (primary vs resale channel).
 */
export async function syncEventCategoryBlockPrices(
  tx: Tx,
  cataloguePrefId: string,
  rows: FlatPriceRow[],
  lookup: PriceWebhookLookup,
): Promise<{ eventId: number; catalogueSource: CataloguePriceSource } | null> {
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

  await tx.eventCategoryBlockPrice.deleteMany({
    where: { eventId, catalogueSource },
  });

  if (rows.length > 0) {
    await tx.eventCategoryBlockPrice.createMany({
      data: rows.map((r) => ({
        eventId,
        categoryId: r.categoryId,
        categoryBlockId: r.categoryBlockId,
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        catalogueSource,
      })),
    });
  }

  return { eventId, catalogueSource };
}
