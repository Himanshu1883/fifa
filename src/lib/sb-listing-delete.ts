import {
  isSbListingRemovalMigrationMissingError,
  sbPushLogExcludingClaimWhere,
} from "@/lib/sb-listing-push-log-query";
import type { SbListingStatusEntry } from "@/lib/sb-listing-status";
import { prisma } from "@/lib/prisma";
import { sbDeleteTicket, sbListTickets } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig, type SeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import {
  collectSbTicketIdsFromListResponse,
  extractSbTicketId,
  isSbDeleteAlreadyGoneError,
  isSbTicketOnMatch,
  sbTicketIdVariants,
  sbTicketIdsMatch,
} from "@/lib/sb-ticket-id";

const SB_PUSH_CLAIM_MARKER = "__sb_push_claim__";

export type DeleteSbListingResult =
  | { ok: true; logId: number; sbTicketId: string; entry: SbListingStatusEntry }
  | { ok: false; error: string; httpStatus?: number };

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

function seatSetKeyFromPushSummary(summary: unknown): string | null {
  if (summary === null || typeof summary !== "object") return null;
  const s = summary as { seatIds?: unknown };
  if (!Array.isArray(s.seatIds)) return null;
  const ids = s.seatIds.map((id) => String(id).trim()).filter(Boolean).sort();
  return ids.length > 0 ? ids.join(",") : null;
}

function sourceSeatIdsFromPushSummary(summary: unknown): string[] {
  if (summary === null || typeof summary !== "object") return [];
  const s = summary as { sourceSeatIds?: unknown };
  if (!Array.isArray(s.sourceSeatIds)) return [];
  return s.sourceSeatIds.map((id) => String(id).trim()).filter(Boolean);
}

function entryFromDeletedLog(log: {
  id: number;
  sbTicketId: string | null;
  listingFingerprint: string;
  requestSummary: unknown;
  inventoryRemovedAt: Date | null;
  sbDeletedAt: Date | null;
  sbDeleteError: string | null;
  createdAt: Date;
}): SbListingStatusEntry {
  const seatKey = seatSetKeyFromPushSummary(log.requestSummary);
  const deleted = Boolean(log.sbDeletedAt);
  return {
    logId: log.id,
    sbTicketId: log.sbTicketId,
    status: deleted ? "deleted" : log.sbDeleteError ? "delete_failed" : "removed",
    listingFingerprint: log.listingFingerprint,
    seatKey,
    blockName: summaryField(log.requestSummary, "blockName"),
    row: summaryField(log.requestSummary, "row"),
    seatNumbers: summarySeatNumbers(log.requestSummary),
    sourceSeatIds: sourceSeatIdsFromPushSummary(log.requestSummary),
    inventoryRemovedAt: log.inventoryRemovedAt?.toISOString() ?? null,
    sbDeletedAt: log.sbDeletedAt?.toISOString() ?? null,
    sbDeleteError: log.sbDeleteError ?? null,
    pushedAt: log.createdAt.toISOString(),
  };
}

const ticketIdVariants = sbTicketIdVariants;
const ticketIdsMatch = sbTicketIdsMatch;

const matchTicketCache = new Map<string, Promise<Set<string> | null>>();

async function ticketIdsOnSbMatch(matchId: string, config: SeatsBrokersConfig): Promise<Set<string> | null> {
  const key = matchId.trim();
  if (!key) return null;
  let pending = matchTicketCache.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await sbListTickets(key, config);
      if (!res.ok) return null;
      return collectSbTicketIdsFromListResponse(res.data);
    })();
    matchTicketCache.set(key, pending);
    pending.finally(() => {
      matchTicketCache.delete(key);
    });
  }
  return pending;
}

async function isTicketStillOnSb(
  ticketId: string,
  matchId: string,
  config: SeatsBrokersConfig,
): Promise<boolean | null> {
  const ids = await ticketIdsOnSbMatch(matchId, config);
  if (ids === null) return null;
  return isSbTicketOnMatch(ticketId, ids);
}

async function markLogDeletedOnSb(
  logId: number,
  httpStatus: number | null,
): Promise<{
  id: number;
  sbTicketId: string | null;
  listingFingerprint: string;
  requestSummary: unknown;
  inventoryRemovedAt: Date | null;
  sbDeletedAt: Date | null;
  sbDeleteError: string | null;
  createdAt: Date;
}> {
  const now = new Date();
  return prisma.sbListingPushLog.update({
    where: { id: logId },
    data: {
      sbDeletedAt: now,
      sbDeleteHttpStatus: httpStatus,
      sbDeleteError: null,
    },
    select: {
      id: true,
      sbTicketId: true,
      listingFingerprint: true,
      requestSummary: true,
      inventoryRemovedAt: true,
      sbDeletedAt: true,
      sbDeleteError: true,
      createdAt: true,
    },
  });
}

const pushLogSelect = {
  id: true,
  matchId: true,
  sbTicketId: true,
  listingFingerprint: true,
  requestSummary: true,
  inventoryRemovedAt: true,
  sbDeletedAt: true,
  sbDeleteError: true,
  createdAt: true,
  ok: true,
  errorMessage: true,
  responseBody: true,
} as const;

async function resolvePushLog(
  eventId: number,
  options: { logId?: number; sbTicketId?: string },
) {
  if (options.logId != null && options.logId > 0) {
    const byId = await prisma.sbListingPushLog.findFirst({
      where: { id: options.logId, eventId },
      select: pushLogSelect,
    });
    if (byId && byId.errorMessage !== SB_PUSH_CLAIM_MARKER) return byId;
  }

  const ticketId = options.sbTicketId?.trim();
  if (!ticketId) return null;

  const variants = ticketIdVariants(ticketId);
  for (const id of variants) {
    const byColumn = await prisma.sbListingPushLog.findFirst({
      where: { eventId, sbTicketId: id },
      orderBy: { createdAt: "desc" },
      select: pushLogSelect,
    });
    if (byColumn && byColumn.errorMessage !== SB_PUSH_CLAIM_MARKER) return byColumn;
  }

  const recent = await prisma.sbListingPushLog.findMany({
    where: { eventId, ...sbPushLogExcludingClaimWhere() },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: pushLogSelect,
  });

  for (const row of recent) {
    if (row.sbTicketId && variants.some((v) => ticketIdsMatch(v, row.sbTicketId!))) {
      return row;
    }
    const fromResponse = extractSbTicketId(row.responseBody);
    if (fromResponse && variants.some((v) => ticketIdsMatch(v, fromResponse))) {
      return row;
    }
  }

  return null;
}

function syntheticDeletedEntry(
  sbTicketId: string,
  meta?: { blockName?: string | null; row?: string | null; seatIds?: string[] },
): SbListingStatusEntry {
  const now = new Date().toISOString();
  const seatKey =
    meta?.seatIds?.length ? [...meta.seatIds].map((s) => s.trim()).filter(Boolean).sort().join(",") : null;
  return {
    logId: 0,
    sbTicketId,
    status: "deleted",
    listingFingerprint: "",
    seatKey,
    blockName: meta?.blockName ?? null,
    row: meta?.row ?? null,
    seatNumbers: [],
    sourceSeatIds: meta?.seatIds ?? [],
    inventoryRemovedAt: now,
    sbDeletedAt: now,
    sbDeleteError: null,
    pushedAt: now,
  };
}

/**
 * Delete a pushed listing on SeatsBrokers (ticket/delete) and update our push log.
 * Used for manual UI delete and scrape-driven reconcile.
 */
export async function deleteSbListingForEvent(
  eventId: number,
  options: {
    logId?: number;
    sbTicketId?: string;
    matchId?: string;
    /** When true (scrape reconcile), mark inventory_removed_at before calling SB. */
    markInventoryRemoved?: boolean;
    /** Optional UI row context for orphan deletes (no push log). */
    rowMeta?: { blockName?: string | null; row?: string | null; seatIds?: string[] };
  },
): Promise<DeleteSbListingResult> {
  const config = getSeatsBrokersConfig();
  if (!config) {
    return { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY." };
  }

  let log: Awaited<ReturnType<typeof resolvePushLog>>;
  try {
    log = await resolvePushLog(eventId, options);
  } catch (e) {
    if (isSbListingRemovalMigrationMissingError(e)) {
      return { ok: false, error: "Database migration pending for SB listing removal tracking." };
    }
    throw e;
  }

  const requestedTicketId = options.sbTicketId?.trim() ?? null;
  const matchIdForOrphan = options.matchId?.trim() ?? null;

  if (!log) {
    if (requestedTicketId && matchIdForOrphan) {
      const deleteRes = await sbDeleteTicket(requestedTicketId, matchIdForOrphan, config);
      if (!deleteRes.ok) {
        return {
          ok: false,
          error: deleteRes.error || "SeatsBrokers delete failed.",
          httpStatus: deleteRes.status,
        };
      }
      return {
        ok: true,
        logId: 0,
        sbTicketId: requestedTicketId,
        entry: syntheticDeletedEntry(requestedTicketId, options.rowMeta),
      };
    }
    return {
      ok: false,
      error:
        "No push log for this listing. Send sbTicketId and ensure the event has an SB match id, or push from this app first.",
    };
  }

  const ticketId =
    log.sbTicketId?.trim() ||
    extractSbTicketId(log.responseBody) ||
    requestedTicketId;
  if (!ticketId) {
    return { ok: false, error: "Push log has no SB listing id." };
  }

  if (log.sbDeletedAt) {
    return {
      ok: true,
      logId: log.id,
      sbTicketId: ticketId,
      entry: entryFromDeletedLog(log),
    };
  }

  const matchId = (options.matchId ?? log.matchId)?.trim();
  if (!matchId) {
    return { ok: false, error: "No SB match id on event or push log." };
  }

  const now = new Date();

  const stillOnSb = await isTicketStillOnSb(ticketId, matchId, config);
  if (stillOnSb === false) {
    const updated = await markLogDeletedOnSb(log.id, null);
    return {
      ok: true,
      logId: updated.id,
      sbTicketId: ticketId,
      entry: entryFromDeletedLog(updated),
    };
  }

  if (options.markInventoryRemoved && !log.inventoryRemovedAt) {
    try {
      await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: { inventoryRemovedAt: now },
        select: { id: true },
      });
    } catch (e) {
      if (isSbListingRemovalMigrationMissingError(e)) {
        return { ok: false, error: "Database migration pending for SB listing removal tracking." };
      }
      throw e;
    }
  }

  const deleteRes = await sbDeleteTicket(ticketId, matchId, config);

  let updated: {
    id: number;
    sbTicketId: string | null;
    listingFingerprint: string;
    requestSummary: unknown;
    inventoryRemovedAt: Date | null;
    sbDeletedAt: Date | null;
    sbDeleteError: string | null;
    createdAt: Date;
  };

  try {
    if (deleteRes.ok) {
      updated = await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: {
          sbDeletedAt: now,
          sbDeleteHttpStatus: deleteRes.status,
          sbDeleteError: null,
        },
        select: {
          id: true,
          sbTicketId: true,
          listingFingerprint: true,
          requestSummary: true,
          inventoryRemovedAt: true,
          sbDeletedAt: true,
          sbDeleteError: true,
          createdAt: true,
        },
      });
    } else {
      const goneOnSb =
        isSbDeleteAlreadyGoneError(deleteRes.error, deleteRes.status) ||
        (await isTicketStillOnSb(ticketId, matchId, config)) === false;

      if (goneOnSb) {
        updated = await markLogDeletedOnSb(log.id, deleteRes.status || null);
        return {
          ok: true,
          logId: updated.id,
          sbTicketId: ticketId,
          entry: entryFromDeletedLog(updated),
        };
      }

      updated = await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: {
          sbDeleteHttpStatus: deleteRes.status || null,
          sbDeleteError: deleteRes.error.slice(0, 2000),
        },
        select: {
          id: true,
          sbTicketId: true,
          listingFingerprint: true,
          requestSummary: true,
          inventoryRemovedAt: true,
          sbDeletedAt: true,
          sbDeleteError: true,
          createdAt: true,
        },
      });
      return {
        ok: false,
        error: deleteRes.error || "SeatsBrokers delete failed.",
        httpStatus: deleteRes.status,
      };
    }
  } catch (e) {
    if (isSbListingRemovalMigrationMissingError(e)) {
      return { ok: false, error: "Database migration pending for SB listing removal tracking." };
    }
    throw e;
  }

  return {
    ok: true,
    logId: updated.id,
    sbTicketId: ticketId,
    entry: entryFromDeletedLog(updated),
  };
}

/**
 * Fix stale `delete_failed` rows when the listing is already gone on SeatsBrokers
 * (e.g. sandbox was down, then deleted manually or on a later retry).
 */
export async function repairStaleSbDeleteLogs(options?: {
  eventId?: number;
}): Promise<{ checked: number; markedDeleted: number }> {
  const config = getSeatsBrokersConfig();
  if (!config) return { checked: 0, markedDeleted: 0 };

  const stale = await prisma.sbListingPushLog.findMany({
    where: {
      ok: true,
      sbDeletedAt: null,
      inventoryRemovedAt: { not: null },
      sbDeleteError: { not: null },
      sbTicketId: { not: null },
      ...sbPushLogExcludingClaimWhere(),
      ...(options?.eventId != null ? { eventId: options.eventId } : {}),
    },
    select: { id: true, sbTicketId: true, matchId: true },
  });

  let markedDeleted = 0;
  for (const row of stale) {
    const ticketId = row.sbTicketId?.trim();
    const matchId = row.matchId?.trim();
    if (!ticketId || !matchId) continue;

    const onSb = await isTicketStillOnSb(ticketId, matchId, config);
    if (onSb !== false) continue;

    await markLogDeletedOnSb(row.id, null);
    markedDeleted++;
  }

  return { checked: stale.length, markedDeleted };
}
