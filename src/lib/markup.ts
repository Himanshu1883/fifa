/** Apply markup percent to a price in USD cents (e.g. 50 → multiply by 1.5). */
export function applyMarkupPercentToCents(cents: number, markupPercent: number): number {
  if (!Number.isFinite(cents)) return cents;
  if (!Number.isFinite(markupPercent) || markupPercent === 0) return cents;
  return cents * (1 + markupPercent / 100);
}

export function parseMarkupPercentInput(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const s = raw.trim();
  if (s === "") return { ok: false, message: "Enter a markup percentage." };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, message: "Markup must be a non-negative number." };
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false, message: "Markup must be zero or greater." };
  if (n > 1000) return { ok: false, message: "Markup cannot exceed 1000%." };
  return { ok: true, value: n };
}
