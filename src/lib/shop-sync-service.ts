import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import type { ShopEventCatalogueMeta, ShopLatestPayload, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { shopLog, type ShopEventMetaLookup } from "@/lib/shop-service";

export async function loadShopEventMetaLookup(): Promise<ShopEventMetaLookup> {
  const rows = await prisma.event.findMany({
    select: {
      id: true,
      matchLabel: true,
      name: true,
      stage: true,
      venue: true,
      country: true,
      eventDate: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const map: ShopEventMetaLookup = new Map();
  for (const e of rows) {
    const matchNum = parseEventMatchNumber(e.matchLabel, e.name);
    if (matchNum === null) continue;
    const meta: ShopEventCatalogueMeta = {
      linkedEventId: e.id,
      eventName: e.name,
      matchLabel: e.matchLabel,
      stage: e.stage,
      venue: e.venue,
      country: e.country,
      eventDate: e.eventDate ? e.eventDate.toISOString() : null,
      competition: "FIFA World Cup 2026",
    };
    map.set(matchNum, meta);
  }
  return map;
}

function eventToDbRow(event: ShopMarketEvent, scannedAt: Date) {
  return {
    matchNum: event.matchNum,
    externalEventId: event.externalEventId,
    linkedEventId: event.catalogue.linkedEventId,
    eventName: event.catalogue.eventName,
    stage: event.catalogue.stage,
    venue: event.catalogue.venue,
    country: event.catalogue.country,
    eventDate: event.catalogue.eventDate ? new Date(event.catalogue.eventDate) : null,
    marketData: event.listings as unknown as Prisma.InputJsonValue,
    lowestPrice: event.lowestPrice,
    highestPrice: event.highestPrice,
    averagePrice: event.averagePrice,
    availableCount: event.availableCount,
    listingsCount: event.listingsCount,
    rawPayload: event.rawPayload as unknown as Prisma.InputJsonValue,
    scannedAt,
  };
}

/**
 * Background upsert — must not block UI; failures are logged only.
 */
export async function syncShopMarketplaceToDatabase(payload: ShopLatestPayload): Promise<void> {
  shopLog("DB sync started");
  const scannedAt = new Date(payload.scannedAt);
  if (!Number.isFinite(scannedAt.getTime())) {
    shopLog("DB sync skipped: invalid scannedAt");
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shopMarketplaceSyncMeta.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          scannedAt,
          rawPayload: {
            scannedAt: payload.scannedAt,
            fetchedAt: payload.fetchedAt,
            eventCount: payload.events.length,
          } as Prisma.InputJsonValue,
        },
        update: {
          scannedAt,
          rawPayload: {
            scannedAt: payload.scannedAt,
            fetchedAt: payload.fetchedAt,
            eventCount: payload.events.length,
            results: Object.fromEntries(
              payload.events.flatMap((ev) =>
                Object.entries(ev.rawPayload).map(([k, v]) => [k, v] as const),
              ),
            ),
          } as Prisma.InputJsonValue,
        },
      });

      for (const event of payload.events) {
        const row = eventToDbRow(event, scannedAt);
        await tx.shopMarketplaceEventRecord.upsert({
          where: { matchNum: event.matchNum },
          create: row,
          update: row,
        });
      }
    });
    shopLog("DB sync complete");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB sync failed: ${msg}`);
  }
}
