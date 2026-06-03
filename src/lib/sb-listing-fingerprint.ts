import type { MappedSeatsBrokersTicket } from "@/lib/seatsbrokers-offer-map";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

/** Sorted FIFA seat ids (preferred) or seat numbers for cross-checking stored push logs. */
export function seatSetKeyFromOffer(offer: TransformedSeatOffer): string | null {
  const seatIds = offer.seats
    .map((s) => s.seatId.trim())
    .filter(Boolean)
    .sort();
  if (seatIds.length > 0) return seatIds.join(",");

  const seatNumbers = offer.seats
    .map((s) => s.seatNumber.trim())
    .filter(Boolean)
    .sort();
  if (seatNumbers.length > 0) return seatNumbers.join(",");

  return null;
}

/** Stable key: same physical seats must never be pushed twice (price/block mapping may change). */
export function listingFingerprintForOffer(offer: TransformedSeatOffer): string {
  const seats = seatSetKeyFromOffer(offer);
  if (!seats) return `empty|${offer.kind}|${offer.offerType}`;

  return `${offer.kind}|${offer.offerType}|${seats}`;
}

export function listingFingerprintForMappedTicket(
  offer: TransformedSeatOffer | undefined,
  ticket: MappedSeatsBrokersTicket,
): string {
  if (offer) return listingFingerprintForOffer(offer);
  const ids = ticket.summary.seatIds?.filter(Boolean).sort().join(",");
  if (ids) return `unknown|${ticket.summary.offerType}|${ids}`;
  const seats = [...ticket.summary.seatNumbers]
    .map((n) => n.trim())
    .filter(Boolean)
    .sort()
    .join(",");
  if (!seats) return `unknown|${ticket.summary.offerType}|empty`;
  return `unknown|${ticket.summary.offerType}|${seats}`;
}

/** Keys used to detect an already-created SB listing for this event. */
export function listingDedupeKeysForOffer(offer: TransformedSeatOffer): string[] {
  return [listingFingerprintForOffer(offer)];
}

export function listingDedupeKeysForMappedTicket(
  offer: TransformedSeatOffer | undefined,
  ticket: MappedSeatsBrokersTicket,
): string[] {
  if (offer) return listingDedupeKeysForOffer(offer);
  return [listingFingerprintForMappedTicket(offer, ticket)];
}

/** Seat numbers on the UI row when quantity was reduced (e.g. 9,10,11,12). */
export function sourceSeatNumbersFromPushSummary(summary: unknown): string[] {
  if (summary === null || typeof summary !== "object") return [];
  const s = summary as { sourceSeatNumbers?: unknown };
  if (!Array.isArray(s.sourceSeatNumbers)) return [];
  return s.sourceSeatNumbers.map((n) => String(n).trim()).filter(Boolean).sort();
}

/** UI row seat ids stored on push (e.g. 9–12 together when SB payload sends 1 seat). */
export function sourceSeatIdsFromPushSummary(summary: unknown): string[] {
  if (summary === null || typeof summary !== "object") return [];
  const s = summary as { sourceSeatIds?: unknown };
  if (!Array.isArray(s.sourceSeatIds)) return [];
  return s.sourceSeatIds.map((id) => String(id).trim()).filter(Boolean).sort();
}

/** Extract seat ids from a stored push log summary. */
export function seatIdsFromPushSummary(summary: unknown): string[] {
  if (summary === null || typeof summary !== "object") return [];
  const s = summary as { seatIds?: unknown };
  if (!Array.isArray(s.seatIds)) return [];
  return s.seatIds.map((id) => String(id).trim()).filter(Boolean).sort();
}

/** Extract seat-set key from a stored push log summary (fallback when seatIds missing). */
export function seatSetKeyFromPushSummary(summary: unknown): string | null {
  const ids = seatIdsFromPushSummary(summary);
  if (ids.length > 0) return ids.join(",");

  if (summary === null || typeof summary !== "object") return null;
  const s = summary as { seatNumbers?: unknown; row?: unknown; fifaBlockId?: unknown };
  if (!Array.isArray(s.seatNumbers)) return null;
  const nums = s.seatNumbers
    .map((n) => String(n).trim())
    .filter(Boolean)
    .sort();
  if (nums.length === 0) return null;
  const block = String(s.fifaBlockId ?? "").trim();
  const row = String(s.row ?? "").trim();
  return block || row ? `${block}|${row}|${nums.join(",")}` : nums.join(",");
}

/** Dedupe keys from a stored log row (new + legacy fingerprint formats). */
export function dedupeKeysFromPushLog(listingFingerprint: string, requestSummary: unknown): string[] {
  const keys = new Set<string>([listingFingerprint]);

  const seatIds = seatIdsFromPushSummary(requestSummary);
  if (seatIds.length > 0) {
    const joined = seatIds.join(",");
    keys.add(`RESALE|single|${joined}`);
    keys.add(`RESALE|together|${joined}`);
  }

  const seatPart = seatSetKeyFromPushSummary(requestSummary);
  if (seatPart && seatIds.length === 0) {
    keys.add(`RESALE|single|${seatPart}`);
    keys.add(`RESALE|together|${seatPart}`);
  }

  // Legacy fingerprint: …|seatId:seatNum|priceRaw
  const legacySeatMatch = listingFingerprint.match(/\|(\d{12,}):([^|,]+)/);
  if (legacySeatMatch) {
    const seatId = legacySeatMatch[1]!;
    keys.add(`RESALE|single|${seatId}`);
    keys.add(`RESALE|together|${seatId}`);
  }

  return [...keys];
}
