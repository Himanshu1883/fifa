import "server-only";

import { repairStaleSbDeleteLogs } from "@/lib/sb-listing-delete";
import { findAllSbListingPushLogsForCatalog } from "@/lib/sb-listing-push-log-query";
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

function listingFromLog(row: {
  id: number;
  matchId: string;
  trigger: string;
  sbTicketId: string | null;
  requestFields: unknown;
  requestSummary: unknown;
  responseBody: unknown;
  httpStatus: number | null;
  errorMessage: string | null;
  offerIndex: number | null;
  listingFingerprint: string;
  inventoryRemovedAt?: Date | null;
  sbDeletedAt?: Date | null;
  sbDeleteError?: string | null;
  sbDeleteHttpStatus?: number | null;
  createdAt: Date;
}): SbCatalogListing {
  const fields = fieldsFromLog(row.requestFields);
  const summary = row.requestSummary;
  const sourceNums = sourceSeatNumbersFromPushSummary(summary);
  const seatNumbers = summarySeatNumbers(summary);
  const nums = seatNumbers.length > 0 ? seatNumbers : sourceNums;
  const sbTicketId = row.sbTicketId?.trim() || extractSbTicketId(row.responseBody) || null;
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
    quantity: fields.quantity ?? null,
    price: fields.price ?? null,
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
    requestFields: fields,
    requestSummary: summaryRecord(summary),
    responseBody: row.responseBody ?? null,
    httpStatus: row.httpStatus,
    errorMessage: row.errorMessage,
    offerIndex: row.offerIndex,
    listingFingerprint: row.listingFingerprint,
    sbDeleteHttpStatus: row.sbDeleteHttpStatus ?? null,
  };
}

/** All SB listing push logs grouped by match (event), for the global catalog UI. */
export async function loadSbListingsCatalog(): Promise<SbCatalogMatch[]> {
  if (getSeatsBrokersConfig()) {
    try {
      await repairStaleSbDeleteLogs();
    } catch (e) {
      console.warn("[sb-listings-catalog] stale delete repair failed", e);
    }
  }

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

  const lastScrapeByEvent = new Map<number, string>();
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

    listings.sort((a, b) => {
      const statusOrder = { pushed: 0, removed: 1, delete_failed: 2, deleted: 3 };
      const sd = statusOrder[a.status] - statusOrder[b.status];
      if (sd !== 0) return sd;
      return b.pushedAt.localeCompare(a.pushedAt);
    });

    const activeCount = listings.filter((l) => l.status === "pushed").length;
    const deletedCount = listings.filter((l) => l.status === "deleted").length;
    const failedCount = listings.filter((l) => l.status === "delete_failed").length;
    const pendingCount = listings.filter((l) => l.status === "removed").length;

    matches.push({
      eventId: event.id,
      eventName: event.name,
      sbEventId: event.sbEventId,
      eventDate: event.eventDate?.toISOString().slice(0, 10) ?? null,
      venue: event.venue,
      stage: event.stage,
      country: event.country,
      sortOrder: event.sortOrder,
      lastScrapeAt: lastScrapeByEvent.get(eventId) ?? null,
      activeCount,
      deletedCount,
      failedCount,
      pendingCount,
      listings,
    });
  }

  matches.sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      const d = a.eventDate.localeCompare(b.eventDate);
      if (d !== 0) return d;
    } else if (a.eventDate) return -1;
    else if (b.eventDate) return 1;
    return a.sortOrder - b.sortOrder;
  });

  return matches;
}
