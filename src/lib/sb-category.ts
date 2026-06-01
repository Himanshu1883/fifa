/** FIFA / sock category label → SeatsBrokers ticket_category (1–4). */
export type SbCategoryNum = 1 | 2 | 3 | 4;

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

/** Value for SB `ticket_category` form field (1–4). Falls back to raw id if unmappable. */
export function sbTicketCategoryField(
  categoryName: string,
  categoryId?: string | null,
): { ticketCategory: string; categoryNum: SbCategoryNum | null } {
  const categoryNum = resolveSbCategoryNum(categoryName, categoryId);
  if (categoryNum != null) {
    return { ticketCategory: String(categoryNum), categoryNum };
  }
  const id = String(categoryId ?? "").trim();
  return { ticketCategory: id, categoryNum: null };
}

export function formatSbCategoryLabel(categoryNum: SbCategoryNum | null, categoryName?: string): string {
  if (categoryNum != null) return `Category ${categoryNum}`;
  const name = String(categoryName ?? "").trim();
  return name || "—";
}
