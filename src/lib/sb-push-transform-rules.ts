/** Documented quantity rules — must stay in sync with seat-offers-transform.ts maps. */

export const SB_PUSH_TOGETHER_QUANTITY_RULES: ReadonlyArray<{ input: number; output: number }> = [
  { input: 4, output: 1 },
  { input: 5, output: 2 },
  { input: 6, output: 2 },
  { input: 7, output: 4 },
  { input: 10, output: 4 },
];

export const SB_PUSH_SINGLE_QUANTITY_RULES: ReadonlyArray<{ input: number; output: number }> = [
  { input: 4, output: 1 },
  { input: 5, output: 2 },
  { input: 6, output: 2 },
  { input: 7, output: 2 },
];

export const SB_PUSH_TRANSFORM_RULES_DOC = {
  inventory: "Only sock_available rows with kind RESALE are pushed (not Last‑minute / shop).",
  grouping:
    "Seats are grouped by block + same raw price. Consecutive seat numbers in the same row become “together”; isolated seats are “single”.",
  aggregation:
    "All groups in the same block + price + offer type (single vs together) merge into one SB offer bucket before quantity rules run.",
  togetherQuantity:
    "Together buckets: 4→1, 5→2, 6→2, 7→4, 10→4 listings; any other seat count is sent as-is.",
  singleQuantity:
    "Single buckets: 4→1, 5→2, 6→2, 7→2 listings; any other seat count (e.g. 10 singles same price) is sent as-is (quantity 10).",
  seatSelection:
    "After quantity is reduced, seats are picked from the bucket (largest consecutive runs first for together).",
  markup: "Prices use persisted markup % from the UI unless overridden in SB API panel.",
  dedupe: "Same physical seat ids cannot be pushed twice to SB for this event.",
  removal:
    "When a pushed listing disappears from the next resale scrape, it is deleted on SB and shown as removed in the UI.",
} as const;

export function describeQuantityRule(
  offerType: "single" | "together",
  originalCount: number,
  transformedCount: number,
): string {
  const table = offerType === "together" ? SB_PUSH_TOGETHER_QUANTITY_RULES : SB_PUSH_SINGLE_QUANTITY_RULES;
  const row = table.find((r) => r.input === originalCount);
  if (row) {
    return `${offerType} bucket: ${originalCount} seat(s) at same block+price → SB quantity ${row.output} (rule ${originalCount}→${row.output})`;
  }
  if (originalCount === transformedCount) {
    return `${offerType} bucket: ${originalCount} seat(s) → SB quantity ${transformedCount} (no reduction rule for this count)`;
  }
  return `${offerType} bucket: ${originalCount} seat(s) → SB quantity ${transformedCount}`;
}
