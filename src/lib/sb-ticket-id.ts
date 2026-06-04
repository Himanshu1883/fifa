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

/** All ticket ids returned by SeatsBrokers `ticket` list for a match. */
export function collectSbTicketIdsFromListResponse(data: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(o)) {
      if (
        (key === "ticket_id" || key === "ticketId") &&
        (typeof val === "string" || typeof val === "number")
      ) {
        const s = String(val).trim();
        if (s) out.add(s);
      } else {
        walk(val);
      }
    }
  };
  walk(data);
  return out;
}

export function sbTicketIdVariants(ticketId: string): string[] {
  const t = ticketId.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  if (/^\d+$/.test(t)) out.add(String(Number.parseInt(t, 10)));
  return [...out];
}

export function sbTicketIdsMatch(a: string, b: string): boolean {
  return sbTicketIdVariants(a).some((x) => sbTicketIdVariants(b).includes(x));
}

export function isSbTicketOnMatch(ticketId: string, idsOnMatch: Set<string>): boolean {
  for (const id of idsOnMatch) {
    if (sbTicketIdsMatch(ticketId, id)) return true;
  }
  return false;
}

/** SB delete failed but listing is already gone (manual delete or prior success). */
export function isSbDeleteAlreadyGoneError(error: string, httpStatus?: number): boolean {
  if (httpStatus === 404) return true;
  const e = error.toLowerCase();
  return /not\s*found|does\s*not\s*exist|already\s*deleted|invalid\s*ticket|no\s*such\s*ticket|ticket\s*not\s*found|not\s*exist/.test(
    e,
  );
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
