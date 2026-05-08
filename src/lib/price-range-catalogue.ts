/** Parse & flatten ticketing `priceRangeCategories` / `categories` payloads → DB-ready rows with stable sorting. */

export type FlatCatalogueRow = {
  categoryId: string;
  categoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
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

type IncomingBlock = { id?: unknown; name?: unknown };
type IncomingCategory = {
  id?: unknown;
  name?: unknown;
  rank?: unknown;
  blocks?: IncomingBlock[];
};

function dedupeBlocksFirstWins(blocks: IncomingBlock[] | undefined): [string, string][] {
  if (!blocks?.length) return [];
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const b of blocks) {
    const bid = coerceId(b.id);
    const label = localizedLabel(b.name);
    if (!bid) continue;
    if (seen.has(bid)) continue;
    seen.add(bid);
    out.push([bid, label]);
  }
  return out;
}

/** Sort blocks by localized label first, then numeric id */
function compareBlockRows(a: [string, string], b: [string, string]): number {
  const [idA, nameA] = a;
  const [idB, nameB] = b;
  const na = nameA.trim() || idA;
  const nb = nameB.trim() || idB;
  const labelCmp = na.localeCompare(nb, undefined, {
    sensitivity: "base",
    numeric: true,
  });
  if (labelCmp !== 0) return labelCmp;

  const ida = BigIntSafe(coerceId(idA));
  const idb = BigIntSafe(coerceId(idB));
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
    for (const [categoryBlockId, categoryBlockName] of blockPairs) {
      rows.push({
        categoryId,
        categoryName,
        categoryBlockId,
        categoryBlockName,
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
} {
  if (Array.isArray(body)) {
    const prefId = prefIdFallback?.trim() ?? "";
    if (!prefId) {
      throw new CataloguePayloadError(
        "Send prefId (?prefId= in URL), or wrap the array as { prefId, categories: [...] }.",
      );
    }
    return { prefId, rows: priceRangeCategoriesToFlatRows(body) };
  }

  if (!body || typeof body !== "object") {
    throw new CataloguePayloadError(
      'Body must be a JSON object or an array of categories (e.g. { "prefId": "…", "categories": […] }).',
    );
  }

  const o = body as Record<string, unknown>;
  const prefId =
    (typeof o.prefId === "string" && o.prefId.trim()) ||
    (typeof o.eventPrefId === "string" && o.eventPrefId.trim()) ||
    (prefIdFallback?.trim() ?? "");

  const catList = o.priceRangeCategories ?? o.categories;
  if (!prefId) {
    throw new CataloguePayloadError(
      "Missing prefId (prefId / eventPrefId in JSON, or ?prefId= for raw arrays).",
    );
  }
  if (!Array.isArray(catList)) {
    throw new CataloguePayloadError(
      'Missing categories — use "priceRangeCategories" / "categories", or POST a raw array with ?prefId=.',
    );
  }

  const rows = priceRangeCategoriesToFlatRows(catList as unknown[]);
  return { prefId, rows };
}

/** @deprecated Prefer catalogueRowsFromPayload */
export function parseCatalogueWebhookBody(body: unknown, prefIdFallback?: string | null) {
  return catalogueRowsFromPayload(body, prefIdFallback);
}
