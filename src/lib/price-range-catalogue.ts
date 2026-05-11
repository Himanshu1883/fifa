/** Parse & flatten ticketing `priceRangeCategories` / `categories` payloads → DB-ready rows with stable sorting. */

export type FlatCatalogueRow = {
  categoryId: string;
  categoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
};

export type FlatCatalogueBlockAvailabilityRow = {
  categoryId: string;
  categoryBlockId: string;
  availability: number;
  availabilityResale: number;
};

export class CataloguePayloadError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "CataloguePayloadError";
  }
}

function localizedLabel(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const o = raw as Record<string, unknown>;
  for (const k of ["en", "de", "fr", "es", "pt", "ar", "default"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function coerceId(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

type IncomingBlock = {
  id?: unknown;
  name?: unknown;
  availability?: unknown;
  availabilityResale?: unknown;
};
type IncomingCategory = {
  id?: unknown;
  name?: unknown;
  rank?: unknown;
  blocks?: IncomingBlock[];
};

function coerceNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
  }
  return 0;
}

type BlockInfo = {
  id: string;
  name: string;
  availability: number;
  availabilityResale: number;
};

function dedupeBlocksFirstWins(blocks: IncomingBlock[] | undefined): BlockInfo[] {
  if (!blocks?.length) return [];
  const seen = new Set<string>();
  const out: BlockInfo[] = [];
  for (const b of blocks) {
    const bid = coerceId(b.id);
    const label = localizedLabel(b.name);
    if (!bid) continue;
    if (seen.has(bid)) continue;
    seen.add(bid);
    out.push({
      id: bid,
      name: label,
      availability: coerceNonNegativeInt(b.availability),
      availabilityResale: coerceNonNegativeInt(b.availabilityResale),
    });
  }
  return out;
}

/** Sort blocks by localized label first, then numeric id */
function compareBlockRows(a: BlockInfo, b: BlockInfo): number {
  const na = a.name.trim() || a.id;
  const nb = b.name.trim() || b.id;
  const labelCmp = na.localeCompare(nb, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (labelCmp !== 0) return labelCmp;

  const ida = BigIntSafe(coerceId(a.id));
  const idb = BigIntSafe(coerceId(b.id));
  return ida < idb ? -1 : ida > idb ? 1 : 0;
}

function BigIntSafe(s: string): bigint {
  try {
    return BigInt(s.replace(/\D/g, "") || "0");
  } catch {
    return BigInt(0);
  }
}

function rankScore(r: unknown): number | null {
  if (typeof r === "number" && Number.isFinite(r)) return r;
  if (typeof r === "string") {
    const n = Number(r.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** ascending rank (API order), fallback numeric id comparison */
function compareCategories(a: IncomingCategory, b: IncomingCategory): number {
  const ra = rankScore(a.rank);
  const rb = rankScore(b.rank);
  if (ra !== null && rb !== null && ra !== rb) return ra - rb;
  if (ra !== null && rb === null) return -1;
  if (rb !== null && ra === null) return 1;

  const ida = BigIntSafe(coerceId(a.id));
  const idb = BigIntSafe(coerceId(b.id));
  return ida < idb ? -1 : ida > idb ? 1 : 0;
}

function normalizeCategory(cat: unknown): IncomingCategory | null {
  if (!cat || typeof cat !== "object" || Array.isArray(cat)) return null;
  const c = cat as IncomingCategory;
  if (!Array.isArray(c.blocks)) return null;
  return c;
}

/** Same heuristic as Zapier/Make unwrappers for other webhook bodies. */
const CATALOGUE_WRAPPER_KEYS = [
  "data",
  "payload",
  "body",
  "json",
  "record",
  "input",
  "hook",
  "event",
  "result",
  "response",
  "output",
] as const;

function tryParseJsonLoose(s: string): unknown | null {
  const t = s.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function looksLikeCategoryArray(arr: unknown): arr is unknown[] {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every(
      (el) =>
        !!el &&
        typeof el === "object" &&
        !Array.isArray(el) &&
        Array.isArray((el as IncomingCategory).blocks),
    )
  );
}

function coerceCategoriesArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return looksLikeCategoryArray(value) ? value : null;
  if (typeof value === "string") {
    const p = tryParseJsonLoose(value);
    return Array.isArray(p) && looksLikeCategoryArray(p) ? p : null;
  }
  return null;
}

/**
 * Peel common automation-tool wrappers / stringified bodies until categories keys appear,
 * then leave deep resolution to `resolveCategoriesList`.
 */
function unwrapCatalogueBody(raw: unknown): unknown {
  let cur: unknown = raw;
  if (typeof cur === "string") {
    const parsed = tryParseJsonLoose(cur);
    if (parsed === null) {
      throw new CataloguePayloadError("Body must be valid JSON.");
    }
    cur = parsed;
  }
  if (!cur || typeof cur !== "object" || Array.isArray(cur)) return cur;

  for (let depth = 0; depth < 8; depth++) {
    const o = cur as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(o, "priceRangeCategories") ||
      Object.prototype.hasOwnProperty.call(o, "categories")
    ) {
      return cur;
    }
    let inner: unknown = null;
    for (const k of CATALOGUE_WRAPPER_KEYS) {
      const v = o[k];
      if (typeof v === "string") {
        const loose = tryParseJsonLoose(v);
        if (loose !== null && typeof loose === "object") {
          inner = loose;
          break;
        }
      }
      if (v !== null && v !== undefined && typeof v === "object") {
        inner = v;
        break;
      }
    }
    if (inner === null) return cur;
    cur = inner;
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) break;
  }
  return cur;
}

function findPrefIdDeep(o: Record<string, unknown>, depth = 0): string {
  if (depth > 8) return "";
  const local =
    (typeof o.prefId === "string" && o.prefId.trim()) ||
    (typeof o.eventPrefId === "string" && o.eventPrefId.trim()) ||
    "";
  if (local) return local;
  for (const v of Object.values(o)) {
    if (v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v)) {
      const inner = findPrefIdDeep(v as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
  }
  return "";
}

function resolveCategoriesList(o: Record<string, unknown>, depth = 0): unknown[] | null {
  if (depth > 8) return null;
  const direct =
    coerceCategoriesArray(o.priceRangeCategories) ?? coerceCategoriesArray(o.categories);
  if (direct) return direct;
  for (const [k, v] of Object.entries(o)) {
    if (k === "prefId" || k === "eventPrefId") continue;
    const fromVal = coerceCategoriesArray(v);
    if (fromVal) return fromVal;
    if (v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v)) {
      const nested = resolveCategoriesList(v as Record<string, unknown>, depth + 1);
      if (nested !== null && nested.length > 0) return nested;
    }
  }
  return null;
}

/** Array of wrappers `[{ categories: [...] }, …]` export shape. */
function normalizeTopLevelCategoriesArray(arr: unknown[]): unknown[] {
  if (!arr.length) return arr;
  if (looksLikeCategoryArray(arr)) return arr;
  const merged: unknown[] = [];
  let anyMerged = false;
  const items = arr as unknown[];
  for (const el of items) {
    if (el !== null && el !== undefined && typeof el === "object" && !Array.isArray(el)) {
      const eo = el as Record<string, unknown>;
      const part =
        coerceCategoriesArray(eo.priceRangeCategories) ?? coerceCategoriesArray(eo.categories);
      if (part) {
        merged.push(...part);
        anyMerged = true;
      }
    }
  }
  return anyMerged ? merged : arr;
}

/**
 * Produce rows in order: sorted categories × sorted blocks inside each category.
 */
export function priceRangeCategoriesToFlatRows(priceRangeCategories: unknown[]): FlatCatalogueRow[] {
  if (!priceRangeCategories.length) {
    throw new CataloguePayloadError("Categories list is empty");
  }
  const normalized = priceRangeCategories
    .map(normalizeCategory)
    .filter((c): c is IncomingCategory => c !== null);

  if (!normalized.length) {
    throw new CataloguePayloadError(
      'No valid categories (each needs blocks[]). Use "categories" / "priceRangeCategories" or a JSON array.',
    );
  }

  normalized.sort(compareCategories);

  const rows: FlatCatalogueRow[] = [];
  for (const cat of normalized) {
    const categoryId = coerceId(cat.id);
    const categoryName = localizedLabel(cat.name);
    const blockPairs = dedupeBlocksFirstWins(cat.blocks);
    blockPairs.sort(compareBlockRows);
    for (const b of blockPairs) {
      rows.push({
        categoryId,
        categoryName,
        categoryBlockId: b.id,
        categoryBlockName: b.name,
      });
    }
  }
  return rows;
}

export function priceRangeCategoriesToAvailabilityRows(
  priceRangeCategories: unknown[],
): FlatCatalogueBlockAvailabilityRow[] {
  if (!priceRangeCategories.length) {
    throw new CataloguePayloadError("Categories list is empty");
  }
  const normalized = priceRangeCategories
    .map(normalizeCategory)
    .filter((c): c is IncomingCategory => c !== null);

  if (!normalized.length) {
    throw new CataloguePayloadError(
      'No valid categories (each needs blocks[]). Use "categories" / "priceRangeCategories" or a JSON array.',
    );
  }

  normalized.sort(compareCategories);

  const rows: FlatCatalogueBlockAvailabilityRow[] = [];
  for (const cat of normalized) {
    const categoryId = coerceId(cat.id);
    const blocks = dedupeBlocksFirstWins(cat.blocks);
    blocks.sort(compareBlockRows);
    for (const b of blocks) {
      rows.push({
        categoryId,
        categoryBlockId: b.id,
        availability: b.availability,
        availabilityResale: b.availabilityResale,
      });
    }
  }
  return rows;
}

/**
 * Parses catalogue payloads:
 * - `{ prefId?, priceRangeCategories?: [...] | categories?: [...] }` (fallback prefId via query).
 * - Raw `[{ id, rank, blocks, ... }, …]` plus `prefIdFallback` (?prefId= or wrapper).
 *
 * Alias `categories` accepts exports that omit the `priceRangeCategories` property name.
 */
export function catalogueRowsFromPayload(body: unknown, prefIdFallback?: string | null): {
  prefId: string;
  rows: FlatCatalogueRow[];
  availabilityRows: FlatCatalogueBlockAvailabilityRow[];
} {
  body = unwrapCatalogueBody(body);

  if (Array.isArray(body)) {
    const merged = normalizeTopLevelCategoriesArray(body);
    const prefId = prefIdFallback?.trim() ?? "";
    if (!prefId) {
      throw new CataloguePayloadError(
        "Send prefId (?prefId= in URL), or wrap the array as { prefId, categories: [...] }.",
      );
    }
    return {
      prefId,
      rows: priceRangeCategoriesToFlatRows(merged),
      availabilityRows: priceRangeCategoriesToAvailabilityRows(merged),
    };
  }

  if (!body || typeof body !== "object") {
    throw new CataloguePayloadError(
      'Body must be a JSON object or an array of categories (e.g. { "prefId": "…", "categories": […] }).',
    );
  }

  const o = body as Record<string, unknown>;
  const prefId = findPrefIdDeep(o) || (prefIdFallback?.trim() ?? "");

  const catList = resolveCategoriesList(o);
  if (!prefId) {
    throw new CataloguePayloadError(
      "Missing prefId (prefId / eventPrefId in JSON, or ?prefId= for raw arrays).",
    );
  }
  if (catList === null) {
    throw new CataloguePayloadError(
      'Missing categories — use "priceRangeCategories" / "categories", or POST a raw array with ?prefId=.',
    );
  }

  const rows = priceRangeCategoriesToFlatRows(catList as unknown[]);
  const availabilityRows = priceRangeCategoriesToAvailabilityRows(catList as unknown[]);
  return { prefId, rows, availabilityRows };
}

/** @deprecated Prefer catalogueRowsFromPayload */
export function parseCatalogueWebhookBody(body: unknown, prefIdFallback?: string | null) {
  return catalogueRowsFromPayload(body, prefIdFallback);
}
