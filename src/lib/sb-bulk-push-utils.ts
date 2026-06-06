import { seatKeyFromSeatIds } from "@/lib/sb-listing-row-index";
import type { SbListingStatusEntry } from "@/lib/sb-listing-status";
import { extractSbTicketId } from "@/lib/sb-ticket-id";

export type SbBulkPushItem = {
  key: string;
  seatIds: string[];
  blockName: string;
  rowLabel: string;
  seatSpan: string;
  label: string;
  categoryName: string;
  categoryId: string;
};

export type SbBulkDeleteItem = {
  key: string;
  sbTicketId: string;
  logId?: number;
  seatIds: string[];
  blockName: string;
  rowLabel: string;
  seatSpan: string;
  label: string;
};

export function isSbRowPushable(entry: Pick<SbListingStatusEntry, "status"> | null | undefined): boolean {
  return !entry || entry.status !== "pushed";
}

export function isSbRowDeletable(
  entry: Pick<SbListingStatusEntry, "status" | "sbTicketId"> | null | undefined,
): boolean {
  if (!entry?.sbTicketId?.trim()) return false;
  return entry.status === "pushed" || entry.status === "delete_failed";
}

export function seatNumbersFromSpan(seatSpan: string): string[] {
  if (!seatSpan.trim()) return [];
  return seatSpan
    .split(/[,\s–-]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function sbListingEntryFromPushResponse(
  item: SbBulkPushItem,
  json: {
    sbTicketId?: string | null;
    existingSbTicketId?: string | null;
    logId?: number;
    listingFingerprint?: string;
    summary?: { blockName?: string; row?: string; seatNumbers?: string[] };
    response?: unknown;
  },
  existingEntry: SbListingStatusEntry | null,
): SbListingStatusEntry {
  const seatKey = seatKeyFromSeatIds(item.seatIds);
  const sbTicketId =
    json.sbTicketId ?? json.existingSbTicketId ?? extractSbTicketId(json.response) ?? null;
  const seatNumbers =
    json.summary?.seatNumbers?.length
      ? json.summary.seatNumbers
      : seatNumbersFromSpan(item.seatSpan);

  return {
    logId: json.logId ?? existingEntry?.logId ?? 0,
    sbTicketId,
    status: "pushed",
    listingFingerprint: json.listingFingerprint ?? existingEntry?.listingFingerprint ?? "",
    seatKey,
    blockName: json.summary?.blockName ?? item.blockName ?? existingEntry?.blockName ?? null,
    row: json.summary?.row ?? item.rowLabel ?? existingEntry?.row ?? null,
    seatNumbers: seatNumbers.length ? seatNumbers : (existingEntry?.seatNumbers ?? []),
    sourceSeatIds: item.seatIds,
    inventoryRemovedAt: null,
    sbDeletedAt: null,
    sbDeleteError: null,
    pushedAt: new Date().toISOString(),
  };
}
