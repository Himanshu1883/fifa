import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMatchBuyUrl } from "@/lib/shop-buy-urls";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import type { ShopEventCatalogueMeta, ShopLatestPayload, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import {
  shopLog,
  shopDiscordNotifyFingerprint,
  shouldSendShopDiscordDelta,
  type ShopEventMetaLookup,
} from "@/lib/shop-service";
import type { ShopMarketListing } from "@/lib/shop-marketplace-types";

const SHOP_DB_META_LOOKUP_TIMEOUT_MS = 5_000;

/** Event catalogue enrichment — must not block shop UI when Postgres is slow. */
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

export async function safeLoadShopEventMetaLookup(
  timeoutMs = SHOP_DB_META_LOOKUP_TIMEOUT_MS,
): Promise<ShopEventMetaLookup> {
  try {
    return await Promise.race([
      loadShopEventMetaLookup(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`DB meta lookup timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB meta lookup failed: ${msg}`);
    return new Map();
  }
}

/** Last synced marketplace snapshot from Postgres (fallback when Viva API is down). */
export async function loadShopLatestPayloadFromDatabase(
  metaByMatch: ShopEventMetaLookup,
): Promise<ShopLatestPayload | null> {
  try {
    const meta = await prisma.shopMarketplaceSyncMeta.findUnique({ where: { id: 1 } });
    if (!meta) {
      shopLog("DB cached payload unavailable (no sync meta row)");
      return null;
    }

    const events = await loadShopEventsFromDatabase(metaByMatch);
    const hasData = events.some((e) => e.listingsCount > 0);
    if (!hasData) {
      shopLog("DB cached payload unavailable (no event rows)");
      return null;
    }

    const raw = meta.rawPayload as { fetchedAt?: string } | null;
    const fetchedAt =
      typeof raw?.fetchedAt === "string" && raw.fetchedAt.trim()
        ? raw.fetchedAt
        : meta.scannedAt.toISOString();

    shopLog(`DB cached payload loaded (${events.length} matches, scanned ${meta.scannedAt.toISOString()})`);
    return {
      scannedAt: meta.scannedAt.toISOString(),
      fetchedAt,
      events,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB load cached payload failed: ${msg}`);
    return null;
  }
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

/** Poll sync fields only — never includes lastDiscordNotifyFingerprint. */
function shopEventSyncWriteData(event: ShopMarketEvent, scannedAt: Date) {
  const row = eventToDbRow(event, scannedAt);
  return {
    externalEventId: row.externalEventId,
    linkedEventId: row.linkedEventId,
    eventName: row.eventName,
    stage: row.stage,
    venue: row.venue,
    country: row.country,
    eventDate: row.eventDate,
    marketData: row.marketData,
    lowestPrice: row.lowestPrice,
    highestPrice: row.highestPrice,
    averagePrice: row.averagePrice,
    availableCount: row.availableCount,
    listingsCount: row.listingsCount,
    rawPayload: row.rawPayload,
    scannedAt: row.scannedAt,
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
    currency: "USD",
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

/** Fresh DB read for one match — used right before send to beat concurrent polls. */
export async function loadShopDiscordNotifyFingerprintForMatch(
  matchNum: number,
): Promise<string | null> {
  try {
    const row = await prisma.shopMarketplaceEventRecord.findUnique({
      where: { matchNum },
      select: { lastDiscordNotifyFingerprint: true },
    });
    return row?.lastDiscordNotifyFingerprint ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB load notify fingerprint M${matchNum} failed: ${msg}`);
    return null;
  }
}

export type ShopDiscordFingerprintClaim =
  | { action: "skip"; reason: "same_fingerprint" | "no_priced_listings" }
  | { action: "send"; previousFingerprint: string | null; fingerprint: string; notifyLogId: number }
  | { action: "error"; message: string };

/**
 * Atomically claim a Discord delta send under pg_advisory_xact_lock(matchNum).
 * Persists fingerprint + notify log BEFORE Discord API call so concurrent polls never double-send.
 * Primary gate: stored fingerprint; backup: any prior notify log row for same matchNum+fingerprint.
 */
export async function claimShopDiscordNotifyFingerprint(
  event: ShopMarketEvent,
  scannedAt?: Date,
): Promise<ShopDiscordFingerprintClaim> {
  const fp = shopDiscordNotifyFingerprint(event);
  if (!fp) {
    return { action: "skip", reason: "no_priced_listings" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${event.matchNum})`;

      const existing = await tx.shopMarketplaceEventRecord.findUnique({
        where: { matchNum: event.matchNum },
        select: { lastDiscordNotifyFingerprint: true },
      });
      const stored = existing?.lastDiscordNotifyFingerprint ?? null;
      if (!shouldSendShopDiscordDelta(event, stored)) {
        shopLog(`Discord shop claim skip M${event.matchNum} (stored fingerprint match)`);
        return { action: "skip", reason: "same_fingerprint" as const };
      }

      const priorNotify = await tx.shopDiscordMatchNotifyLog.findFirst({
        where: { matchNum: event.matchNum, fingerprint: fp },
        select: { id: true },
      });
      if (priorNotify) {
        if (stored !== fp && existing) {
          await tx.shopMarketplaceEventRecord.update({
            where: { matchNum: event.matchNum },
            data: { lastDiscordNotifyFingerprint: fp },
          });
          shopLog(`Discord shop claim skip M${event.matchNum} (notify log match — stored synced)`);
        } else {
          shopLog(`Discord shop claim skip M${event.matchNum} (notify log fingerprint match)`);
        }
        return { action: "skip", reason: "same_fingerprint" as const };
      }

      const notifyLog = await tx.shopDiscordMatchNotifyLog.create({
        data: { matchNum: event.matchNum, fingerprint: fp },
      });

      if (existing) {
        await tx.shopMarketplaceEventRecord.update({
          where: { matchNum: event.matchNum },
          data: { lastDiscordNotifyFingerprint: fp },
        });
      } else {
        const scanned = scannedAt ?? new Date();
        const row = eventToDbRow(event, scanned);
        await tx.shopMarketplaceEventRecord.create({
          data: { ...row, lastDiscordNotifyFingerprint: fp },
        });
      }

      shopLog(`Discord shop claim send M${event.matchNum} (fingerprint + notify log reserved)`);
      return {
        action: "send",
        previousFingerprint: stored,
        fingerprint: fp,
        notifyLogId: notifyLog.id,
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB claim notify fingerprint M${event.matchNum} failed: ${msg}`);
    return { action: "error", message: msg };
  }
}

/** Undo a claim when Discord POST fails after fingerprint + notify log were reserved. */
export async function revertShopDiscordNotifyFingerprint(
  matchNum: number,
  previousFingerprint: string | null,
  notifyLogId?: number,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.shopMarketplaceEventRecord.update({
        where: { matchNum },
        data: { lastDiscordNotifyFingerprint: previousFingerprint },
      });
      if (notifyLogId != null) {
        await tx.shopDiscordMatchNotifyLog.deleteMany({ where: { id: notifyLogId } });
      }
    });
    shopLog(`Discord shop claim reverted M${matchNum}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB revert notify fingerprint M${matchNum} failed: ${msg}`);
  }
}

/** Persist fingerprint without claiming (bootstrap / removal-only paths). */
export async function persistShopDiscordNotifyFingerprint(
  event: ShopMarketEvent,
  scannedAt?: Date,
): Promise<boolean> {
  const fp = shopDiscordNotifyFingerprint(event);
  if (!fp) return false;

  try {
    const updated = await prisma.shopMarketplaceEventRecord.updateMany({
      where: { matchNum: event.matchNum },
      data: { lastDiscordNotifyFingerprint: fp },
    });
    if (updated.count > 0) return true;

    const scanned = scannedAt ?? new Date();
    const row = eventToDbRow(event, scanned);
    await prisma.shopMarketplaceEventRecord.upsert({
      where: { matchNum: event.matchNum },
      create: { ...row, lastDiscordNotifyFingerprint: fp },
      update: { lastDiscordNotifyFingerprint: fp },
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB persist notify fingerprint M${event.matchNum} failed: ${msg}`);
    return false;
  }
}

/** Persist last-notified price fingerprints after a successful Discord send. */
export async function updateShopDiscordNotifyFingerprints(
  events: ShopMarketEvent[],
): Promise<void> {
  if (events.length === 0) return;
  for (const event of events) {
    await persistShopDiscordNotifyFingerprint(event);
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
        const syncData = shopEventSyncWriteData(event, scannedAt);
        await tx.shopMarketplaceEventRecord.upsert({
          where: { matchNum: event.matchNum },
          create: { matchNum: event.matchNum, ...syncData },
          update: syncData,
        });
      }
    });
    shopLog("DB sync complete");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`DB sync failed: ${msg}`);
  }
}
