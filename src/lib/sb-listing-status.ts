import { findSbListingPushLogsForStatus } from "@/lib/sb-listing-push-log-query";
import {
  dedupeKeysFromPushLog,
  seatSetKeyFromPushSummary,
  sourceSeatIdsFromPushSummary,
  sourceSeatNumbersFromPushSummary,
} from "@/lib/sb-listing-fingerprint";
import { inventoryRowLookupKey, seatSpanFromNumbers } from "@/lib/sb-ticket-id";

function listingEntryPriority(entry: SbListingStatusEntry): number {
  switch (entry.status) {
    case "deleted":
      return 0;
    case "delete_failed":
      return 1;
    case "removed":
      return 2;
    case "pushed":
      return entry.sbTicketId ? 4 : 3;
    default:
      return 5;
  }
}

function preferListingEntry(
  a: SbListingStatusEntry | undefined,
  b: SbListingStatusEntry,
): SbListingStatusEntry {
  if (!a) return b;
  const pa = listingEntryPriority(a);
  const pb = listingEntryPriority(b);
  if (pa !== pb) return pa < pb ? a : b;
  return a.pushedAt >= b.pushedAt ? a : b;
}

function indexKeysForLog(entry: SbListingStatusEntry, requestSummary: unknown, listingFingerprint: string): string[] {
  const keys = new Set<string>(dedupeKeysFromPushLog(listingFingerprint, requestSummary));
  if (entry.seatKey) keys.add(entry.seatKey);
  const sourceIds = sourceSeatIdsFromPushSummary(requestSummary);
  if (sourceIds.length > 0) {
    keys.add(sourceIds.join(","));
    for (const id of sourceIds) keys.add(id);
  }
  const invKey = inventoryRowLookupKey(
    entry.blockName,
    entry.row,
    seatSpanFromNumbers(entry.seatNumbers),
  );
  if (invKey) keys.add(invKey);
  const sourceNums = sourceSeatNumbersFromPushSummary(requestSummary);
  if (sourceNums.length > 0) {
    const srcInv = inventoryRowLookupKey(
      entry.blockName,
      entry.row,
      seatSpanFromNumbers(sourceNums),
    );
    if (srcInv) keys.add(srcInv);
  }
  return [...keys];
}

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
  /** UI row seat ids when push used quantity reduction. */
  sourceSeatIds: string[];
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
  if (row.sbDeleteError) return "delete_failed";
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
    sourceSeatIds: sourceSeatIdsFromPushSummary(log.requestSummary),
    inventoryRemovedAt: log.inventoryRemovedAt != null ? log.inventoryRemovedAt.toISOString() : null,
    sbDeletedAt: log.sbDeletedAt != null ? log.sbDeletedAt.toISOString() : null,
    sbDeleteError: log.sbDeleteError ?? null,
    pushedAt: log.createdAt.toISOString(),
  };
}

/** Index all successful push logs so every resale row can resolve its SB listing id. */
export async function loadSbListingStatusForEvent(eventId: number): Promise<SbListingStatusPayload> {
  const logs = await findSbListingPushLogsForStatus(eventId);

  const bySeatKey: Record<string, SbListingStatusEntry> = {};

  for (const log of logs) {
    const entry = entryFromLog(log);
    for (const k of indexKeysForLog(entry, log.requestSummary, log.listingFingerprint)) {
      bySeatKey[k] = preferListingEntry(bySeatKey[k], entry) ?? entry;
    }
  }

  const seenLog = new Set<number>();
  const active: SbListingStatusEntry[] = [];
  const removed: SbListingStatusEntry[] = [];
  for (const entry of Object.values(bySeatKey)) {
    if (seenLog.has(entry.logId)) continue;
    seenLog.add(entry.logId);
    if (entry.status === "pushed") active.push(entry);
    else removed.push(entry);
  }

  return { bySeatKey, active, removed };
}
