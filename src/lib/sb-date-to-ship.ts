/** Format calendar date as YYYY-MM-DD (UTC date parts). */
export function formatDateYyyyMmDd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD or ISO datetime to UTC noon date-only. */
export function parseEventDateInput(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0, 0));
  }
  const s = String(value).trim();
  if (!s) return null;
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const y = Number.parseInt(dateOnly[1]!, 10);
    const m = Number.parseInt(dateOnly[2]!, 10) - 1;
    const day = Number.parseInt(dateOnly[3]!, 10);
    const d = new Date(Date.UTC(y, m, day, 12, 0, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

/** SeatsBrokers date_to_ship = event date minus 2 calendar days. */
export function computeDateToShip(eventDate: string | Date | null | undefined): string | null {
  const base = parseEventDateInput(eventDate);
  if (!base) return null;
  const ship = new Date(base);
  ship.setUTCDate(ship.getUTCDate() - 2);
  return formatDateYyyyMmDd(ship);
}
