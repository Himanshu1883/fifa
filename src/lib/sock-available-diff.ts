import type { SockAvailableKind } from "@/generated/prisma/enums";
import type { SockAvailableRowInput } from "@/lib/parse-sock-available-geojson-webhook";

export type SockAvailableComparableDbRow = {
  areaId: string;
  areaName: string;
  blockId: string;
  blockName: string;
  seatId: string;
  seatNumber: string;
  resaleMovementId: string | null;
  row: string;
  categoryName: string;
  categoryId: string;
  amount: unknown;
};

export type SockAvailableDiffSample = {
  change: "new" | "changed";
  key: string;
  seatId: string;
  resaleMovementId: string | null;
  areaName: string;
  blockName: string;
  row: string;
  seatNumber: string;
  categoryId: string;
  amountRaw: number | null;
  prev?: {
    areaName: string;
    blockName: string;
    row: string;
    seatNumber: string;
    categoryId: string;
    amountRaw: number | null;
  };
  changedFields?: Array<
    "areaId" | "areaName" | "blockId" | "blockName" | "row" | "seatNumber" | "categoryId" | "categoryName" | "amount"
  >;
};

export type SockAvailableNewListingKey = {
  key: string;
  seatId: string;
  resaleMovementId: string | null;
  categoryId: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatNumber: string;
  amountRaw: number | null;
};

export type SockAvailableDiffSummary = {
  kind: SockAvailableKind;
  incomingUniqueCount: number;
  existingUniqueCount: number;
  newCount: number;
  changedCount: number;
  priceChangedCount: number;
  /**
   * Capped set of identifiers for *new* listings in this diff.
   * Stored for UI/debugging without pulling full snapshots.
   */
  newSeatIds: SockAvailableNewListingKey[];
  sample: SockAvailableDiffSample[];
};

function keyFor(r: { resaleMovementId: string | null; seatId: string }): string {
  return r.resaleMovementId ? `m:${r.resaleMovementId}` : `s:${r.seatId}`;
}

function amountToNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v) {
    const anyV = v as { toNumber?: unknown; toString?: unknown };
    if (typeof anyV.toNumber === "function") {
      try {
        const n = (anyV.toNumber as () => unknown)();
        return typeof n === "number" && Number.isFinite(n) ? n : null;
      } catch {
        // fallthrough
      }
    }
    if (typeof anyV.toString === "function") {
      try {
        const s = String((anyV.toString as () => unknown)());
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      } catch {
        // fallthrough
      }
    }
  }
  return null;
}

function eqNullableNumber(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

function diffFields(
  incoming: SockAvailableRowInput,
  existing: SockAvailableComparableDbRow,
): {
  changedFields: NonNullable<SockAvailableDiffSample["changedFields"]>;
  priceChanged: boolean;
} {
  const changedFields: NonNullable<SockAvailableDiffSample["changedFields"]> = [];
  if (incoming.areaId !== existing.areaId) changedFields.push("areaId");
  if (incoming.areaName !== existing.areaName) changedFields.push("areaName");
  if (incoming.blockId !== existing.blockId) changedFields.push("blockId");
  if (incoming.blockName !== existing.blockName) changedFields.push("blockName");
  if (incoming.row !== existing.row) changedFields.push("row");
  if (incoming.seatNumber !== existing.seatNumber) changedFields.push("seatNumber");
  if (incoming.categoryId !== existing.categoryId) changedFields.push("categoryId");
  if (incoming.categoryName !== existing.categoryName) changedFields.push("categoryName");

  const inAmount = incoming.amount;
  const exAmount = amountToNumberOrNull(existing.amount);
  const priceChanged = !eqNullableNumber(inAmount, exAmount);
  if (priceChanged) changedFields.push("amount");

  return { changedFields, priceChanged };
}

function pickPrev(existing: SockAvailableComparableDbRow): SockAvailableDiffSample["prev"] {
  return {
    areaName: existing.areaName,
    blockName: existing.blockName,
    row: existing.row,
    seatNumber: existing.seatNumber,
    categoryId: existing.categoryId,
    amountRaw: amountToNumberOrNull(existing.amount),
  };
}

export function computeSockAvailableDiff(params: {
  kind: SockAvailableKind;
  incoming: SockAvailableRowInput[];
  existing: SockAvailableComparableDbRow[];
  sampleLimit?: number;
  newSeatIdsLimit?: number;
}): SockAvailableDiffSummary {
  const { kind, incoming, existing, sampleLimit = 10, newSeatIdsLimit = 500 } = params;

  const incomingMap = new Map<string, SockAvailableRowInput>();
  for (const r of incoming) {
    const k = keyFor(r);
    if (!incomingMap.has(k)) incomingMap.set(k, r);
  }

  const existingMap = new Map<string, SockAvailableComparableDbRow>();
  for (const r of existing) {
    const k = keyFor(r);
    if (!existingMap.has(k)) existingMap.set(k, r);
  }

  let newCount = 0;
  let changedCount = 0;
  let priceChangedCount = 0;
  const newSeatIds: SockAvailableNewListingKey[] = [];
  const sample: SockAvailableDiffSample[] = [];

  for (const [k, inRow] of incomingMap.entries()) {
    const exRow = existingMap.get(k);
    if (!exRow) {
      newCount += 1;
      if (newSeatIds.length < newSeatIdsLimit) {
        newSeatIds.push({
          key: k,
          seatId: inRow.seatId,
          resaleMovementId: inRow.resaleMovementId,
          categoryId: inRow.categoryId,
          categoryName: inRow.categoryName,
          blockName: inRow.blockName,
          row: inRow.row,
          seatNumber: inRow.seatNumber,
          amountRaw: inRow.amount,
        });
      }
      if (sample.length < sampleLimit) {
        sample.push({
          change: "new",
          key: k,
          seatId: inRow.seatId,
          resaleMovementId: inRow.resaleMovementId,
          areaName: inRow.areaName,
          blockName: inRow.blockName,
          row: inRow.row,
          seatNumber: inRow.seatNumber,
          categoryId: inRow.categoryId,
          amountRaw: inRow.amount,
        });
      }
      continue;
    }

    const { changedFields, priceChanged } = diffFields(inRow, exRow);
    if (changedFields.length === 0) continue;

    changedCount += 1;
    if (priceChanged) priceChangedCount += 1;

    if (sample.length < sampleLimit) {
      sample.push({
        change: "changed",
        key: k,
        seatId: inRow.seatId,
        resaleMovementId: inRow.resaleMovementId,
        areaName: inRow.areaName,
        blockName: inRow.blockName,
        row: inRow.row,
        seatNumber: inRow.seatNumber,
        categoryId: inRow.categoryId,
        amountRaw: inRow.amount,
        prev: pickPrev(exRow),
        changedFields,
      });
    }
  }

  return {
    kind,
    incomingUniqueCount: incomingMap.size,
    existingUniqueCount: existingMap.size,
    newCount,
    changedCount,
    priceChangedCount,
    newSeatIds,
    sample,
  };
}

