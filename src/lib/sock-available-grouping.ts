/**
 * Server-safe grouping for SockAvailable rows: consecutive seats in the same
 * row / block / category / area / price merge into a "together" run.
 * Mirrors the client `groupSockAvailableRows` in sock-available-panel.tsx.
 */

export type SockAvailableRowLike = {
  id: number;
  amount: string | null;
  areaName: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatNumber: string;
  seatId: string;
  resaleMovementId: string | null;
  categoryId: string;
  areaId: string;
  blockId: string;
  contingentId: string;
  kind: "RESALE" | "LAST_MINUTE";
};

export type SockAvailableSeatGroup = {
  kind: SockAvailableRowLike["kind"];
  amount: string | null;
  areaName: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatSpan: string;
  togetherCount: number;
  seats: SockAvailableRowLike[];
};

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function parseStrictInt(s: string): number | null {
  const v = norm(s);
  if (!/^\d+$/.test(v)) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function groupFromSingleRow(r: SockAvailableRowLike): SockAvailableSeatGroup {
  return {
    kind: r.kind,
    amount: r.amount,
    areaName: r.areaName,
    categoryName: r.categoryName,
    blockName: r.blockName,
    row: r.row,
    seatSpan: r.seatNumber,
    togetherCount: 1,
    seats: [r],
  };
}

export function groupSockAvailableRows(rows: SockAvailableRowLike[]): SockAvailableSeatGroup[] {
  const byKey = new Map<string, SockAvailableRowLike[]>();
  for (const r of rows) {
    const key = [
      r.kind,
      norm(r.areaName),
      norm(r.categoryName),
      norm(r.blockName),
      norm(r.row),
      r.amount ?? "",
    ].join("|");
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  const out: SockAvailableSeatGroup[] = [];

  const pushGroup = (seats: SockAvailableRowLike[]) => {
    if (seats.length === 0) return;
    const first = seats[0]!;
    const last = seats[seats.length - 1]!;
    const togetherCount = seats.length;
    const seatSpan = togetherCount === 1 ? first.seatNumber : `${first.seatNumber}-${last.seatNumber}`;

    out.push({
      kind: first.kind,
      amount: first.amount,
      areaName: first.areaName,
      categoryName: first.categoryName,
      blockName: first.blockName,
      row: first.row,
      seatSpan,
      togetherCount,
      seats,
    });
  };

  for (const bucket of byKey.values()) {
    const numeric: Array<{ seatN: number; r: SockAvailableRowLike }> = [];
    const nonNumeric: SockAvailableRowLike[] = [];

    for (const r of bucket) {
      const seatN = parseStrictInt(r.seatNumber);
      if (seatN == null) nonNumeric.push(r);
      else numeric.push({ seatN, r });
    }

    for (const r of nonNumeric) pushGroup([r]);

    numeric.sort(
      (a, b) => a.seatN - b.seatN || norm(a.r.seatNumber).localeCompare(norm(b.r.seatNumber)) || a.r.id - b.r.id,
    );

    let runStart = 0;
    for (let i = 0; i < numeric.length; i++) {
      const prev = i > 0 ? numeric[i - 1] : null;
      const cur = numeric[i]!;
      const isBreak = i > 0 && cur.seatN !== prev!.seatN + 1;
      if (isBreak) {
        pushGroup(numeric.slice(runStart, i).map((x) => x.r));
        runStart = i;
      }
    }
    if (numeric.length > 0) {
      pushGroup(numeric.slice(runStart).map((x) => x.r));
    }
  }

  return out;
}

export function listingKeyForSockRow(r: Pick<SockAvailableRowLike, "resaleMovementId" | "seatId">): string {
  return r.resaleMovementId ? `m:${r.resaleMovementId}` : `s:${r.seatId}`;
}
