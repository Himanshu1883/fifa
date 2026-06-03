import {
  sourceSeatIdsFromPushSummary,
  sourceSeatNumbersFromPushSummary,
} from "@/lib/sb-listing-fingerprint";
import type { SbListingStatusEntry } from "@/lib/sb-listing-status";
import { inventoryRowLookupKey, seatSpanFromNumbers } from "@/lib/sb-ticket-id";

export type SbRowLookupMeta = {
  seatIds: string[];
  blockName?: string | null;
  row?: string | null;
  seatSpan?: string | null;
};

function seatNumbersFromSpan(seatSpan: string | null | undefined): string[] {
  if (!seatSpan?.trim()) return [];
  return seatSpan
    .split(/[,\s–-]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function entrySeatIdSet(entry: SbListingStatusEntry): Set<string> {
  const ids = new Set<string>();
  for (const id of entry.sourceSeatIds ?? []) {
    const t = id.trim();
    if (t) ids.add(t);
  }
  if (entry.seatKey) {
    for (const id of entry.seatKey.split(",")) {
      const t = id.trim();
      if (t) ids.add(t);
    }
  }
  return ids;
}

/** True when this SB log belongs to the resale table row (active or removed/deleted). */
export function sbListingEntryMatchesRow(
  entry: SbListingStatusEntry,
  meta: SbRowLookupMeta,
): boolean {
  const rowIds = meta.seatIds.map((s) => s.trim()).filter(Boolean);
  if (rowIds.length === 0) return false;

  const entryIds = entrySeatIdSet(entry);
  if (rowIds.length > 0 && rowIds.every((id) => entryIds.has(id))) return true;
  if (rowIds.some((id) => entryIds.has(id))) return true;

  const block = meta.blockName?.trim();
  const row = meta.row?.trim();
  if (!block || !row) return false;
  if (entry.blockName?.trim() !== block || entry.row?.trim() !== row) return false;

  const rowNums = seatNumbersFromSpan(meta.seatSpan);
  if (rowNums.length === 0) return false;
  const entryNums = new Set(entry.seatNumbers.map((n) => n.trim()).filter(Boolean));
  return rowNums.some((n) => entryNums.has(n));
}

/**
 * Resolve SB listing for a resale row — key lookup first, then scan all active listings.
 */
export function findSbListingEntryForRow(
  bySeatKey: Record<string, SbListingStatusEntry>,
  meta: SbRowLookupMeta,
): SbListingStatusEntry | null {
  for (const k of lookupKeysForSbRow(meta)) {
    const hit = bySeatKey[k];
    if (hit?.sbTicketId) return hit;
  }

  let best: SbListingStatusEntry | null = null;
  const seenLog = new Set<number>();

  for (const entry of Object.values(bySeatKey)) {
    if (seenLog.has(entry.logId)) continue;
    if (!sbListingEntryMatchesRow(entry, meta)) continue;
    seenLog.add(entry.logId);
    if (entry.sbTicketId) return entry;
    if (!best || entry.pushedAt > best.pushedAt) best = entry;
  }

  return best;
}

export function seatKeyFromSeatIds(seatIds: string[]): string {
  return seatIds
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

/** All keys used to attach / find a row's SB listing status in `bySeatKey`. */
export function lookupKeysForSbRow(meta: SbRowLookupMeta): string[] {
  const keys = new Set<string>();
  const joined = seatKeyFromSeatIds(meta.seatIds);
  if (joined) keys.add(joined);
  for (const id of meta.seatIds) {
    const t = id.trim();
    if (t) keys.add(t);
  }
  const inv = inventoryRowLookupKey(meta.blockName, meta.row, meta.seatSpan);
  if (inv) keys.add(inv);
  return [...keys];
}

/** Keys from a stored entry (for re-indexing after server refresh). */
export function lookupKeysForSbEntry(entry: SbListingStatusEntry, meta?: SbRowLookupMeta): string[] {
  const keys = new Set<string>(lookupKeysForSbRow(meta ?? { seatIds: [] }));
  if (entry.seatKey) keys.add(entry.seatKey);
  if (meta) {
    for (const k of lookupKeysForSbRow(meta)) keys.add(k);
  }
  const invFromNums = inventoryRowLookupKey(
    entry.blockName,
    entry.row,
    seatSpanFromNumbers(entry.seatNumbers),
  );
  if (invFromNums) keys.add(invFromNums);
  return [...keys];
}

export function indexSbListingEntry(
  bySeatKey: Record<string, SbListingStatusEntry>,
  entry: SbListingStatusEntry,
  meta: SbRowLookupMeta,
): void {
  const keys = lookupKeysForSbRow(meta);
  if (entry.seatKey) keys.push(entry.seatKey);
  for (const k of keys) bySeatKey[k] = entry;
}

export function removeSbListingEntryFromIndex(
  bySeatKey: Record<string, SbListingStatusEntry>,
  meta: SbRowLookupMeta,
): void {
  for (const k of lookupKeysForSbRow(meta)) delete bySeatKey[k];
}

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

export function preferListingEntry(
  a: SbListingStatusEntry | undefined,
  b: SbListingStatusEntry | undefined,
): SbListingStatusEntry | undefined {
  if (!a) return b;
  if (!b) return a;

  const pa = listingEntryPriority(a);
  const pb = listingEntryPriority(b);
  if (pa !== pb) return pa < pb ? a : b;

  return a.pushedAt >= b.pushedAt ? a : b;
}

function shouldPinOverServer(
  pinned: SbListingStatusEntry,
  server: SbListingStatusEntry | undefined,
): boolean {
  if (pinned.status !== "pushed" || !pinned.sbTicketId) return false;
  if (!server) return true;
  if (server.status === "deleted" || server.status === "removed" || server.status === "delete_failed") {
    return false;
  }
  if (!server.sbTicketId) return true;
  return false;
}

/** Merge server + in-memory + session pins; never drop a known `sbTicketId` from pins/local by accident. */
export function mergeSbListingBySeatKey(
  ...maps: Array<Record<string, SbListingStatusEntry>>
): Record<string, SbListingStatusEntry> {
  const merged: Record<string, SbListingStatusEntry> = {};
  for (const map of maps) {
    for (const [k, v] of Object.entries(map)) {
      merged[k] = preferListingEntry(merged[k], v) ?? v;
    }
  }
  return merged;
}

export function applyPinnedOverrides(
  server: Record<string, SbListingStatusEntry>,
  pinned: Record<string, SbListingStatusEntry>,
): Record<string, SbListingStatusEntry> {
  const out = { ...server };
  for (const [k, pin] of Object.entries(pinned)) {
    if (shouldPinOverServer(pin, out[k])) out[k] = pin;
  }
  return out;
}

export function payloadFromBySeatKey(bySeatKey: Record<string, SbListingStatusEntry>): {
  bySeatKey: Record<string, SbListingStatusEntry>;
  active: SbListingStatusEntry[];
  removed: SbListingStatusEntry[];
} {
  const seen = new Set<number>();
  const active: SbListingStatusEntry[] = [];
  const removed: SbListingStatusEntry[] = [];
  for (const entry of Object.values(bySeatKey)) {
    if (seen.has(entry.logId)) continue;
    seen.add(entry.logId);
    if (entry.status === "pushed") active.push(entry);
    else removed.push(entry);
  }
  return { bySeatKey, active, removed };
}

const storageKey = (eventId: number) => `sb-listing-pins:v1:${eventId}`;

export function loadPinnedSbListings(eventId: number): Record<string, SbListingStatusEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey(eventId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SbListingStatusEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function pinSbListingEntries(
  eventId: number,
  entry: SbListingStatusEntry,
  meta: SbRowLookupMeta,
): void {
  if (typeof window === "undefined") return;
  if (entry.status !== "pushed" || !entry.sbTicketId) return;

  const store = loadPinnedSbListings(eventId);
  for (const k of lookupKeysForSbRow(meta)) store[k] = entry;
  if (entry.seatKey) store[entry.seatKey] = entry;

  try {
    sessionStorage.setItem(storageKey(eventId), JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

/** Drop session pins after a listing is deleted so polling does not restore "On SB". */
export function unpinSbListingEntries(
  eventId: number,
  entry: SbListingStatusEntry,
  meta: SbRowLookupMeta,
): void {
  if (typeof window === "undefined") return;

  const store = loadPinnedSbListings(eventId);
  const keys = new Set<string>([
    ...lookupKeysForSbRow(meta),
    ...lookupKeysForSbEntry(entry, meta),
  ]);
  if (entry.seatKey) keys.add(entry.seatKey);

  let changed = false;
  for (const k of keys) {
    if (k in store) {
      delete store[k];
      changed = true;
    }
  }

  if (!changed) return;

  try {
    sessionStorage.setItem(storageKey(eventId), JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

/** Re-apply pins from summary fields when indexing server rows. */
export function lookupKeysFromEntrySummary(
  entry: SbListingStatusEntry,
  requestSummary: unknown,
): string[] {
  const keys = new Set<string>();
  if (entry.seatKey) keys.add(entry.seatKey);
  const sourceIds = sourceSeatIdsFromPushSummary(requestSummary);
  if (sourceIds.length > 0) {
    keys.add(sourceIds.join(","));
    for (const id of sourceIds) keys.add(id);
  }
  const inv = inventoryRowLookupKey(
    entry.blockName,
    entry.row,
    seatSpanFromNumbers(entry.seatNumbers),
  );
  if (inv) keys.add(inv);
  const sourceNums = sourceSeatNumbersFromPushSummary(requestSummary);
  if (sourceNums.length > 0) {
    const srcInv = inventoryRowLookupKey(entry.blockName, entry.row, seatSpanFromNumbers(sourceNums));
    if (srcInv) keys.add(srcInv);
  }
  return [...keys];
}
