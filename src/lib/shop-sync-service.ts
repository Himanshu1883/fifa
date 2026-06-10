import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMatchBuyUrl } from "@/lib/shop-buy-urls";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import type { ShopEventCatalogueMeta, ShopLatestPayload, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import { shopLog, shopDiscordNotifyFingerprint, type ShopEventMetaLookup } from "@/lib/shop-service";
import type { ShopMarketListing } from "@/lib/shop-marketplace-types";

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
function rowToShopMarketEvent(row: {
  matchNum: number;
  externalEventId: string;
  linkedEventId: number | null;
  eventName: string;
  stage: string | null;
  venue: string | null;
  country: string | null;
  eventDate: Date | null;
  marketData: unknown;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  availableCount: number;
  listingsCount: number;
  rawPayload: unknown;
}): ShopMarketEvent {
  const listings = Array.isArray(row.marketData)
    ? (row.marketData as ShopMarketListing[])
    : [];
  return {
    matchNum: row.matchNum,
    externalEventId: row.externalEventId,
    catalogue: {
      linkedEventId: row.linkedEventId,
      eventName: row.eventName,
      matchLabel: `Match ${row.matchNum}`,
      stage: row.stage,
      venue: row.venue,
      country: row.country,
      eventDate: row.eventDate ? row.eventDate.toISOString() : null,
      competition: "FIFA World Cup 2026",
    },
    listings,
    availableCount: row.availableCount,
    listingsCount: row.listingsCount,
    lowestPrice: row.lowestPrice,
    highestPrice: row.highestPrice,
    averagePrice: row.averagePrice,
    currency: "EUR",
    buyUrl: buildMatchBuyUrl(row.matchNum),
    rawPayload: (row.rawPayload ?? {}) as ShopMarketEvent["rawPayload"],
  };
}

export async function loadShopEventsFromDatabase(
  metaByMatch: ShopEventMetaLookup,
): Promise<ShopMarketEvent[]> {
  try {
    const rows = await prisma.shopMarketplaceEventRecord.findMany({
      orderBy: { matchNum: "asc" },
    });
    const events = rows.map(rowToShopMarketEvent);
    return ensureAllShopMatches(events, metaByMatch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB load previous events failed: ${msg}`);
    return ensureAllShopMatches([], metaByMatch);
  }
}

export async function loadShopDiscordNotifyFingerprints(): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  try {
    const rows = await prisma.shopMarketplaceEventRecord.findMany({
      select: { matchNum: true, lastDiscordNotifyFingerprint: true },
    });
    for (const row of rows) {
      map.set(row.matchNum, row.lastDiscordNotifyFingerprint);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB load notify fingerprints failed: ${msg}`);
  }
  return map;
}

/** Persist last-notified price fingerprints after a successful Discord send. */
export async function updateShopDiscordNotifyFingerprints(
  events: ShopMarketEvent[],
): Promise<void> {
  if (events.length === 0) return;
  try {
    await prisma.$transaction(
      events.map((event) =>
        prisma.shopMarketplaceEventRecord.updateMany({
          where: { matchNum: event.matchNum },
          data: { lastDiscordNotifyFingerprint: shopDiscordNotifyFingerprint(event) },
        }),
      ),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB update notify fingerprints failed: ${msg}`);
  }
}

/**
 * Bootstrap null fingerprints from unchanged scrape state (post-migration)
 * without sending duplicate deltas.
 */
export async function bootstrapShopDiscordNotifyFingerprints(
  events: ShopMarketEvent[],
  previousEvents: ShopMarketEvent[],
  stored: Map<number, string | null>,
): Promise<void> {
  const prevMap = new Map(previousEvents.map((e) => [e.matchNum, e]));
  const toBootstrap: ShopMarketEvent[] = [];
  for (const event of events) {
    const storedFp = stored.get(event.matchNum);
    if (storedFp !== null && storedFp !== undefined) continue;
    const prev = prevMap.get(event.matchNum);
    const fp = shopDiscordNotifyFingerprint(event);
    const prevFp = shopDiscordNotifyFingerprint(prev ?? event);
    if (fp === prevFp) {
      toBootstrap.push(event);
    }
  }
  if (toBootstrap.length === 0) return;
  await updateShopDiscordNotifyFingerprints(toBootstrap);
  for (const event of toBootstrap) {
    stored.set(event.matchNum, shopDiscordNotifyFingerprint(event));
  }
  shopLog(`Discord notify fingerprints bootstrapped (${toBootstrap.length} matches)`);
}

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
