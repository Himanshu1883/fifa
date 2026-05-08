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
