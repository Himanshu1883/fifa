import { priceToNumber, sockAmountToUsd } from "@/lib/format-usd";
import { applyMarkupPercentToCents } from "@/lib/markup";
import {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  mapQuantityWithRules,
  runtimeFromConfig,
  type SbPushRulesRuntime,
} from "@/lib/sb-push-rules-settings-types";
import {
  groupSockAvailableRows,
  listingKeyForSockRow,
  type SockAvailableRowLike,
  type SockAvailableSeatGroup,
} from "@/lib/sock-available-grouping";

const DEFAULT_PUSH_RUNTIME = runtimeFromConfig({
  togetherRules: DEFAULT_SB_PUSH_TOGETHER_RULES,
  singleRules: DEFAULT_SB_PUSH_SINGLE_RULES,
  autoDeleteOnScrapeRemoval: true,
  updatedAt: null,
});

/** Single seat vs consecutive-seat block (domain: togetherCount >= 2). */
export type SeatOfferType = "single" | "together";

export type TransformedSeatRef = {
  key: string;
  seatId: string;
  resaleMovementId: string | null;
  row: string;
  seatNumber: string;
  categoryId: string;
  categoryName: string;
  blockId: string;
  blockName: string;
  areaId: string;
  areaName: string;
  contingentId: string;
};

export type TransformedSeatOffer = {
  kind: SockAvailableRowLike["kind"];
  offerType: SeatOfferType;
  priceRaw: string | null;
  /** Display USD using SockAvailable convention (amount / 1000). */
  priceUsd: number | null;
  originalCount: number;
  transformedCount: number;
  /** How many contiguous / single groups contributed seats at this price. */
  sourceGroupCount: number;
  /** All FIFA seat ids in this price bucket (before quantity pick) — for UI row ↔ SB listing lookup. */
  allSeatIds: string[];
  /** Seat numbers in this bucket (for block/row/seat-span lookup). */
  allSeatNumbers: string[];
  seats: TransformedSeatRef[];
};

export type PriceBucketTransformation = {
  kind: SockAvailableRowLike["kind"];
  offerType: SeatOfferType;
  priceRaw: string | null;
  priceUsd: number | null;
  originalCount: number;
  /** Mapped quantity before seat selection (TOGETHER/SINGLE map). */
  mappedCount: number;
  sourceGroupCount: number;
  seatsFound: number;
  seatsSent: number;
  wasTransformed: boolean;
  seatReduction: number;
  skipped: boolean;
  skipReason?: "zero_transform" | "no_seats";
};

export type SeatOffersSummaryByOfferType = {
  bucketsFound: number;
  originalSeatCountTotal: number;
  mappedSeatCountTotal: number;
  seatsSentTotal: number;
  offersReturned: number;
  offersCountChanged: number;
  offersCountUnchanged: number;
  bucketsSkipped: number;
};

export type SeatOffersSummary = {
  totals: {
    sourceRows: number;
    groups: number;
    bucketsProcessed: number;
    offersReturned: number;
    skippedBuckets: number;
  };
  byOfferType: Record<SeatOfferType, SeatOffersSummaryByOfferType>;
  transformations: PriceBucketTransformation[];
  grandTotals: {
    seatsFound: number;
    seatsMapped: number;
    seatsSent: number;
    seatReduction: number;
  };
};

export type TransformSeatOffersResult = {
  offers: TransformedSeatOffer[];
  skippedEmptyBuckets: number;
  summary: SeatOffersSummary;
};

type PriceBucket = {
  kind: SockAvailableRowLike["kind"];
  offerType: SeatOfferType;
  priceRaw: string | null;
  groups: SockAvailableSeatGroup[];
  originalCount: number;
};

/**
 * Quantity transform for aggregated seat offers at one price + type.
 * Rules come from Push rules settings (or defaults when runtime omitted).
 */
export function mapAggregatedSeatOfferQuantity(
  inputCount: number,
  offerType: SeatOfferType,
  runtime: SbPushRulesRuntime = DEFAULT_PUSH_RUNTIME,
): number {
  return mapQuantityWithRules(inputCount, offerType, runtime);
}

function amountToUsd(amount: string | null): number | null {
  return sockAmountToUsd(amount);
}

function offerTypeForGroup(g: SockAvailableSeatGroup): SeatOfferType {
  return g.togetherCount >= 2 ? "together" : "single";
}

function bucketKey(
  kind: string,
  blockId: string,
  priceRaw: string | null,
  offerType: SeatOfferType,
): string {
  return `${kind}|${blockId}|${priceRaw ?? ""}|${offerType}`;
}

function blockIdForGroup(g: SockAvailableSeatGroup): string {
  return g.seats[0]?.blockId ?? g.blockName;
}

function seatToRef(r: SockAvailableRowLike): TransformedSeatRef {
  return {
    key: listingKeyForSockRow(r),
    seatId: r.seatId,
    resaleMovementId: r.resaleMovementId,
    row: r.row,
    seatNumber: r.seatNumber,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    blockId: r.blockId,
    blockName: r.blockName,
    areaId: r.areaId,
    areaName: r.areaName,
    contingentId: r.contingentId,
  };
}

/** Prefer largest contiguous blocks first when trimming a together bucket. */
function sortGroupsForSelection(a: SockAvailableSeatGroup, b: SockAvailableSeatGroup): number {
  const typeA = offerTypeForGroup(a);
  const typeB = offerTypeForGroup(b);
  if (typeA === "together" && typeB === "together") {
    return b.togetherCount - a.togetherCount;
  }
  return 0;
}

function pickSeatsFromGroups(groups: SockAvailableSeatGroup[], limit: number): TransformedSeatRef[] {
  if (limit <= 0) return [];

  const ordered = [...groups].sort(sortGroupsForSelection);
  const picked: TransformedSeatRef[] = [];

  for (const g of ordered) {
    for (const seat of g.seats) {
      picked.push(seatToRef(seat));
      if (picked.length >= limit) return picked;
    }
  }

  return picked;
}

function aggregateGroups(groups: SockAvailableSeatGroup[]): PriceBucket[] {
  const map = new Map<string, PriceBucket>();

  for (const g of groups) {
    const offerType = offerTypeForGroup(g);
    const key = bucketKey(g.kind, blockIdForGroup(g), g.amount, offerType);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        kind: g.kind,
        offerType,
        priceRaw: g.amount,
        groups: [],
        originalCount: 0,
      };
      map.set(key, bucket);
    }
    bucket.groups.push(g);
    bucket.originalCount += g.togetherCount;
  }

  return [...map.values()];
}

function emptyByOfferTypeSummary(): SeatOffersSummaryByOfferType {
  return {
    bucketsFound: 0,
    originalSeatCountTotal: 0,
    mappedSeatCountTotal: 0,
    seatsSentTotal: 0,
    offersReturned: 0,
    offersCountChanged: 0,
    offersCountUnchanged: 0,
    bucketsSkipped: 0,
  };
}

function buildSeatOffersSummary(
  sourceRows: number,
  groups: number,
  transformations: PriceBucketTransformation[],
  offersReturned: number,
  skippedBuckets: number,
): SeatOffersSummary {
  const byOfferType: Record<SeatOfferType, SeatOffersSummaryByOfferType> = {
    single: emptyByOfferTypeSummary(),
    together: emptyByOfferTypeSummary(),
  };

  let seatsFound = 0;
  let seatsMapped = 0;
  let seatsSent = 0;

  for (const t of transformations) {
    const slice = byOfferType[t.offerType];
    slice.bucketsFound++;
    slice.originalSeatCountTotal += t.seatsFound;
    slice.mappedSeatCountTotal += t.mappedCount;
    slice.seatsSentTotal += t.seatsSent;
    if (t.skipped) slice.bucketsSkipped++;
    else {
      slice.offersReturned++;
      if (t.wasTransformed) slice.offersCountChanged++;
      else slice.offersCountUnchanged++;
    }

    seatsFound += t.seatsFound;
    seatsMapped += t.mappedCount;
    seatsSent += t.seatsSent;
  }

  return {
    totals: {
      sourceRows,
      groups,
      bucketsProcessed: transformations.length,
      offersReturned,
      skippedBuckets,
    },
    byOfferType,
    transformations,
    grandTotals: {
      seatsFound,
      seatsMapped,
      seatsSent,
      seatReduction: seatsFound - seatsSent,
    },
  };
}

function applyMarkupToUsd(priceUsd: number | null, markupPercent: number): number | null {
  if (priceUsd == null) return null;
  return applyMarkupPercentToCents(priceUsd, markupPercent);
}

function applyMarkupToAmountRaw(priceRaw: string | null, markupPercent: number): string | null {
  if (!priceRaw) return priceRaw;
  const n = priceToNumber(priceRaw);
  if (!Number.isFinite(n)) return priceRaw;
  return String(applyMarkupPercentToCents(n, markupPercent));
}

/** Apply markup percent to offer and summary prices (priceUsd and priceRaw). */
export function applyMarkupPercentToTransformResult(
  result: TransformSeatOffersResult,
  markupPercent: number,
): TransformSeatOffersResult {
  if (!Number.isFinite(markupPercent) || markupPercent === 0) return result;

  const offers = result.offers.map((o) => ({
    ...o,
    priceUsd: applyMarkupToUsd(o.priceUsd, markupPercent),
    priceRaw: applyMarkupToAmountRaw(o.priceRaw, markupPercent),
  }));

  const transformations = result.summary.transformations.map((t) => ({
    ...t,
    priceUsd: applyMarkupToUsd(t.priceUsd, markupPercent),
    priceRaw: applyMarkupToAmountRaw(t.priceRaw, markupPercent),
  }));

  return {
    offers,
    skippedEmptyBuckets: result.skippedEmptyBuckets,
    summary: {
      ...result.summary,
      transformations,
    },
  };
}

export function transformSeatOffersFromSockRows(
  rows: SockAvailableRowLike[],
  runtime: SbPushRulesRuntime = DEFAULT_PUSH_RUNTIME,
): TransformSeatOffersResult {
  const grouped = groupSockAvailableRows(rows);
  const buckets = aggregateGroups(grouped);
  const offers: TransformedSeatOffer[] = [];
  const transformations: PriceBucketTransformation[] = [];
  let skippedEmptyBuckets = 0;

  for (const bucket of buckets) {
    const mappedCount = mapAggregatedSeatOfferQuantity(bucket.originalCount, bucket.offerType, runtime);
    const priceUsd = amountToUsd(bucket.priceRaw);
    const wasTransformed = bucket.originalCount !== mappedCount;

    if (mappedCount <= 0) {
      skippedEmptyBuckets++;
      transformations.push({
        kind: bucket.kind,
        offerType: bucket.offerType,
        priceRaw: bucket.priceRaw,
        priceUsd,
        originalCount: bucket.originalCount,
        mappedCount,
        sourceGroupCount: bucket.groups.length,
        seatsFound: bucket.originalCount,
        seatsSent: 0,
        wasTransformed,
        seatReduction: bucket.originalCount,
        skipped: true,
        skipReason: "zero_transform",
      });
      continue;
    }

    const allSeatIds = [
      ...new Set(
        bucket.groups
          .flatMap((g) => g.seats.map((s) => s.seatId.trim()))
          .filter(Boolean),
      ),
    ].sort();
    const allSeatNumbers = [
      ...new Set(
        bucket.groups
          .flatMap((g) => g.seats.map((s) => s.seatNumber.trim()))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const seats = pickSeatsFromGroups(bucket.groups, mappedCount);
    if (seats.length === 0) {
      skippedEmptyBuckets++;
      transformations.push({
        kind: bucket.kind,
        offerType: bucket.offerType,
        priceRaw: bucket.priceRaw,
        priceUsd,
        originalCount: bucket.originalCount,
        mappedCount,
        sourceGroupCount: bucket.groups.length,
        seatsFound: bucket.originalCount,
        seatsSent: 0,
        wasTransformed,
        seatReduction: bucket.originalCount,
        skipped: true,
        skipReason: "no_seats",
      });
      continue;
    }

    const seatsSent = seats.length;
    transformations.push({
      kind: bucket.kind,
      offerType: bucket.offerType,
      priceRaw: bucket.priceRaw,
      priceUsd,
      originalCount: bucket.originalCount,
      mappedCount,
      sourceGroupCount: bucket.groups.length,
      seatsFound: bucket.originalCount,
      seatsSent,
      wasTransformed,
      seatReduction: bucket.originalCount - seatsSent,
      skipped: false,
    });

    offers.push({
      kind: bucket.kind,
      offerType: bucket.offerType,
      priceRaw: bucket.priceRaw,
      priceUsd,
      originalCount: bucket.originalCount,
      transformedCount: seatsSent,
      sourceGroupCount: bucket.groups.length,
      allSeatIds,
      allSeatNumbers,
      seats,
    });
  }

  offers.sort((a, b) => {
    const kindCmp = a.kind.localeCompare(b.kind);
    if (kindCmp !== 0) return kindCmp;
    const typeCmp = a.offerType.localeCompare(b.offerType);
    if (typeCmp !== 0) return typeCmp;
    const pa = a.priceUsd ?? Number.POSITIVE_INFINITY;
    const pb = b.priceUsd ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  transformations.sort((a, b) => {
    const kindCmp = a.kind.localeCompare(b.kind);
    if (kindCmp !== 0) return kindCmp;
    const typeCmp = a.offerType.localeCompare(b.offerType);
    if (typeCmp !== 0) return typeCmp;
    const pa = a.priceUsd ?? Number.POSITIVE_INFINITY;
    const pb = b.priceUsd ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });

  const summary = buildSeatOffersSummary(rows.length, grouped.length, transformations, offers.length, skippedEmptyBuckets);

  return { offers, skippedEmptyBuckets, summary };
}
