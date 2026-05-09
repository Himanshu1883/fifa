import type { PrismaClient } from "@/generated/prisma/client";

/** Catalogue payloads use a ticketing pref (`cataloguePrefId`). Prefer attaching to events that list it as resale, else primary `prefId`. */
export async function resolveEventForCataloguePref(
  db: Pick<PrismaClient, "event">,
  cataloguePrefId: string,
): Promise<{ id: number } | null> {
  const byResale = await db.event.findFirst({
    where: { resalePrefId: cataloguePrefId },
    select: { id: true },
  });
  if (byResale) return byResale;
  return db.event.findFirst({
    where: { prefId: cataloguePrefId },
    select: { id: true },
  });
}

/**
 * Same as @see resolveEventForCataloguePref, but records whether `prefId` matched
 * resale vs primary so stored rows can be tied to the correct catalogue channel.
 */
export async function resolveEventForCataloguePrefWithSource(
  db: Pick<PrismaClient, "event">,
  cataloguePrefId: string,
): Promise<{ id: number; matched: "resale" | "primary" } | null> {
  const byResale = await db.event.findFirst({
    where: { resalePrefId: cataloguePrefId },
    select: { id: true },
  });
  if (byResale) return { id: byResale.id, matched: "resale" };
  const byPrimary = await db.event.findFirst({
    where: { prefId: cataloguePrefId },
    select: { id: true },
  });
  if (byPrimary) return { id: byPrimary.id, matched: "primary" };
  return null;
}
