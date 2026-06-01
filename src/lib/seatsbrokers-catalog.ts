import { categoryNumFromCategoryName, resolveSbCategoryNum, type SbCategoryNum } from "@/lib/sb-category";
import { sbGetTicketBlocks, sbGetTicketDropdown } from "@/lib/seatsbrokers-client";
import type { SeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

export type SbDropdownCategory = {
  id: string;
  name: string;
  categoryNum: SbCategoryNum | null;
};

export type SbBlockOption = {
  /** SB internal id from ticket_block API — value for POST ticket/create `ticket_block`. */
  rowId: string;
  /** Section code shown in SB UI after create (e.g. 111c, 4). */
  blockId: string;
};

export type SbMatchCatalog = {
  categories: SbDropdownCategory[];
  blocksByCategoryId: Map<string, SbBlockOption[]>;
  dropdownError?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function extractResult(data: unknown): unknown {
  const obj = asRecord(data);
  if (!obj) return null;
  if ("result" in obj) return obj.result;
  return data;
}

export function parseSbDropdownCategories(data: unknown): SbDropdownCategory[] {
  const result = extractResult(data);
  const obj = asRecord(result) ?? asRecord(data);
  const raw = obj?.category;
  if (!Array.isArray(raw)) return [];

  const out: SbDropdownCategory[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    const id = String(r.id ?? "").trim();
    const name = String(r.category_name ?? r.name ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: name || `Category ${id}`,
      categoryNum: categoryNumFromCategoryName(name),
    });
  }

  return out.sort((a, b) => (a.categoryNum ?? 99) - (b.categoryNum ?? 99));
}

export function parseSbTicketBlocks(data: unknown): SbBlockOption[] {
  const result = extractResult(data);
  const rows = Array.isArray(result) ? result : Array.isArray(data) ? data : [];
  const out: SbBlockOption[] = [];

  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const blockId = String(r.block_id ?? r.blockId ?? "").trim();
    const rowId = String(r.id ?? "").trim();
    if (!blockId) continue;
    out.push({ rowId: rowId || blockId, blockId });
  }

  return out;
}

export function resolveSbCategoryFromCatalog(
  catalog: SbMatchCatalog | null,
  categoryName: string,
  fifaCategoryId: string,
): { sbCategoryId: string; categoryNum: SbCategoryNum | null; categoryLabel: string } {
  const categoryNum = resolveSbCategoryNum(categoryName, fifaCategoryId);
  if (catalog && categoryNum != null) {
    const match = catalog.categories.find((c) => c.categoryNum === categoryNum);
    if (match) {
      return { sbCategoryId: match.id, categoryNum, categoryLabel: match.name };
    }
  }
  if (categoryNum != null) {
    return { sbCategoryId: String(categoryNum), categoryNum, categoryLabel: `Category ${categoryNum}` };
  }
  return {
    sbCategoryId: String(fifaCategoryId ?? "").trim(),
    categoryNum: null,
    categoryLabel: categoryName || "—",
  };
}

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Loose contains only when the shorter token is long enough to avoid "4" matching "346". */
function tokensMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < 3) return false;
  return long.includes(short);
}

export function getSbBlocksForCategory(
  catalog: SbMatchCatalog | null,
  sbCategoryId: string,
): SbBlockOption[] {
  return catalog?.blocksByCategoryId.get(sbCategoryId) ?? [];
}

/** Resolve client/preview value to SB ticket_block (internal row id). */
export function resolveSbTicketBlockRowId(
  value: string,
  options: SbBlockOption[],
  fallbackRowId: string,
): string {
  const v = value.trim();
  if (!v) return fallbackRowId;
  const byRow = options.find((b) => b.rowId === v);
  if (byRow) return byRow.rowId;
  const bySection = options.find((b) => b.blockId === v);
  if (bySection) return bySection.rowId;
  return fallbackRowId;
}

export function isValidSbTicketBlockValue(value: string, options: SbBlockOption[]): boolean {
  const v = value.trim();
  if (!v) return false;
  return options.some((b) => b.rowId === v || b.blockId === v);
}

export function sbBlockCodeForRowId(rowId: string, options: SbBlockOption[]): string {
  return options.find((b) => b.rowId === rowId)?.blockId ?? "";
}

export function resolveSbBlockFromCatalog(
  catalog: SbMatchCatalog | null,
  sbCategoryId: string,
  blockName: string,
  fifaBlockId: string,
): {
  /** Internal row id for ticket_block on create (e.g. 1060776). */
  sbBlockRowId: string;
  /** Section code in SB list UI (e.g. 111c). */
  sbBlockCode: string;
  matched: boolean;
  sbBlockOptions: SbBlockOption[];
} {
  const sbBlockOptions = getSbBlocksForCategory(catalog, sbCategoryId);
  if (sbBlockOptions.length === 0) {
    return { sbBlockRowId: "", sbBlockCode: "", matched: false, sbBlockOptions };
  }

  const bn = normToken(blockName);
  const fid = normToken(fifaBlockId);

  for (const b of sbBlockOptions) {
    const bb = normToken(b.blockId);
    if (!bb) continue;
    if (bb === bn || bb === fid || tokensMatch(bb, bn) || tokensMatch(bb, fid)) {
      return { sbBlockRowId: b.rowId, sbBlockCode: b.blockId, matched: true, sbBlockOptions };
    }
  }

  if (sbBlockOptions.length === 1) {
    const only = sbBlockOptions[0]!;
    return { sbBlockRowId: only.rowId, sbBlockCode: only.blockId, matched: true, sbBlockOptions };
  }

  return { sbBlockRowId: "", sbBlockCode: "", matched: false, sbBlockOptions };
}

export function serializeSbCatalogBlocks(
  catalog: SbMatchCatalog,
): Record<string, SbBlockOption[]> {
  const out: Record<string, SbBlockOption[]> = {};
  for (const [catId, blocks] of catalog.blocksByCategoryId) {
    out[catId] = blocks;
  }
  return out;
}

/** Load SB category dropdown + blocks needed for the given offers. */
export async function loadSbMatchCatalogForOffers(
  matchId: string,
  offers: TransformedSeatOffer[],
  config: SeatsBrokersConfig,
): Promise<SbMatchCatalog> {
  const dropdownRes = await sbGetTicketDropdown(matchId, config);
  const categories = dropdownRes.ok ? parseSbDropdownCategories(dropdownRes.data) : [];
  const dropdownError = dropdownRes.ok ? undefined : dropdownRes.error;

  const neededNums = new Set<SbCategoryNum>();
  for (const o of offers) {
    const first = o.seats[0];
    if (!first) continue;
    const n = resolveSbCategoryNum(first.categoryName, first.categoryId);
    if (n) neededNums.add(n);
  }

  const blocksByCategoryId = new Map<string, SbBlockOption[]>();
  for (const cat of categories) {
    if (cat.categoryNum == null || !neededNums.has(cat.categoryNum)) continue;
    const blockRes = await sbGetTicketBlocks(matchId, cat.id, config);
    blocksByCategoryId.set(
      cat.id,
      blockRes.ok ? parseSbTicketBlocks(blockRes.data) : [],
    );
  }

  return { categories, blocksByCategoryId, dropdownError };
}
