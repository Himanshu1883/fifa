import type { PrismaClient } from "@/generated/prisma/client";
import type { FlatCatalogueRow } from "@/lib/price-range-catalogue";
import { resolveEventForCataloguePref } from "@/lib/resolve-event-for-catalogue-pref";

/** How to map payload catalogue pref → Event row. */
export type CatalogueWebhookLookup = "pref-or-resale" | "resale-only";

type Tx = Pick<PrismaClient, "event" | "eventCategory">;

/**
 * Deletes existing categories for the resolved event and inserts `rows`.
 * Returns null when no matching event exists.
 */
export async function syncEventCategoriesFromCatalogue(
  tx: Tx,
  cataloguePrefId: string,
  rows: FlatCatalogueRow[],
  lookup: CatalogueWebhookLookup,
): Promise<{ eventId: number } | null> {
  const event =
    lookup === "resale-only"
      ? await tx.event.findFirst({
          where: { resalePrefId: cataloguePrefId },
          select: { id: true },
        })
      : await resolveEventForCataloguePref(tx, cataloguePrefId);

  if (!event) return null;

  // TODO: If upstream catalogue payloads expose stage / venue / country, map them onto `Event` here.

  await tx.eventCategory.deleteMany({ where: { eventId: event.id } });
  await tx.eventCategory.createMany({
    data: rows.map((r) => ({
      ...r,
      eventId: event.id,
    })),
  });

  return { eventId: event.id };
}
