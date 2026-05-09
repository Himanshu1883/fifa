const CENTS_PER_USD = 100;

export function priceToNumber(value: string): number {
  const s = String(value).trim().replace(/,/g, "");
  if (!s) return Number.NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Amount string is minor units (cents) per DB Decimal, same as seat listings panel. */
export function formatUsd(value: string): string {
  const n = priceToNumber(value);
  if (!Number.isFinite(n)) return "—";
  const dollars = n / CENTS_PER_USD;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatUsdRangeFromAmounts(amounts: string[]): string {
  const vals = amounts
    .map((s) => priceToNumber(s))
    .filter((n): n is number => Number.isFinite(n));
  if (vals.length === 0) return "—";
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (lo === hi) return formatUsd(String(lo));
  return `${formatUsd(String(lo))}–${formatUsd(String(hi))}`;
}
