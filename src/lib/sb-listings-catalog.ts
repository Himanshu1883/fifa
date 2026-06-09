import "server-only";

import { repairStaleSbDeleteLogs } from "@/lib/sb-listing-delete";
import { resolveSbMatchLabels } from "@/lib/sb-match-labels-service";
import {
  findAllSbListingPushLogsForCatalog,
  findSbListingPushLogDetailById,
  findSbListingPushLogsForCatalogByEvent,
} from "@/lib/sb-listing-push-log-query";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import {
  resolveSeatsBrokersUrl,
  SEATS_BROKERS_PATH_TICKET_CREATE,
  SEATS_BROKERS_PATH_TICKET_DELETE,
} from "@/lib/seatsbrokers-client";
import { sourceSeatNumbersFromPushSummary } from "@/lib/sb-listing-fingerprint";
import type { SbCatalogListing, SbCatalogMatch } from "@/lib/sb-listings-catalog-types";
import type { SbListingUiStatus } from "@/lib/sb-listing-status";
import { prisma } from "@/lib/prisma";
import { extractSbTicketId } from "@/lib/sb-ticket-id";

export type { SbCatalogListing, SbCatalogMatch } from "@/lib/sb-listings-catalog-types";

function summaryField(summary: unknown, key: string): string | null {
  if (summary === null || typeof summary !== "object") return null;
  const v = (summary as Record<string, unknown>)[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function summarySeatNumbers(summary: unknown): string[] {
  if (summary === null || typeof summary !== "object") return [];
  const s = (summary as { seatNumbers?: unknown }).seatNumbers;
  if (!Array.isArray(s)) return [];
  return s.map((n) => String(n).trim()).filter(Boolean);
}

function deriveUiStatus(row: {
  inventoryRemovedAt?: Date | null;
  sbDeletedAt?: Date | null;
  sbDeleteError?: string | null;
}): SbListingUiStatus {
  if (row.sbDeletedAt) return "deleted";
  if (row.sbDeleteError) return "delete_failed";
  if (row.inventoryRemovedAt) return "removed";
  return "pushed";
}

function fieldsFromLog(requestFields: unknown): Record<string, string> {
  if (requestFields === null || typeof requestFields !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(requestFields as Record<string, unknown>)) {
    if (v != null) out[k] = String(v).trim();
  }
  return out;
}

function summaryRecord(summary: unknown): Record<string, unknown> {
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) return {};
  return summary as Record<string, unknown>;
}

/** Reconcile runs synchronously after each RESALE scrape webhook. */
const LAST_SCRAPE_RECONCILE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Count listings removed from scrape inventory and deleted on SB during the latest scrape batch.
 * Uses inventoryRemovedAt (set only when a listing vanishes from scrape) scoped to the scrape
 * window so manual deletes long after a scrape are excluded.
 */
function countLastScrapeAutoDeleted(
  listings: SbCatalogListing[],
  lastScrapeAt: string | null,
): number {
  if (!lastScrapeAt) return 0;
  const scrapeMs = new Date(lastScrapeAt).getTime();
  if (!Number.isFinite(scrapeMs)) return 0;
  const windowEnd = scrapeMs + LAST_SCRAPE_RECONCILE_WINDOW_MS;

  return listings.filter((l) => {
    if (!l.inventoryRemovedAt || !l.sbDeletedAt) return false;
    const removedMs = new Date(l.inventoryRemovedAt).getTime();
    if (!Number.isFinite(removedMs)) return false;
    return removedMs >= scrapeMs && removedMs <= windowEnd;
  }).length;
}

function scalarFromSummary(summary: unknown, key: string): string | null {
  const rec = summaryRecord(summary);
  const v = rec[key];
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s || null;
}

function listingFromLog(
  row: {
    id: number;
    matchId: string;
    trigger: string;
    sbTicketId: string | null;
    requestFields?: unknown;
    requestSummary: unknown;
    responseBody?: unknown;
    httpStatus: number | null;
    errorMessage: string | null;
    offerIndex: number | null;
    listingFingerprint: string;
    inventoryRemovedAt?: Date | null;
    sbDeletedAt?: Date | null;
    sbDeleteError?: string | null;
    sbDeleteHttpStatus?: number | null;
    createdAt: Date;
  },
  opts?: { includePayload?: boolean },
): SbCatalogListing {
  const includePayload = opts?.includePayload ?? row.requestFields !== undefined;
  const fields = includePayload ? fieldsFromLog(row.requestFields) : {};
  const summary = row.requestSummary;
  const sourceNums = sourceSeatNumbersFromPushSummary(summary);
  const seatNumbers = summarySeatNumbers(summary);
  const nums = seatNumbers.length > 0 ? seatNumbers : sourceNums;
  const sbTicketId =
    row.sbTicketId?.trim() ||
    (includePayload ? extractSbTicketId(row.responseBody) : null) ||
    null;
  const config = getSeatsBrokersConfig();
  const sbApiBaseUrl = config?.baseUrl ?? null;
  const pushEndpoint = SEATS_BROKERS_PATH_TICKET_CREATE;
  const pushApiUrl = config ? resolveSeatsBrokersUrl(config, pushEndpoint) : null;
  const hasDeleteActivity =
    row.inventoryRemovedAt != null ||
    row.sbDeletedAt != null ||
    row.sbDeleteError != null ||
    row.sbDeleteHttpStatus != null;
  const deleteEndpoint = hasDeleteActivity ? SEATS_BROKERS_PATH_TICKET_DELETE : null;
  const deleteApiUrl =
    config && deleteEndpoint ? resolveSeatsBrokersUrl(config, deleteEndpoint) : null;

  return {
    logId: row.id,
    sbTicketId,
    status: deriveUiStatus(row),
    trigger: row.trigger,
    matchId: row.matchId,
    pushedAt: row.createdAt.toISOString(),
    inventoryRemovedAt: row.inventoryRemovedAt?.toISOString() ?? null,
    sbDeletedAt: row.sbDeletedAt?.toISOString() ?? null,
    sbDeleteError: row.sbDeleteError ?? null,
    quantity: fields.quantity ?? scalarFromSummary(summary, "quantity"),
    price:
      fields.price ??
      (() => {
        const usd = scalarFromSummary(summary, "priceUsd");
        if (!usd) return null;
        const n = Number.parseFloat(usd);
        return Number.isFinite(n) ? String(Math.max(1, Math.round(n))) : usd;
      })(),
    priceType: fields.price_type ?? null,
    ticketCategory: fields.ticket_category ?? null,
    ticketDetails: fields.ticket_details ?? null,
    ticketType: fields.ticket_type ?? null,
    blockName: summaryField(summary, "blockName"),
    row: summaryField(summary, "row"),
    categoryName: summaryField(summary, "categoryName"),
    categoryLabel: summaryField(summary, "categoryLabel"),
    seatNumbers: nums,
    offerType: summaryField(summary, "offerType"),
    sbApiBaseUrl,
    pushEndpoint,
    pushApiUrl,
    deleteEndpoint,
    deleteApiUrl,
    requestFields: includePayload ? fields : {},
    requestSummary: includePayload ? summaryRecord(summary) : {},
    responseBody: includePayload ? (row.responseBody ?? null) : null,
    httpStatus: row.httpStatus,
    errorMessage: row.errorMessage,
    offerIndex: row.offerIndex,
    listingFingerprint: row.listingFingerprint,
    sbDeleteHttpStatus: row.sbDeleteHttpStatus ?? null,
  };
}

type CatalogEventRow = {
  id: number;
  name: string;
  sbEventId: string | null;
  eventDate: Date | null;
  venue: string | null;
  stage: string | null;
  country: string | null;
  sortOrder: number;
};

type CatalogCountRow = {
  eventId: number;
  activeCount: number;
  deletedCount: number;
  failedCount: number;
  pendingCount: number;
};

function sortCatalogListings(listings: SbCatalogListing[]): SbCatalogListing[] {
  return [...listings].sort((a, b) => {
    const statusOrder = { pushed: 0, removed: 1, delete_failed: 2, deleted: 3 };
    const sd = statusOrder[a.status] - statusOrder[b.status];
    if (sd !== 0) return sd;
    return b.pushedAt.localeCompare(a.pushedAt);
  });
}

function countsFromListings(listings: SbCatalogListing[]): Pick<
  SbCatalogMatch,
  "activeCount" | "deletedCount" | "failedCount" | "pendingCount"
> {
  return {
    activeCount: listings.filter((l) => l.status === "pushed").length,
    deletedCount: listings.filter((l) => l.status === "deleted").length,
    failedCount: listings.filter((l) => l.status === "delete_failed").length,
    pendingCount: listings.filter((l) => l.status === "removed").length,
  };
}

function sortCatalogMatches(matches: SbCatalogMatch[]): SbCatalogMatch[] {
  return [...matches].sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
    } else if (a.eventDate) return -1;
    else if (b.eventDate) return 1;
    return a.sortOrder - b.sortOrder;
  });
}

async function loadLastScrapeByEvent(eventIds: number[]): Promise<Map<number, string>> {
  const lastScrapeByEvent = new Map<number, string>();
  if (eventIds.length === 0) return lastScrapeByEvent;

  const [latestDiffLogs, sockUpdatedMax] = await Promise.all([
    prisma.sockAvailableWebhookDiffLog.findMany({
      where: { eventId: { in: eventIds }, kind: "RESALE" },
      orderBy: { createdAt: "desc" },
      distinct: ["eventId"],
      select: { eventId: true, createdAt: true },
    }),
    prisma.sockAvailable.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds }, kind: "RESALE" },
      _max: { updatedAt: true },
    }),
  ]);

  for (const row of latestDiffLogs) {
    lastScrapeByEvent.set(row.eventId, row.createdAt.toISOString());
  }
  for (const row of sockUpdatedMax) {
    const maxAt = row._max.updatedAt;
    if (!maxAt) continue;
    const iso = maxAt.toISOString();
    const prev = lastScrapeByEvent.get(row.eventId);
    if (!prev || iso > prev) lastScrapeByEvent.set(row.eventId, iso);
  }

  return lastScrapeByEvent;
}

async function loadCatalogCountRows(): Promise<CatalogCountRow[]> {
  return prisma.$queryRaw<CatalogCountRow[]>`
    SELECT
      event_id AS "eventId",
      COUNT(*) FILTER (
        WHERE sb_deleted_at IS NULL
          AND inventory_removed_at IS NULL
          AND (sb_delete_error IS NULL OR sb_delete_error = '')
      )::int AS "activeCount",
      COUNT(*) FILTER (WHERE sb_deleted_at IS NOT NULL)::int AS "deletedCount",
      COUNT(*) FILTER (
        WHERE sb_deleted_at IS NULL
          AND sb_delete_error IS NOT NULL
          AND sb_delete_error != ''
      )::int AS "failedCount",
      COUNT(*) FILTER (
        WHERE sb_deleted_at IS NULL
          AND inventory_removed_at IS NOT NULL
          AND (sb_delete_error IS NULL OR sb_delete_error = '')
      )::int AS "pendingCount"
    FROM sb_listing_push_logs
    WHERE ok = true
      AND (error_message IS NULL OR error_message != '__sb_push_claim__')
    GROUP BY event_id
  `;
}

function matchFromEventAndCounts(
  event: CatalogEventRow,
  counts: CatalogCountRow,
  lastScrapeAt: string | null,
  listings?: SbCatalogListing[],
  sbMatchLabel?: string | null,
): SbCatalogMatch {
  const sorted = listings ? sortCatalogListings(listings) : undefined;
  return {
    eventId: event.id,
    eventName: event.name,
    sbEventId: event.sbEventId,
    sbMatchLabel: sbMatchLabel ?? null,
    eventDate: event.eventDate?.toISOString().slice(0, 10) ?? null,
    venue: event.venue,
    stage: event.stage,
    country: event.country,
    sortOrder: event.sortOrder,
    lastScrapeAt,
    lastScrapeDeletedCount: sorted ? countLastScrapeAutoDeleted(sorted, lastScrapeAt) : 0,
    activeCount: counts.activeCount,
    deletedCount: counts.deletedCount,
    failedCount: counts.failedCount,
    pendingCount: counts.pendingCount,
    listings: sorted,
  };
}

/** Fast match list with counts only — no listing rows (lazy accordion). */
export async function loadSbListingsCatalogSummary(): Promise<SbCatalogMatch[]> {
  const countRows = await loadCatalogCountRows();
  if (countRows.length === 0) return [];

  const eventIds = countRows.map((r) => r.eventId);
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      name: true,
      sbEventId: true,
      eventDate: true,
      venue: true,
      stage: true,
      country: true,
      sortOrder: true,
    },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));
  const lastScrapeByEvent = await loadLastScrapeByEvent(eventIds);
  const sbIds = [
    ...new Set(events.map((e) => e.sbEventId?.trim() ?? "").filter(Boolean)),
  ];
  let sbLabelsById: Record<string, string> = {};
  if (sbIds.length > 0) {
    try {
      sbLabelsById = await resolveSbMatchLabels(sbIds);
    } catch {
      /* optional enrichment */
    }
  }

  const matches: SbCatalogMatch[] = [];
  for (const counts of countRows) {
    const event = eventById.get(counts.eventId);
    if (!event) continue;
    const sbId = event.sbEventId?.trim() ?? "";
    matches.push(
      matchFromEventAndCounts(
        event,
        counts,
        lastScrapeByEvent.get(counts.eventId) ?? null,
        undefined,
        sbId ? (sbLabelsById[sbId] ?? null) : null,
      ),
    );
  }

  return sortCatalogMatches(matches);
}

function scheduleStaleDeleteRepair(eventId?: number) {
  if (!getSeatsBrokersConfig()) return;
  void repairStaleSbDeleteLogs(eventId != null ? { eventId } : undefined).catch((e) => {
    console.warn("[sb-listings-catalog] stale delete repair failed", e);
  });
}

/** Full push log for catalog detail modal (lazy-loaded). */
export async function loadSbCatalogListingDetail(logId: number): Promise<SbCatalogListing | null> {
  const row = await findSbListingPushLogDetailById(logId);
  if (!row) return null;
  return listingFromLog(row, { includePayload: true });
}

/** Listings for one match — called when accordion opens. */
export async function loadSbListingsForEvent(
  eventId: number,
  opts?: { repair?: boolean },
): Promise<SbCatalogMatch | null> {
  if (opts?.repair) {
    scheduleStaleDeleteRepair(eventId);
  }

  const [event, logs, lastScrapeByEvent] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        sbEventId: true,
        eventDate: true,
        venue: true,
        stage: true,
        country: true,
        sortOrder: true,
      },
    }),
    findSbListingPushLogsForCatalogByEvent(eventId),
    loadLastScrapeByEvent([eventId]),
  ]);

  if (!event) return null;

  const listings = sortCatalogListings(logs.map((log) => listingFromLog(log)));
  const counts = countsFromListings(listings);
  const sbId = event.sbEventId?.trim() ?? "";
  let sbMatchLabel: string | null = null;
  if (sbId) {
    try {
      const labels = await resolveSbMatchLabels([sbId]);
      sbMatchLabel = labels[sbId] ?? null;
    } catch {
      /* optional */
    }
  }

  return matchFromEventAndCounts(
    event,
    { eventId, ...counts },
    lastScrapeByEvent.get(eventId) ?? null,
    listings,
    sbMatchLabel,
  );
}

/** All SB listing push logs grouped by match (event). Full payload — prefer summary + lazy load. */
export async function loadSbListingsCatalog(): Promise<SbCatalogMatch[]> {
  scheduleStaleDeleteRepair();

  const logs = await findAllSbListingPushLogsForCatalog();

  const eventIds = [...new Set(logs.map((l) => l.eventId))];
  if (eventIds.length === 0) return [];

  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      name: true,
      sbEventId: true,
      eventDate: true,
      venue: true,
      stage: true,
      country: true,
      sortOrder: true,
    },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));
  const lastScrapeByEvent = await loadLastScrapeByEvent(eventIds);
  const sbIds = [
    ...new Set(events.map((e) => e.sbEventId?.trim() ?? "").filter(Boolean)),
  ];
  let sbLabelsById: Record<string, string> = {};
  if (sbIds.length > 0) {
    try {
      sbLabelsById = await resolveSbMatchLabels(sbIds);
    } catch {
      /* optional */
    }
  }

  const byEvent = new Map<number, SbCatalogListing[]>();
  for (const log of logs) {
    const list = byEvent.get(log.eventId) ?? [];
    list.push(listingFromLog(log));
    byEvent.set(log.eventId, list);
  }

  const matches: SbCatalogMatch[] = [];

  for (const [eventId, listings] of byEvent) {
    const event = eventById.get(eventId);
    if (!event) continue;

    const sorted = sortCatalogListings(listings);
    const counts = countsFromListings(sorted);

    const sbId = event.sbEventId?.trim() ?? "";
    matches.push(
      matchFromEventAndCounts(
        event,
        { eventId, ...counts },
        lastScrapeByEvent.get(eventId) ?? null,
        sorted,
        sbId ? (sbLabelsById[sbId] ?? null) : null,
      ),
    );
  }

  return sortCatalogMatches(matches);
}
