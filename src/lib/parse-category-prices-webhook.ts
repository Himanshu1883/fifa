import { CataloguePayloadError } from "@/lib/price-range-catalogue";

export type FlatPriceRow = {
  categoryId: string;
  categoryBlockId: string;
  minPrice: number;
  maxPrice: number;
};

/** Default: webhook payloads use integer cents; we persist USD (divide by 100). */
export type PriceWebhookParseOptions = {
  amountUnit?: "cents" | "usd";
};

/** Parse `?amountUnit=usd` (values already in dollars) vs cents (default). */
export function amountUnitFromSearchParam(raw: string | null): "cents" | "usd" {
  const v = raw?.trim().toLowerCase();
  if (v === "usd" || v === "dollars" || v === "dollar") return "usd";
  return "cents";
}

function convertRowAmounts(rows: FlatPriceRow[], amountUnit: "cents" | "usd"): FlatPriceRow[] {
  if (amountUnit === "usd") return rows;
  return rows.map((r) => ({
    ...r,
    minPrice: r.minPrice / 100,
    maxPrice: r.maxPrice / 100,
  }));
}

function coerceId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function coerceMoney(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  throw new CataloguePayloadError(`Invalid ${field} — must be a finite number`);
}

function pickDeep(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null) return v;
  }
  const wrappers = ["data", "payload", "body", "result", "ticket", "event", "record", "item"];
  for (const w of wrappers) {
    const inner = o[w];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const ino = inner as Record<string, unknown>;
      for (const k of keys) {
        const v = ino[k];
        if (v !== undefined && v !== null) return v;
      }
    }
  }
  return undefined;
}

const AREA_BLOCK_PAYLOAD_NOISE = new Set([
  "min",
  "max",
  "hasCatalogPriceSeat",
  "lastUpdated",
  "last_updated",
  "seatPriceRangesBySeatCat",
  "seat_price_ranges_by_seat_cat",
  "prefId",
  "pref_id",
  "eventPrefId",
  "event_pref_id",
  "amountUnit",
  "amount_unit",
  "id",
  "type",
  "metadata",
  "source",
  "version",
]);

/**
 * Same NOISE heuristic as loose extraction — one sibling object can look like `{ min, seatPriceRangesBySeatCat }`.
 */
function looseAreaBlockLooksLikeCandidate(k: string, v: unknown): v is Record<string, unknown> {
  if (!k.trim()) return false;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const child = v as Record<string, unknown>;
  const byCat = child.seatPriceRangesBySeatCat ?? child.seat_price_ranges_by_seat_cat;
  return byCat !== undefined && typeof byCat === "object" && !Array.isArray(byCat);
}

function extractAreaBlockCandidatesOneLevel(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidate: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (AREA_BLOCK_PAYLOAD_NOISE.has(k)) continue;
    if (looseAreaBlockLooksLikeCandidate(k, v)) {
      candidate[k] = v;
    }
  }
  return Object.keys(candidate).length > 0 ? candidate : undefined;
}

/**
 * When `seatPriceRangesByAreaBlock` is omitted but block objects sit next to `min` / `lastUpdated` etc.,
 * optionally nested under provider wrappers (`data`, `payload`, …).
 */
function extractAreaBlockMapFromLoosePayload(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = extractAreaBlockCandidatesOneLevel(o);
  if (direct) return direct;

  const wrapperKeys = ["data", "payload", "body", "result", "ticket", "event", "record", "item"];
  for (const w of wrapperKeys) {
    const inner = o[w];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const nested = extractAreaBlockMapFromLoosePayload(inner as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Emit `{ min/max }` entries under a seat-category map (`seatPriceRangesBySeatCat`). */
function pushRowsFromSeatCategoryMap(
  rows: FlatPriceRow[],
  categoryBlockId: string,
  byCat: Record<string, unknown>,
): void {
  for (const [categoryId, catNode] of Object.entries(byCat)) {
    if (!categoryId.trim()) continue;
    if (!catNode || typeof catNode !== "object" || Array.isArray(catNode)) continue;
    const c = catNode as Record<string, unknown>;
    const minPrice = coerceMoney(c.min ?? c.minPrice ?? c.min_price, "min");
    const maxPrice = coerceMoney(c.max ?? c.maxPrice ?? c.max_price, "max");
    if (minPrice > maxPrice) {
      throw new CataloguePayloadError(
        `min (${minPrice}) must be ≤ max (${maxPrice}) for block ${categoryBlockId} / category ${categoryId}`,
      );
    }
    rows.push({ categoryId, categoryBlockId, minPrice, maxPrice });
  }
}

/**
 * Walk nested ticketing maps: wrappers (`blocks`, `data`, …) and arrays of block rows unwind until each
 * `seatPriceRangesBySeatCat` is tied to its block key (object key chain) or `categoryBlockId` on an array row.
 */
function collectAreaBlockPriceRows(value: unknown, implicitBlockId: string | undefined): FlatPriceRow[] {
  const rows: FlatPriceRow[] = [];

  function visit(next: unknown, implicit: string | undefined): void {
    if (next === null || next === undefined) return;

    if (Array.isArray(next)) {
      for (const item of next) {
        visit(item, implicit);
      }
      return;
    }

    if (typeof next !== "object") return;

    const o = next as Record<string, unknown>;

    const explicitBlock = coerceId(
      o.categoryBlockId ??
        o.category_block_id ??
        o.blockId ??
        o.block_id ??
        o.areaBlockId ??
        o.area_block_id ??
        o.id,
    );

    const byCatRaw = o.seatPriceRangesBySeatCat ?? o.seat_price_ranges_by_seat_cat;
    const blockId = explicitBlock || implicit;

    if (byCatRaw && typeof byCatRaw === "object" && !Array.isArray(byCatRaw)) {
      if (!blockId?.trim()) return;
      pushRowsFromSeatCategoryMap(rows, blockId, byCatRaw as Record<string, unknown>);
      return;
    }

    for (const [k, child] of Object.entries(o)) {
      if (!k.trim()) continue;
      visit(child, k);
    }
  }

  visit(value, implicitBlockId);
  return rows;
}

/**
 * Ticketing export shape: block id → `seatPriceRangesBySeatCat` (category id → `{ min, max }`), possibly
 * wrapped (e.g. `{ blocks: { … } }`) or POSTed as an array of `{ categoryBlockId, seatPriceRangesBySeatCat }`.
 * Maps to our DB: categoryId = seat category, categoryBlockId = area/stadium block.
 */
export function rowsFromSeatPriceRangesByAreaBlock(raw: unknown): FlatPriceRow[] {
  let rows: FlatPriceRow[];

  if (Array.isArray(raw)) {
    rows = collectAreaBlockPriceRows(raw, undefined);
  } else if (raw && typeof raw === "object") {
    rows = collectAreaBlockPriceRows(raw as Record<string, unknown>, undefined);
  } else {
    throw new CataloguePayloadError(
      "seatPriceRangesByAreaBlock must be a JSON object or array of block price entries",
    );
  }

  if (rows.length === 0) {
    throw new CataloguePayloadError(
      "No usable rows under seatPriceRangesByAreaBlock — each block needs seatPriceRangesBySeatCat with min/max (or minPrice/maxPrice); nested wrappers and arrays are supported.",
    );
  }
  return rows;
}

/**
 * Body: `{ prefId?, prices?: [...] }` or `{ prefId, seatPriceRangesByAreaBlock }` (ticketing export),
 * or raw `[{ categoryId, categoryBlockId, minPrice, maxPrice }, …]` + `?prefId=`.
 */
export function parseCategoryPricesWebhookBody(
  body: unknown,
  prefIdFallback?: string | null,
  options?: PriceWebhookParseOptions,
): { prefId: string; rows: FlatPriceRow[] } {
  const amountUnit = options?.amountUnit === "usd" ? "usd" : "cents";

  const out = (prefId: string, rows: FlatPriceRow[]) => ({
    prefId,
    rows: convertRowAmounts(rows, amountUnit),
  });
  const parseRows = (arr: unknown): FlatPriceRow[] => {
    if (!Array.isArray(arr)) {
      throw new CataloguePayloadError('"prices" must be a JSON array.');
    }
    if (arr.length === 0) {
      return [];
    }
    const rows: FlatPriceRow[] = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new CataloguePayloadError("Each price row must be a JSON object");
      }
      const o = raw as Record<string, unknown>;
      const categoryId = coerceId(o.categoryId ?? o.category_id);
      const categoryBlockId = coerceId(o.categoryBlockId ?? o.category_block_id ?? o.blockId);
      if (!categoryId || !categoryBlockId) {
        throw new CataloguePayloadError("Each row needs categoryId and categoryBlockId");
      }
      const minPrice = coerceMoney(
        o.minPrice ?? o.min_price ?? o.min,
        "minPrice",
      );
      const maxPrice = coerceMoney(
        o.maxPrice ?? o.max_price ?? o.max,
        "maxPrice",
      );
      if (minPrice > maxPrice) {
        throw new CataloguePayloadError(
          `minPrice (${minPrice}) must be ≤ maxPrice (${maxPrice}) for ${categoryId} / ${categoryBlockId}`,
        );
      }
      rows.push({ categoryId, categoryBlockId, minPrice, maxPrice });
    }
    return rows;
  };

  if (Array.isArray(body)) {
    const prefId = prefIdFallback?.trim() ?? "";
    if (!prefId) {
      throw new CataloguePayloadError(
        "Send prefId in the wrapper object or ?prefId= / ?resalePrefId= when posting a raw array.",
      );
    }
    return out(prefId, parseRows(body));
  }

  if (!body || typeof body !== "object") {
    throw new CataloguePayloadError(
      'Body must be `{ prefId, prices: [...] }` or a JSON array with ?prefId= in the URL.',
    );
  }

  const o = body as Record<string, unknown>;
  const prefId =
    (typeof o.prefId === "string" && o.prefId.trim()) ||
    (typeof o.eventPrefId === "string" && o.eventPrefId.trim()) ||
    (prefIdFallback?.trim() ?? "");

  const areaBlockRaw =
    pickDeep(o, ["seatPriceRangesByAreaBlock", "seat_price_ranges_by_area_block"]) ??
    extractAreaBlockMapFromLoosePayload(o);

  if (areaBlockRaw !== undefined && areaBlockRaw !== null) {
    if (!prefId) {
      throw new CataloguePayloadError(
        "Missing prefId (required with seatPriceRangesByAreaBlock) — use prefId in JSON or ?prefId= / ?resalePrefId=.",
      );
    }
    const rows = rowsFromSeatPriceRangesByAreaBlock(areaBlockRaw);
    return out(prefId, rows);
  }

  const list =
    pickDeep(o, ["prices", "rows", "categoryPrices", "priceRows", "price_ranges"]) ??
    o.prices ??
    o.rows ??
    o.categoryPrices;
  if (!prefId) {
    throw new CataloguePayloadError('Missing prefId (or eventPrefId / query param for the catalogue).');
  }
  if (list === undefined) {
    throw new CataloguePayloadError(
      "Missing price data in JSON body. Send \"seatPriceRangesByAreaBlock\": { ... }, or nest it under \"data\"/\"payload\"/\"body\", or POST the full ticketing object (block ids as keys with seatPriceRangesBySeatCat inside each). Include Content-Type: application/json. Query ?resalePrefId= only selects the event.",
    );
  }
  return out(prefId, parseRows(list));
}
