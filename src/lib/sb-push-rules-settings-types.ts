import type { SeatOfferType } from "@/lib/seat-offers-transform";

export type SbPushQuantityRule = { input: number; output: number };

export type SbPushRulesConfig = {
  togetherRules: SbPushQuantityRule[];
  singleRules: SbPushQuantityRule[];
  autoDeleteOnScrapeRemoval: boolean;
  updatedAt: string | null;
};

export const DEFAULT_SB_PUSH_TOGETHER_RULES: SbPushQuantityRule[] = [
  { input: 4, output: 1 },
  { input: 5, output: 2 },
  { input: 6, output: 2 },
  { input: 7, output: 4 },
  { input: 10, output: 4 },
];

export const DEFAULT_SB_PUSH_SINGLE_RULES: SbPushQuantityRule[] = [
  { input: 4, output: 1 },
  { input: 5, output: 2 },
  { input: 6, output: 2 },
  { input: 7, output: 2 },
];

export const SB_PUSH_POLICY_DOC = {
  inventory: "Only sock_available rows with kind RESALE are pushed (not Last‑minute / shop).",
  grouping:
    "Seats are grouped by block + same raw price. Consecutive seat numbers in the same row become “together”; isolated seats are “single”.",
  aggregation:
    "All groups in the same block + price + offer type (single vs together) merge into one SB offer bucket before quantity rules run.",
  seatSelection:
    "After quantity is reduced, seats are picked from the bucket (largest consecutive runs first for together).",
  markup: "Prices use persisted markup % from the home page unless overridden in the SB API panel.",
  faceValue:
    "face_value is sent on ticket/create (whole USD) from shop_event_category (block price, else category), else event_category_block_prices or prisma/catalogues snapshot, matched by FIFA category × block id or name. When lookup misses, face_value defaults to the SB listing price (after markup). Push is blocked only if both lookup and listing price are unavailable.",
  restricted:
    "Offers with “restricted” in the FIFA category name are never pushed (preview and live push return an error).",
  dedupe: "Same physical seat ids cannot be pushed twice to SB for this event.",
  removal:
    "When a pushed listing disappears from the next resale scrape, it is deleted on SB and shown as removed in the UI (when enabled below).",
  unlistedCounts: "Seat counts not listed in the tables are sent as-is (SB quantity = seats in bucket).",
} as const;

export type SbPushRulesRuntime = {
  togetherMap: Readonly<Record<number, number>>;
  singleMap: Readonly<Record<number, number>>;
  autoDeleteOnScrapeRemoval: boolean;
};

export function normalizeRuleRows(raw: unknown): SbPushQuantityRule[] {
  if (!Array.isArray(raw)) return [];
  const out: SbPushQuantityRule[] = [];
  const seen = new Set<number>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const input = Number((row as { input?: unknown }).input);
    const output = Number((row as { output?: unknown }).output);
    if (!Number.isInteger(input) || input < 1) continue;
    if (!Number.isInteger(output) || output < 1 || output > input) continue;
    if (seen.has(input)) continue;
    seen.add(input);
    out.push({ input, output });
  }
  return out.sort((a, b) => a.input - b.input);
}

export function rulesToMap(rules: SbPushQuantityRule[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const r of rules) map[r.input] = r.output;
  return map;
}

export function defaultSbPushRulesConfig(): SbPushRulesConfig {
  return {
    togetherRules: [...DEFAULT_SB_PUSH_TOGETHER_RULES],
    singleRules: [...DEFAULT_SB_PUSH_SINGLE_RULES],
    autoDeleteOnScrapeRemoval: true,
    updatedAt: null,
  };
}

export function runtimeFromConfig(config: SbPushRulesConfig): SbPushRulesRuntime {
  return {
    togetherMap: rulesToMap(config.togetherRules),
    singleMap: rulesToMap(config.singleRules),
    autoDeleteOnScrapeRemoval: config.autoDeleteOnScrapeRemoval,
  };
}

export function mapQuantityWithRules(
  inputCount: number,
  offerType: SeatOfferType,
  runtime: SbPushRulesRuntime,
): number {
  if (!Number.isFinite(inputCount) || inputCount <= 0) return 0;
  const table = offerType === "together" ? runtime.togetherMap : runtime.singleMap;
  return table[inputCount] ?? inputCount;
}

export function describeQuantityRuleSync(
  offerType: SeatOfferType,
  originalCount: number,
  transformedCount: number,
  runtime?: SbPushRulesRuntime,
): string {
  const rt =
    runtime ??
    runtimeFromConfig({
      togetherRules: DEFAULT_SB_PUSH_TOGETHER_RULES,
      singleRules: DEFAULT_SB_PUSH_SINGLE_RULES,
      autoDeleteOnScrapeRemoval: true,
      updatedAt: null,
    });
  return describeQuantityRuleWithRuntime(offerType, originalCount, transformedCount, rt);
}

export function describeQuantityRuleWithRuntime(
  offerType: SeatOfferType,
  originalCount: number,
  transformedCount: number,
  runtime: SbPushRulesRuntime,
): string {
  const table = offerType === "together" ? runtime.togetherMap : runtime.singleMap;
  const mapped = table[originalCount];
  if (mapped != null) {
    return `${offerType} bucket: ${originalCount} seat(s) at same block+price → SB quantity ${mapped} (rule ${originalCount}→${mapped})`;
  }
  if (originalCount === transformedCount) {
    return `${offerType} bucket: ${originalCount} seat(s) → SB quantity ${transformedCount} (no reduction rule for this count)`;
  }
  return `${offerType} bucket: ${originalCount} seat(s) → SB quantity ${transformedCount}`;
}

export function quantityRulesSummary(config: SbPushRulesConfig): {
  togetherQuantity: string;
  singleQuantity: string;
} {
  const fmt = (rules: SbPushQuantityRule[]) =>
    rules.map((r) => `${r.input}→${r.output}`).join(", ");
  return {
    togetherQuantity: `Together buckets: ${fmt(config.togetherRules)}; any other seat count is sent as-is.`,
    singleQuantity: `Single buckets: ${fmt(config.singleRules)}; any other seat count is sent as-is.`,
  };
}
