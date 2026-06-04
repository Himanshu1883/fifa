import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

/** FIFA category labels that must not be pushed to SeatsBrokers. */
const RESTRICTED_CATEGORY_RE = /\brestricted\b/i;

export function isRestrictedCategoryName(categoryName: string): boolean {
  return RESTRICTED_CATEGORY_RE.test(String(categoryName ?? "").trim());
}

export function offerContainsRestrictedSeat(offer: TransformedSeatOffer): boolean {
  return offer.seats.some((s) => isRestrictedCategoryName(s.categoryName));
}

export const SB_RESTRICTED_TICKET_ERROR =
  "Restricted tickets cannot be pushed to SeatsBrokers. Only standard Category 1–4 resale inventory is allowed.";
