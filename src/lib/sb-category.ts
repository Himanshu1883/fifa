/** FIFA / sock category label → SeatsBrokers ticket_category (1–4). */
export type SbCategoryNum = 1 | 2 | 3 | 4;

/**
 * Fixed SeatsBrokers `ticket_category` id per FIFA Category 1–4.
 * Never overridden by catalog lookup or cross-category block match.
 */
export const STRICT_SB_TICKET_CATEGORY_BY_NUM: Record<SbCategoryNum, string> = {
  1: "16",
  2: "15",
  3: "14",
  4: "13",
};

export function strictSbTicketCategoryId(categoryNum: SbCategoryNum): string {
  return STRICT_SB_TICKET_CATEGORY_BY_NUM[categoryNum];
}

export function strictSbTicketCategoryIdFromListing(
  categoryName: string,
  categoryId?: string | null,
): string | null {
  const categoryNum = resolveSbCategoryNum(categoryName, categoryId);
  return categoryNum != null ? strictSbTicketCategoryId(categoryNum) : null;
}

const CATEGORY_VARIANT_RE = /\b(front|wheelchair|accessible|accessibility|ada)\b/i;

function normalizedCategoryName(name: string): string {
  return String(name ?? "").trim().toLowerCase();
}

/** True when the label denotes a variant (front row, wheelchair, etc.), not plain Cat 1–4. */
export function hasCategoryVariantQualifier(name: string): boolean {
  return CATEGORY_VARIANT_RE.test(normalizedCategoryName(name));
}

/**
 * Plain SB category from name only — "Category 3" / "Cat 3", not "Front Category 3" or wheelchair labels.
 */
export function plainCategoryNumFromName(name: string): SbCategoryNum | null {
  const s = normalizedCategoryName(name);
  if (!s || hasCategoryVariantQualifier(s)) return null;
  const m = s.match(/^(?:category|cat)\s*(\d)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

/** Strict plain-category check for Cat 1–4 filter toggles. */
export function isPlainCategoryNum(
  categoryName: string,
  _categoryId: string | null | undefined,
  num: SbCategoryNum,
): boolean {
  return plainCategoryNumFromName(categoryName) === num;
}

/** Plain category only — for filters; excludes front/wheelchair/accessibility variants. */
export function resolvePlainSbCategoryNum(
  categoryName: string,
  _categoryId?: string | null,
): SbCategoryNum | null {
  return plainCategoryNumFromName(categoryName);
}

/** Parse "Category 1", "Front Category 2", "Cat 3", etc. */
export function categoryNumFromCategoryName(name: string): SbCategoryNum | null {
  const s = String(name ?? "").trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/(?:^|\s|-)cat(?:egory)?\s*(\d)\b/i) ?? s.match(/\bcategory\s*(\d)\b/i);
  if (m) {
    const n = Number.parseInt(m[1] ?? "", 10);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  }
  const loose = s.match(/(\d+)/);
  if (!loose) return null;
  const n = Number.parseInt(loose[1] ?? "", 10);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

export function categoryNumFromCategoryId(categoryId: string | null | undefined): SbCategoryNum | null {
  const id = String(categoryId ?? "").trim();
  if (id === "1" || id === "2" || id === "3" || id === "4") return Number(id) as SbCategoryNum;
  return null;
}

export function resolveSbCategoryNum(
  categoryName: string,
  categoryId?: string | null,
): SbCategoryNum | null {
  return categoryNumFromCategoryName(categoryName) ?? categoryNumFromCategoryId(categoryId);
}

/** Value for SB `ticket_category` form field. Uses strict 16/15/14/13 when mappable to Cat 1–4. */
export function sbTicketCategoryField(
  categoryName: string,
  categoryId?: string | null,
): { ticketCategory: string; categoryNum: SbCategoryNum | null } {
  const categoryNum = resolveSbCategoryNum(categoryName, categoryId);
  if (categoryNum != null) {
    return { ticketCategory: strictSbTicketCategoryId(categoryNum), categoryNum };
  }
  const id = String(categoryId ?? "").trim();
  return { ticketCategory: id, categoryNum: null };
}

export function formatSbCategoryLabel(categoryNum: SbCategoryNum | null, categoryName?: string): string {
  if (categoryNum != null) return `Category ${categoryNum}`;
  const name = String(categoryName ?? "").trim();
  return name || "—";
}
