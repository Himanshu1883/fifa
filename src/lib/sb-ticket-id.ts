/** Parse SeatsBrokers ticket/create response for the listing id (ticket_id). */
export function extractSbTicketId(data: unknown): string | null {
  if (data === null || data === undefined) return null;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return null;
    try {
      return extractSbTicketId(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (typeof data !== "object") return null;

  const o = data as Record<string, unknown>;
  const direct =
    o.ticket_id ?? o.ticketId ?? o.listing_id ?? o.listingId ?? o.id;
  if (direct != null) {
    const s = String(direct).trim();
    if (s) return s;
  }

  if (o.data != null) {
    const nested = extractSbTicketId(o.data);
    if (nested) return nested;
  }
  if (o.result != null && o.result !== "") {
    const nested = extractSbTicketId(o.result);
    if (nested) return nested;
  }

  return null;
}

/** Stable lookup key for a resale table row (block + row + seat span). */
export function inventoryRowLookupKey(
  blockName: string | null | undefined,
  row: string | null | undefined,
  seatSpan: string | null | undefined,
): string | null {
  const block = blockName?.trim();
  const r = row?.trim();
  const span = normalizeSeatSpanForLookup(seatSpan ?? "");
  if (!block || !r || !span) return null;
  return `inv|${block}|${r}|${span}`;
}

export function normalizeSeatSpanForLookup(span: string): string {
  return span.trim().replace(/\s+/g, "").toLowerCase();
}

/** Build seat span string the same way as grouped resale rows (e.g. 9-12). */
export function seatSpanFromNumbers(seatNumbers: string[]): string {
  const nums = seatNumbers.map((n) => n.trim()).filter(Boolean);
  if (nums.length === 0) return "";
  if (nums.length === 1) return nums[0]!;
  return `${nums[0]}-${nums[nums.length - 1]}`;
}
