import { sortNewListingsByPriceAsc, type SockAvailableNewListingKey } from "@/lib/sock-available-diff";
import type {
  SeatsidekickMatchResponse,
  SeatsidekickPollSnapshot,
  SeatsidekickSnapshotSeat,
} from "@/lib/seatsidekick-types";

export function seatsidekickPerformanceId(raw: number | string | undefined): string {
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

export function seatsidekickMatchLabel(matchNum: number | null): string {
  if (matchNum == null || !Number.isInteger(matchNum) || matchNum < 1) return "Match";
  return `Match${matchNum}`;
}

export function seatsidekickMatchName(meta: SeatsidekickMatchResponse["match"]): string {
  const matchup = meta?.matchup?.trim();
  if (matchup) return matchup;
  const home = meta?.home_team?.trim();
  const away = meta?.away_team?.trim();
  if (home && away) return `${home} vs ${away}`;
  return "—";
}

export function flattenSeatsidekickToSnapshot(data: SeatsidekickMatchResponse): SeatsidekickPollSnapshot {
  const performanceId = seatsidekickPerformanceId(data.performanceId ?? data.match?.performance_id);
  const matchNum =
    typeof data.match?.match_number === "number" && Number.isInteger(data.match.match_number)
      ? data.match.match_number
      : null;

  const seats: Record<string, SeatsidekickSnapshotSeat> = {};
  for (const block of data.blocks ?? []) {
    const blockName = String(block.block ?? block.blockId ?? "").trim() || "—";
    for (const seat of block.seats ?? []) {
      const seatId = String(seat.seatId ?? "").trim();
      if (!seatId) continue;
      const youPay = typeof seat.youPay === "number" && Number.isFinite(seat.youPay) ? seat.youPay : 0;
      seats[seatId] = {
        blockName,
        row: String(seat.row ?? "").trim() || "—",
        seatNumber: String(seat.seatNumber ?? "").trim() || "—",
        categoryName: String(seat.category ?? block.cat ?? "").trim() || "—",
        youPay,
      };
    }
  }

  return {
    performanceId,
    matchNum,
    seats,
    updatedAt: new Date().toISOString(),
  };
}

export function snapshotSeatToListingKey(
  seatId: string,
  seat: SeatsidekickSnapshotSeat,
): SockAvailableNewListingKey {
  return {
    key: `s:${seatId}`,
    seatId,
    resaleMovementId: null,
    categoryId: seat.categoryName,
    categoryName: seat.categoryName,
    blockName: seat.blockName,
    row: seat.row,
    seatNumber: seat.seatNumber,
    amountRaw: Math.round(seat.youPay * 1000),
  };
}

/** Seats in `current` that were not in `previous` snapshot. */
export function diffNewSeatsidekickListings(
  current: SeatsidekickPollSnapshot,
  previous: SeatsidekickPollSnapshot | null,
): SockAvailableNewListingKey[] {
  const prevIds = new Set(Object.keys(previous?.seats ?? {}));
  const out: SockAvailableNewListingKey[] = [];
  for (const [seatId, seat] of Object.entries(current.seats)) {
    if (prevIds.has(seatId)) continue;
    out.push(snapshotSeatToListingKey(seatId, seat));
  }
  return out;
}

/** N cheapest seats from a live snapshot, sorted ascending by price. */
export function pickLowestSeatsidekickListings(
  snapshot: SeatsidekickPollSnapshot,
  topN: number,
): SockAvailableNewListingKey[] {
  const n = Math.max(1, Math.min(45, Math.floor(topN) || 20));
  const listings = Object.entries(snapshot.seats).map(([seatId, seat]) =>
    snapshotSeatToListingKey(seatId, seat),
  );
  return sortNewListingsByPriceAsc(listings).slice(0, n);
}

/** Stable dedup key for a posted listing set (seat + price). */
export function seatsidekickListingsFingerprint(listings: SockAvailableNewListingKey[]): string {
  return sortNewListingsByPriceAsc(listings)
    .map((l) => `${l.seatId}:${l.amountRaw}`)
    .join("|");
}
