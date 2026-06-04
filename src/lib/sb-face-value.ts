import fs from "node:fs";
import path from "node:path";
import { CataloguePriceSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type SbFaceValueSource =
  | "shop_event_category"
  | "event_category_block_price"
  | "catalogue_snapshot";

export type SbFaceValueLookup = {
  byId: Map<string, number>;
  byName: Map<string, number>;
  sourcesPresent: SbFaceValueSource[];
};

const SOURCE_LABELS: Record<SbFaceValueSource, string> = {
  shop_event_category: "shop_event_category (face value webhook)",
  event_category_block_price: "event_category_block_prices",
  catalogue_snapshot: "prisma/catalogues snapshot",
};

function faceValueKey(categoryId: string, blockId: string): string {
  return `${categoryId.trim()}::${blockId.trim()}`;
}

function faceValueNameKey(categoryName: string, blockName: string): string {
  return `${normalizeFaceValueName(categoryName)}::${normalizeFaceValueName(blockName)}`;
}

function normalizeFaceValueName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function decimalToUsd(value: { toString(): string } | null | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseFloat(value.toString());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function setIdIfAbsent(lookup: SbFaceValueLookup, categoryId: string, blockId: string, usd: number): void {
  const cat = categoryId.trim();
  const blk = blockId.trim();
  if (!cat || !Number.isFinite(usd) || usd <= 0) return;

  const exactKey = faceValueKey(cat, blk);
  if (!lookup.byId.has(exactKey)) lookup.byId.set(exactKey, usd);

  if (blk) {
    const catOnlyKey = faceValueKey(cat, "");
    if (!lookup.byId.has(catOnlyKey)) lookup.byId.set(catOnlyKey, usd);
  }
}

function setNameIfAbsent(
  lookup: SbFaceValueLookup,
  categoryName: string,
  blockName: string,
  usd: number,
): void {
  const catName = categoryName.trim();
  const blkName = blockName.trim();
  if (!catName || !Number.isFinite(usd) || usd <= 0) return;

  if (blkName) {
    const exactKey = faceValueNameKey(catName, blkName);
    if (!lookup.byName.has(exactKey)) lookup.byName.set(exactKey, usd);
  }

  const catOnlyKey = faceValueNameKey(catName, "");
  if (!lookup.byName.has(catOnlyKey)) lookup.byName.set(catOnlyKey, usd);
}

/** Upstream integer amounts are thousandths of USD (÷ 1000), rounded half-up to cents. */
function milliDigitsToUsd(milliDigits: string): number | null {
  const digits = milliDigits.replace(/^0+(?=\d)/, "");
  if (!digits) return null;
  try {
    const mills = BigInt(digits);
    const centsTotal = (mills + BigInt(5)) / BigInt(10);
    const dollars = Number(centsTotal / BigInt(100));
    const cents = Number(centsTotal % BigInt(100));
    const usd = dollars + cents / 100;
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

function coerceCatalogueMinUsd(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) && value >= 0 && Number.isSafeInteger(value)) {
      return milliDigitsToUsd(String(value));
    }
    return value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) return milliDigitsToUsd(t);
    const n = Number.parseFloat(t.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function localizedCatalogueName(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const o = raw as Record<string, unknown>;
  for (const k of ["en", "de", "fr", "es", "pt", "default"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function mergeShopEventCategoryRows(
  lookup: SbFaceValueLookup,
  rows: Array<{
    categoryId: string;
    categoryName: string;
    categoryBlockId: string;
    categoryBlockName: string;
    categoryPrice: { toString(): string } | null;
    blockPrice: { toString(): string } | null;
  }>,
): void {
  if (rows.length === 0) return;
  lookup.sourcesPresent.push("shop_event_category");

  for (const row of rows) {
    const categoryId = row.categoryId.trim();
    const blockId = row.categoryBlockId.trim();
    const categoryName = row.categoryName.trim();
    const blockName = row.categoryBlockName.trim();
    if (!categoryId || !blockId) continue;

    const blockUsd = decimalToUsd(row.blockPrice);
    const categoryUsd = decimalToUsd(row.categoryPrice);
    const faceUsd = blockUsd ?? categoryUsd;
    if (faceUsd == null) continue;

    lookup.byId.set(faceValueKey(categoryId, blockId), faceUsd);
    const catOnlyKey = faceValueKey(categoryId, "");
    if (!lookup.byId.has(catOnlyKey) && categoryUsd != null) {
      lookup.byId.set(catOnlyKey, categoryUsd);
    }

    if (categoryName) {
      setNameIfAbsent(lookup, categoryName, blockName, faceUsd);
      if (categoryUsd != null) setNameIfAbsent(lookup, categoryName, "", categoryUsd);
    }
  }
}

function mergeEventCategoryBlockPrices(
  lookup: SbFaceValueLookup,
  rows: Array<{
    categoryId: string;
    categoryBlockId: string;
    minPrice: { toString(): string };
    catalogueSource: CataloguePriceSource;
  }>,
  nameByBlockKey: Map<string, { categoryName: string; blockName: string }>,
): void {
  if (rows.length === 0) return;
  lookup.sourcesPresent.push("event_category_block_price");

  const resaleFirst = [...rows].sort((a, b) => {
    const rank = (s: CataloguePriceSource) => (s === CataloguePriceSource.RESELL_PREF ? 0 : 1);
    return rank(a.catalogueSource) - rank(b.catalogueSource);
  });

  const categoryMin = new Map<string, number>();

  for (const row of resaleFirst) {
    const usd = decimalToUsd(row.minPrice);
    if (usd == null) continue;

    const cat = row.categoryId.trim();
    const blk = row.categoryBlockId.trim();
    if (!cat || !blk) continue;

    setIdIfAbsent(lookup, cat, blk, usd);

    const prev = categoryMin.get(cat);
    if (prev == null || usd < prev) categoryMin.set(cat, usd);

    const names = nameByBlockKey.get(faceValueKey(cat, blk));
    if (names) setNameIfAbsent(lookup, names.categoryName, names.blockName, usd);
  }

  for (const [cat, usd] of categoryMin) {
    setIdIfAbsent(lookup, cat, "", usd);
    for (const [key, names] of nameByBlockKey) {
      if (key.startsWith(`${cat}::`) && names.categoryName) {
        setNameIfAbsent(lookup, names.categoryName, "", usd);
        break;
      }
    }
  }
}

function mergeCatalogueSnapshotFile(
  lookup: SbFaceValueLookup,
  prefId: string,
  nameByBlockKey: Map<string, { categoryName: string; blockName: string }>,
): void {
  const abs = path.join(process.cwd(), "prisma", "catalogues", `catalogue-${prefId}.json`);
  if (!fs.existsSync(abs)) return;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const categories = (raw as Record<string, unknown>).categories;
  if (!Array.isArray(categories) || categories.length === 0) return;

  let mergedAny = false;

  for (const cat of categories) {
    if (!cat || typeof cat !== "object" || Array.isArray(cat)) continue;
    const c = cat as Record<string, unknown>;
    const categoryId = String(c.id ?? "").trim();
    const categoryName = localizedCatalogueName(c.name);
    const categoryUsd = coerceCatalogueMinUsd(c.minPrice ?? c.maxPrice);
    const blocks = c.blocks;
    if (!categoryId || !Array.isArray(blocks)) continue;

    for (const block of blocks) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      const b = block as Record<string, unknown>;
      const blockId = String(b.id ?? "").trim();
      const blockName = localizedCatalogueName(b.name);
      const blockUsd = coerceCatalogueMinUsd(b.minPrice ?? b.min ?? b.maxPrice) ?? categoryUsd;
      if (!blockId || blockUsd == null) continue;

      const before = lookup.byId.size;
      setIdIfAbsent(lookup, categoryId, blockId, blockUsd);
      if (lookup.byId.size > before) mergedAny = true;

      if (categoryName) {
        setNameIfAbsent(lookup, categoryName, blockName, blockUsd);
        nameByBlockKey.set(faceValueKey(categoryId, blockId), { categoryName, blockName });
      }
    }

    if (categoryUsd != null) {
      const before = lookup.byId.size;
      setIdIfAbsent(lookup, categoryId, "", categoryUsd);
      if (lookup.byId.size > before) mergedAny = true;
      if (categoryName) setNameIfAbsent(lookup, categoryName, "", categoryUsd);
    }
  }

  if (mergedAny) lookup.sourcesPresent.push("catalogue_snapshot");
}

/** Whole-dollar face value for SB ticket/create (same rounding as listing price). */
export function formatFaceValueForSb(faceValueUsd: number | null): string | null {
  if (faceValueUsd == null || !Number.isFinite(faceValueUsd) || faceValueUsd <= 0) return null;
  return String(Math.max(1, Math.round(faceValueUsd)));
}

function createEmptyLookup(): SbFaceValueLookup {
  return { byId: new Map(), byName: new Map(), sourcesPresent: [] };
}

/**
 * Face values for SB ticket/create.
 * Priority: shop_event_category → event_category_block_prices → prisma/catalogues snapshot.
 * Keys: FIFA `categoryId::blockId` (and category-only), plus normalized category/block names.
 */
export async function loadSbFaceValueLookup(eventId: number): Promise<SbFaceValueLookup> {
  const lookup = createEmptyLookup();

  const [shopRows, blockPriceRows, eventCategoryRows, event] = await Promise.all([
    prisma.shopEventCategoryBlock.findMany({
      where: { eventId },
      select: {
        categoryId: true,
        categoryName: true,
        categoryBlockId: true,
        categoryBlockName: true,
        categoryPrice: true,
        blockPrice: true,
      },
    }),
    prisma.eventCategoryBlockPrice.findMany({
      where: { eventId },
      select: {
        categoryId: true,
        categoryBlockId: true,
        minPrice: true,
        catalogueSource: true,
      },
    }),
    prisma.eventCategory.findMany({
      where: { eventId },
      select: {
        categoryId: true,
        categoryName: true,
        categoryBlockId: true,
        categoryBlockName: true,
      },
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { prefId: true, resalePrefId: true },
    }),
  ]);

  const nameByBlockKey = new Map<string, { categoryName: string; blockName: string }>();
  for (const row of eventCategoryRows) {
    const cat = row.categoryId.trim();
    const blk = row.categoryBlockId.trim();
    if (!cat || !blk) continue;
    nameByBlockKey.set(faceValueKey(cat, blk), {
      categoryName: row.categoryName.trim(),
      blockName: row.categoryBlockName.trim(),
    });
  }
  for (const row of shopRows) {
    const cat = row.categoryId.trim();
    const blk = row.categoryBlockId.trim();
    if (!cat || !blk) continue;
    nameByBlockKey.set(faceValueKey(cat, blk), {
      categoryName: row.categoryName.trim(),
      blockName: row.categoryBlockName.trim(),
    });
  }

  mergeShopEventCategoryRows(lookup, shopRows);
  mergeEventCategoryBlockPrices(lookup, blockPriceRows, nameByBlockKey);

  const prefIds = [event?.resalePrefId?.trim(), event?.prefId?.trim()].filter(
    (p): p is string => Boolean(p),
  );
  for (const prefId of [...new Set(prefIds)]) {
    mergeCatalogueSnapshotFile(lookup, prefId, nameByBlockKey);
  }

  return lookup;
}

export function resolveFaceValueUsd(
  lookup: SbFaceValueLookup | null | undefined,
  categoryId: string,
  blockId: string,
  categoryName?: string,
  blockName?: string,
): number | null {
  if (!lookup) return null;
  const cat = categoryId.trim();
  const blk = blockId.trim();
  const catName = categoryName?.trim() ?? "";
  const blkName = blockName?.trim() ?? "";

  if (cat) {
    if (blk) {
      const exact = lookup.byId.get(faceValueKey(cat, blk));
      if (exact != null) return exact;
    }
    const catOnly = lookup.byId.get(faceValueKey(cat, ""));
    if (catOnly != null) return catOnly;
  }

  if (catName) {
    if (blkName) {
      const exactName = lookup.byName.get(faceValueNameKey(catName, blkName));
      if (exactName != null) return exactName;
    }
    const catOnlyName = lookup.byName.get(faceValueNameKey(catName, ""));
    if (catOnlyName != null) return catOnlyName;
  }

  return null;
}

export type SbFaceValueResolution = {
  faceValueUsd: number | null;
  /** True when lookup missed and listing price (after markup) was used instead. */
  defaultedToListingPrice: boolean;
};

/** Resolve face value for SB ticket/create: lookup chain, then listing price fallback. */
export function resolveFaceValueUsdForSb(
  lookup: SbFaceValueLookup | null | undefined,
  categoryId: string,
  blockId: string,
  categoryName: string | undefined,
  blockName: string | undefined,
  listingPriceUsd: number | null,
): SbFaceValueResolution {
  const fromLookup = resolveFaceValueUsd(lookup, categoryId, blockId, categoryName, blockName);
  if (fromLookup != null) {
    return { faceValueUsd: fromLookup, defaultedToListingPrice: false };
  }
  if (listingPriceUsd != null && Number.isFinite(listingPriceUsd) && listingPriceUsd > 0) {
    return { faceValueUsd: listingPriceUsd, defaultedToListingPrice: true };
  }
  return { faceValueUsd: null, defaultedToListingPrice: false };
}

export function formatSbFaceValueDefaultedToPriceNote(): string {
  return "face_value defaulted to listing price (no shop/catalogue/block-price match for this category × block).";
}

export function formatSbMissingFaceValueWarning(lookup?: SbFaceValueLookup | null): string {
  const checked = lookup?.sourcesPresent?.length
    ? lookup.sourcesPresent.map((s) => SOURCE_LABELS[s]).join("; ")
    : "none (no price rows loaded for this event)";
  return (
    `face_value cannot be sent — listing price is missing or zero and no shop/catalogue match for this category × block (checked: ${checked}). ` +
    "Set a valid resale price, or POST shop event category blocks (face value webhook) / sync event-category-prices, then refresh preview."
  );
}

/** @deprecated Prefer formatSbMissingFaceValueWarning(lookup) for diagnostics. */
export const SB_MISSING_FACE_VALUE_WARNING = formatSbMissingFaceValueWarning(null);
