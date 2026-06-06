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

/**
 * FIFA seat-map blocks at some venues use T1-06 / T2-43 while SB lists section 06 / 43.
 * Returns the trailing section number when the name matches that pattern.
 */
export function sectionCodeFromFifaBlockName(blockName: string): string | null {
  const m = String(blockName ?? "").trim().match(/^T[12]-(\d+)$/i);
  return m?.[1] ?? null;
}

/** Compare SB section codes; numeric ids treat 6 and 06 as equal. */
export function sbBlockSectionCodesMatch(fifaToken: string, sbBlockId: string): boolean {
  const a = normToken(fifaToken);
  const b = normToken(sbBlockId);
  if (!a || !b) return false;
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number.parseInt(a, 10) === Number.parseInt(b, 10);
  return false;
}

/** Long numeric ids are FIFA/SockAvailable; never fuzzy-match these against SB section codes. */
function isLikelyFifaSnowflakeId(value: string): boolean {
  return /^\d{12,}$/.test(value.trim());
}

function blockNameMatchTokens(blockName: string): string[] {
  const tokens = [normToken(blockName)];
  const section = sectionCodeFromFifaBlockName(blockName);
  if (section) tokens.push(normToken(section));
  return [...new Set(tokens.filter(Boolean))];
}

function sbBlockMatchesBlockName(sbBlockId: string, blockName: string): boolean {
  const bb = normToken(sbBlockId);
  if (!bb) return false;
  return blockNameMatchTokens(blockName).some(
    (token) => sbBlockSectionCodesMatch(token, bb) || tokensMatch(bb, token),
  );
}

function sectionCodesForCrossMatch(blockName: string): string[] {
  const codes: string[] = [];
  const t = sectionCodeFromFifaBlockName(blockName);
  if (t) codes.push(t);
  const bn = normToken(blockName);
  if (bn && /^\d+$/.test(bn)) codes.push(bn);
  return [...new Set(codes)];
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
  const bySection = options.find(
    (b) => b.blockId === v || sbBlockSectionCodesMatch(v, b.blockId),
  );
  if (bySection) return bySection.rowId;
  const section = sectionCodeFromFifaBlockName(v);
  if (section) {
    const byFifaSection = options.find((b) => sbBlockSectionCodesMatch(section, b.blockId));
    if (byFifaSection) return byFifaSection.rowId;
  }
  return fallbackRowId;
}

export function isValidSbTicketBlockValue(value: string, options: SbBlockOption[]): boolean {
  const v = value.trim();
  if (!v) return false;
  return options.some(
    (b) =>
      b.rowId === v ||
      b.blockId === v ||
      sbBlockSectionCodesMatch(v, b.blockId) ||
      (sectionCodeFromFifaBlockName(v) != null &&
        sbBlockSectionCodesMatch(sectionCodeFromFifaBlockName(v)!, b.blockId)),
  );
}

export function sbBlockCodeForRowId(rowId: string, options: SbBlockOption[]): string {
  return options.find((b) => b.rowId === rowId)?.blockId ?? "";
}

export type SbBlockMatchSource = "primary" | "cross_category" | "single_option" | "unmatched";

export type SbBlockResolveResult = {
  /** Internal row id for ticket_block on create (e.g. 1060776). */
  sbBlockRowId: string;
  /** Section code in SB list UI (e.g. 111c). */
  sbBlockCode: string;
  matched: boolean;
  sbBlockOptions: SbBlockOption[];
  /** SB category id that owns the matched block (may differ from FIFA category on cross-match). */
  matchedSbCategoryId: string;
  matchSource: SbBlockMatchSource;
};

function findSbBlockInOptions(
  options: SbBlockOption[],
  blockName: string,
  fifaBlockId: string,
): SbBlockOption | null {
  const byName = options.find((b) => sbBlockMatchesBlockName(b.blockId, blockName));
  if (byName) return byName;

  const bn = blockName.trim();
  if (!bn && !isLikelyFifaSnowflakeId(fifaBlockId)) {
    const fid = normToken(fifaBlockId);
    if (fid) {
      return (
        options.find(
          (b) => sbBlockSectionCodesMatch(fid, b.blockId) || tokensMatch(b.blockId, fid),
        ) ?? null
      );
    }
  }
  return null;
}

function findSbBlockBySectionAcrossCatalog(
  catalog: SbMatchCatalog,
  sectionCode: string,
  excludeCategoryId: string,
): { block: SbBlockOption; categoryId: string } | null {
  for (const [categoryId, options] of catalog.blocksByCategoryId) {
    if (categoryId === excludeCategoryId) continue;
    const hit = options.find((b) => sbBlockSectionCodesMatch(sectionCode, b.blockId));
    if (hit) return { block: hit, categoryId };
  }
  return null;
}

export function resolveSbBlockFromCatalog(
  catalog: SbMatchCatalog | null,
  sbCategoryId: string,
  blockName: string,
  fifaBlockId: string,
): SbBlockResolveResult {
  const sbBlockOptions = getSbBlocksForCategory(catalog, sbCategoryId);
  const unmatched = (): SbBlockResolveResult => ({
    sbBlockRowId: "",
    sbBlockCode: "",
    matched: false,
    sbBlockOptions,
    matchedSbCategoryId: sbCategoryId,
    matchSource: "unmatched",
  });

  if (sbBlockOptions.length === 0 && !catalog) return unmatched();

  const primaryHit = findSbBlockInOptions(sbBlockOptions, blockName, fifaBlockId);
  if (primaryHit) {
    return {
      sbBlockRowId: primaryHit.rowId,
      sbBlockCode: primaryHit.blockId,
      matched: true,
      sbBlockOptions,
      matchedSbCategoryId: sbCategoryId,
      matchSource: "primary",
    };
  }

  if (catalog) {
    for (const sectionCode of sectionCodesForCrossMatch(blockName)) {
      const cross = findSbBlockBySectionAcrossCatalog(catalog, sectionCode, sbCategoryId);
      if (cross) {
        return {
          sbBlockRowId: cross.block.rowId,
          sbBlockCode: cross.block.blockId,
          matched: true,
          sbBlockOptions,
          matchedSbCategoryId: cross.categoryId,
          matchSource: "cross_category",
        };
      }
    }
  }

  if (sbBlockOptions.length === 1) {
    const only = sbBlockOptions[0]!;
    return {
      sbBlockRowId: only.rowId,
      sbBlockCode: only.blockId,
      matched: true,
      sbBlockOptions,
      matchedSbCategoryId: sbCategoryId,
      matchSource: "single_option",
    };
  }

  return unmatched();
}

export type SbBlockMappingRow = {
  fifaBlockName: string;
  fifaBlockId: string;
  fifaCategoryName: string;
  fifaCategoryNum: SbCategoryNum | null;
  sbCategoryId: string;
  sbCategoryLabel: string;
  sbBlockCode: string | null;
  sbBlockRowId: string | null;
  matched: boolean;
  matchSource: SbBlockMatchSource;
  seatCount: number;
  offerCount: number;
};

/** Unique FIFA block → SB section mapping for push preview UI. */
export function buildSbBlockMappingRows(
  offers: TransformedSeatOffer[],
  catalog: SbMatchCatalog | null,
): SbBlockMappingRow[] {
  const byKey = new Map<
    string,
    {
      fifaBlockName: string;
      fifaBlockId: string;
      fifaCategoryName: string;
      fifaCategoryId: string;
      seatCount: number;
      offerCount: number;
    }
  >();

  for (const offer of offers) {
    const first = offer.seats[0];
    if (!first) continue;
    const key = `${first.categoryId}|${first.blockId}`;
    const row = byKey.get(key);
    if (row) {
      row.seatCount += offer.seats.length;
      row.offerCount += 1;
    } else {
      byKey.set(key, {
        fifaBlockName: first.blockName,
        fifaBlockId: first.blockId,
        fifaCategoryName: first.categoryName,
        fifaCategoryId: first.categoryId,
        seatCount: offer.seats.length,
        offerCount: 1,
      });
    }
  }

  const out: SbBlockMappingRow[] = [];
  for (const row of byKey.values()) {
    const { sbCategoryId, categoryNum, categoryLabel } = resolveSbCategoryFromCatalog(
      catalog,
      row.fifaCategoryName,
      row.fifaCategoryId,
    );
    const block = resolveSbBlockFromCatalog(
      catalog,
      sbCategoryId,
      row.fifaBlockName,
      row.fifaBlockId,
    );
    const matchedCategory = catalog?.categories.find((c) => c.id === block.matchedSbCategoryId);
    out.push({
      fifaBlockName: row.fifaBlockName,
      fifaBlockId: row.fifaBlockId,
      fifaCategoryName: row.fifaCategoryName,
      fifaCategoryNum: categoryNum,
      sbCategoryId: block.matchedSbCategoryId,
      sbCategoryLabel: matchedCategory?.name ?? categoryLabel,
      sbBlockCode: block.sbBlockCode || null,
      sbBlockRowId: block.sbBlockRowId || null,
      matched: block.matched,
      matchSource: block.matchSource,
      seatCount: row.seatCount,
      offerCount: row.offerCount,
    });
  }

  return out.sort((a, b) => {
    const cat = (a.fifaCategoryName ?? "").localeCompare(b.fifaCategoryName ?? "");
    if (cat !== 0) return cat;
    return a.fifaBlockName.localeCompare(b.fifaBlockName, undefined, { numeric: true });
  });
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

  const blocksByCategoryId = new Map<string, SbBlockOption[]>();
  for (const cat of categories) {
    if (cat.categoryNum == null || cat.categoryNum < 1 || cat.categoryNum > 4) continue;
    const blockRes = await sbGetTicketBlocks(matchId, cat.id, config);
    blocksByCategoryId.set(
      cat.id,
      blockRes.ok ? parseSbTicketBlocks(blockRes.data) : [],
    );
  }

  return { categories, blocksByCategoryId, dropdownError };
}
