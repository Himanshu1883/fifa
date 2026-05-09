/** Whole-string labels like Match1, Match 72, MATCH 42 (optional space after "Match"). */
const MATCH_LABEL_NUM = /^match\s*(\d+)$/i;

function parseOne(s: string): number | null {
  const m = MATCH_LABEL_NUM.exec(s.trim());
  if (!m) return null;
  return Number(m[1]);
}

/** Prefer catalogue `matchLabel`, then fall back to `name` (same order as maintenance scripts). */
export function parseEventMatchNumber(matchLabel: string, name: string): number | null {
  return parseOne(matchLabel) ?? parseOne(name);
}
