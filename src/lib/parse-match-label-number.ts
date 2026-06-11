/** Whole-string labels like Match1, Match 72, MATCH 42 (optional space after "Match"). */
const MATCH_LABEL_NUM = /^match\s*(\d+)$/i;
/** Prefix labels like Match3 — Canada vs … (match number before a title separator). */
const MATCH_LABEL_PREFIX = /^match\s*(\d+)(?:\s*[—–\-:|]\s*|\s+)/i;

function parseOne(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const whole = MATCH_LABEL_NUM.exec(t);
  if (whole) return Number(whole[1]);
  const prefix = MATCH_LABEL_PREFIX.exec(t);
  if (prefix) return Number(prefix[1]);
  return null;
}

/** Prefer catalogue `matchLabel`, then fall back to `name` (same order as maintenance scripts). */
export function parseEventMatchNumber(matchLabel: string, name: string): number | null {
  return parseOne(matchLabel) ?? parseOne(name);
}
