import { seatSetKeyFromOffer, listingFingerprintForOffer } from "@/lib/sb-listing-fingerprint";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

export type SeatIdsLike = { seatId: string };

export type SbOfferMatchKind = "exact" | "bundled" | "quantity_reduced";

export type ResolvedSbOffer = {
  offerIndex: number;
  matchKind: SbOfferMatchKind;
  clickedSeatIds: string[];
};

function offerSeatIds(offer: TransformedSeatOffer): string[] {
  return offer.seats.map((s) => s.seatId.trim()).filter(Boolean);
}

/**
 * Match a UI row to the SB offer that will be pushed.
 *
 * - exact: same seat ids as the offer (no quantity reduction on this row)
 * - bundled: clicked seats are part of a larger offer (same block+price, multiple rows/groups merged)
 * - quantity_reduced: offer has fewer seats than clicked (e.g. 4 together → SB qty 1 sends 1 seat id)
 */
export function resolveOfferForSeatIds(
  seatIds: string[],
  offers: TransformedSeatOffer[],
): ResolvedSbOffer | null {
  const normalized = seatIds.map((s) => s.trim()).filter(Boolean);
  if (normalized.length === 0) return null;

  const clickedSet = new Set(normalized);
  const targetKey = [...normalized].sort().join(",");

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i]!;
    if (seatSetKeyFromOffer(offer) === targetKey) {
      return { offerIndex: i, matchKind: "exact", clickedSeatIds: normalized };
    }
  }

  let bestBundled: { offerIndex: number; seatCount: number } | null = null;
  for (let i = 0; i < offers.length; i++) {
    const ids = offerSeatIds(offers[i]!);
    const offerSet = new Set(ids);
    if (!normalized.every((id) => offerSet.has(id))) continue;
    if (!bestBundled || ids.length < bestBundled.seatCount) {
      bestBundled = { offerIndex: i, seatCount: ids.length };
    }
  }
  if (bestBundled) {
    return {
      offerIndex: bestBundled.offerIndex,
      matchKind: "bundled",
      clickedSeatIds: normalized,
    };
  }

  let bestReduced: { offerIndex: number; score: number } | null = null;
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i]!;
    const ids = offerSeatIds(offer);
    if (ids.length === 0) continue;
    if (!ids.every((id) => clickedSet.has(id))) continue;

    const score =
      offer.originalCount === normalized.length
        ? 0
        : 1 + Math.abs(offer.originalCount - normalized.length);

    if (!bestReduced || score < bestReduced.score) {
      bestReduced = { offerIndex: i, score };
    }
  }

  if (bestReduced) {
    return {
      offerIndex: bestReduced.offerIndex,
      matchKind: "quantity_reduced",
      clickedSeatIds: normalized,
    };
  }

  return null;
}

/** @deprecated Use matchKind on ResolvedSbOffer */
export function isExactOfferMatch(resolved: ResolvedSbOffer): boolean {
  return resolved.matchKind === "exact";
}

export function findOfferIndexForSeatIds(
  seatIds: string[],
  offers: TransformedSeatOffer[],
): number | null {
  return resolveOfferForSeatIds(seatIds, offers)?.offerIndex ?? null;
}

export function findOfferIndexForSeats(
  seats: SeatIdsLike[],
  offers: TransformedSeatOffer[],
): number | null {
  return findOfferIndexForSeatIds(
    seats.map((s) => s.seatId),
    offers,
  );
}

export function listingFingerprintForOfferIndex(
  offers: TransformedSeatOffer[],
  offerIndex: number,
): string | null {
  const offer = offers[offerIndex];
  if (!offer) return null;
  return listingFingerprintForOffer(offer);
}
