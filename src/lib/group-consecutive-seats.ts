/**
 * Seat listings that share block + row and have strictly numeric seat labels can be
 * merged into one UI row when seat numbers form a consecutive integer run (e.g. 14,15,16).
 *
 * Grouping runs **after** filter and per-category sort in the panel: we cluster by
 * block+row on the current sorted slice, merge consecutive seat runs within each cluster,
 * then re-sort the resulting display rows so ordering still matches the active sort key
 * (price uses min price per merged row). Row counts reflect merged rows, not raw listings.
 */

export type ConsecutiveSeatListing = {
  id: number;
  categoryBlockId: string;
  rowLabel: string;
  seatNumber: string;
  amount: string;
};

function normBlockId(s: string): string {
  return String(s).trim();
}

/** Only integers in the string form (no decimals, no trailing letters). */
export function parseSeatIntStrict(seatNumber: string): number | null {
  const s = String(seatNumber).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function clusterKey(listing: ConsecutiveSeatListing): string {
  return `${normBlockId(listing.categoryBlockId)}\0${String(listing.rowLabel).trim()}`;
}

/**
 * Partitions `rows` into display groups: each group is one table row (length 1 = unchanged).
 * Rows that are not strictly integer seat labels are never merged.
 */
export function groupConsecutiveSeatListings<T extends ConsecutiveSeatListing>(rows: T[]): T[][] {
  if (rows.length === 0) return [];

  const byCluster = new Map<string, T[]>();
  for (const row of rows) {
    const k = clusterKey(row);
    let arr = byCluster.get(k);
    if (!arr) {
      arr = [];
      byCluster.set(k, arr);
    }
    arr.push(row);
  }

  const out: T[][] = [];
  const keys = Array.from(byCluster.keys()).sort((a, b) => a.localeCompare(b));

  for (const k of keys) {
    const cluster = byCluster.get(k)!;
    const numeric: T[] = [];
    const nonNumeric: T[] = [];
    for (const r of cluster) {
      if (parseSeatIntStrict(r.seatNumber) !== null) numeric.push(r);
      else nonNumeric.push(r);
    }

    numeric.sort((a, b) => {
      const na = parseSeatIntStrict(a.seatNumber)!;
      const nb = parseSeatIntStrict(b.seatNumber)!;
      if (na !== nb) return na - nb;
      return a.id - b.id;
    });

    nonNumeric.sort((a, b) =>
      a.seatNumber.localeCompare(b.seatNumber, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    let i = 0;
    while (i < numeric.length) {
      const run: T[] = [numeric[i]];
      let j = i + 1;
      while (j < numeric.length) {
        const prev = parseSeatIntStrict(run[run.length - 1].seatNumber)!;
        const cur = parseSeatIntStrict(numeric[j].seatNumber)!;
        if (cur === prev + 1) {
          run.push(numeric[j]);
          j += 1;
        } else {
          break;
        }
      }
      out.push(run);
      i = j;
    }

    for (const r of nonNumeric) {
      out.push([r]);
    }
  }

  return out;
}
