import { findSbListingPushLogsForStatus } from "@/lib/sb-listing-push-log-query";
import {
  dedupeKeysFromPushLog,
  seatSetKeyFromPushSummary,
  sourceSeatIdsFromPushSummary,
  sourceSeatNumbersFromPushSummary,
} from "@/lib/sb-listing-fingerprint";
import { inventoryRowLookupKey, seatSpanFromNumbers } from "@/lib/sb-ticket-id";

export type SbListingUiStatus = "pushed" | "removed" | "deleted" | "delete_failed";

export type SbListingStatusEntry = {
  logId: number;
  sbTicketId: string | null;
  status: SbListingUiStatus;
  listingFingerprint: string;
  seatKey: string | null;
  blockName: string | null;
  row: string | null;
  seatNumbers: string[];
  inventoryRemovedAt: string | null;
  sbDeletedAt: string | null;
  sbDeleteError: string | null;
  pushedAt: string;
};

export type SbListingStatusPayload = {
  bySeatKey: Record<string, SbListingStatusEntry>;
  active: SbListingStatusEntry[];
  removed: SbListingStatusEntry[];
};

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
  if (row.inventoryRemovedAt && row.sbDeleteError) return "delete_failed";
  if (row.inventoryRemovedAt) return "removed";
  return "pushed";
}

function entryFromLog(log: {
  id: number;
  sbTicketId: string | null;
  listingFingerprint: string;
  requestSummary: unknown;
  inventoryRemovedAt?: Date | null;
  sbDeletedAt?: Date | null;
  sbDeleteError?: string | null;
  createdAt: Date;
}): SbListingStatusEntry {
  const seatKey = seatSetKeyFromPushSummary(log.requestSummary);
  return {
    logId: log.id,
    sbTicketId: log.sbTicketId,
    status: deriveUiStatus(log),
    listingFingerprint: log.listingFingerprint,
    seatKey,
    blockName: summaryField(log.requestSummary, "blockName"),
    row: summaryField(log.requestSummary, "row"),
    seatNumbers: summarySeatNumbers(log.requestSummary),
    inventoryRemovedAt: log.inventoryRemovedAt != null ? log.inventoryRemovedAt.toISOString() : null,
    sbDeletedAt: log.sbDeletedAt != null ? log.sbDeletedAt.toISOString() : null,
    sbDeleteError: log.sbDeleteError ?? null,
    pushedAt: log.createdAt.toISOString(),
  };
}

/** Latest push log per dedupe key (for row-level UI lookup). */
export async function loadSbListingStatusForEvent(eventId: number): Promise<SbListingStatusPayload> {
  const logs = await findSbListingPushLogsForStatus(eventId);

  const bySeatKey: Record<string, SbListingStatusEntry> = {};
  const active: SbListingStatusEntry[] = [];
  const removed: SbListingStatusEntry[] = [];
  const seenKeys = new Set<string>();

  for (const log of logs) {
    const entry = entryFromLog(log);
    const dedupeKeys = dedupeKeysFromPushLog(log.listingFingerprint, log.requestSummary);
    const primaryKey = entry.seatKey ?? dedupeKeys[0] ?? log.listingFingerprint;
    if (seenKeys.has(primaryKey)) continue;
    seenKeys.add(primaryKey);

    const keysToIndex = new Set<string>();
    if (entry.seatKey) keysToIndex.add(entry.seatKey);
    const sourceIds = sourceSeatIdsFromPushSummary(log.requestSummary);
    if (sourceIds.length > 0) {
      keysToIndex.add(sourceIds.join(","));
      for (const id of sourceIds) keysToIndex.add(id);
    }
    const invKey = inventoryRowLookupKey(
      entry.blockName,
      entry.row,
      seatSpanFromNumbers(entry.seatNumbers),
    );
    if (invKey) keysToIndex.add(invKey);
    const sourceNums = sourceSeatNumbersFromPushSummary(log.requestSummary);
    if (sourceNums.length > 0) {
      const srcInv = inventoryRowLookupKey(
        entry.blockName,
        entry.row,
        seatSpanFromNumbers(sourceNums),
      );
      if (srcInv) keysToIndex.add(srcInv);
    }
    for (const k of keysToIndex) bySeatKey[k] = entry;

    if (entry.status === "pushed") active.push(entry);
    else removed.push(entry);
  }

  return { bySeatKey, active, removed };
}
