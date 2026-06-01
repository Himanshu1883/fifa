import { parseEventDateInput } from "@/lib/sb-date-to-ship";

export type SbMatchOption = {
  matchId: string;
  label: string;
  raw: Record<string, unknown>;
  eventDate: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Best-effort match kickoff / event date from SB POST /events row. */
export function parseSbMatchEventDate(raw: Record<string, unknown>): string | null {
  for (const k of [
    "match_date",
    "matchDate",
    "event_date",
    "eventDate",
    "date",
    "start_date",
    "startDate",
    "match_start_date",
    "matchStartDate",
  ]) {
    const v = raw[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const parsed = parseEventDateInput(s);
    if (parsed) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseMatchRow(row: unknown): SbMatchOption | null {
  const obj = asRecord(row);
  if (!obj) return null;

  const matchId = pickString(obj, [
    "match_id",
    "matchId",
    "id",
    "event_id",
    "eventId",
    "sb_match_id",
    "sb_event_id",
  ]);
  if (!matchId) return null;

  const name = pickString(obj, [
    "match_name",
    "event_name",
    "name",
    "title",
    "label",
    "description",
    "match_title",
  ]);

  const label = name ? `${name} (${matchId})` : `Match ${matchId}`;
  const eventDate = parseSbMatchEventDate(obj);
  return { matchId, label, raw: obj, eventDate };
}

function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];

  for (const key of ["events", "matches", "data", "result", "items", "list"]) {
    const v = obj[key];
    if (Array.isArray(v)) return v;
  }

  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length > 0 && asRecord(v[0])) return v;
  }

  return [];
}

export function parseSbEventsResponse(data: unknown): SbMatchOption[] {
  const rows = extractArray(data);
  const out: SbMatchOption[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const parsed = parseMatchRow(row);
    if (!parsed || seen.has(parsed.matchId)) continue;
    seen.add(parsed.matchId);
    out.push(parsed);
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export type SbTournamentOption = { id: string; name: string };

export function parseSbTournaments(data: unknown): SbTournamentOption[] {
  const rows = extractArray(data);
  const out: SbTournamentOption[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const obj = asRecord(row);
    if (!obj) continue;
    const id = pickString(obj, ["id", "tournament_id", "tournamentId"]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = pickString(obj, ["tournament_name", "name", "title"]) || `Tournament ${id}`;
    out.push({ id, name });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function parseSbTournamentId(data: unknown): string | null {
  const rows = extractArray(data);
  if (rows.length > 0) {
    const first = parseMatchRow(rows[0]);
    if (first) {
      const id = pickString(first.raw, ["tournament_id", "tournamentId"]);
      if (id) return id;
    }
    const obj = asRecord(rows[0]);
    if (obj) {
      const id = pickString(obj, ["tournament_id", "tournamentId", "id"]);
      if (id) return id;
    }
  }

  const obj = asRecord(data);
  if (obj) {
    const id = pickString(obj, ["tournament_id", "tournamentId", "id"]);
    if (id) return id;
    const inner = extractArray(data);
    if (inner[0]) {
      const o = asRecord(inner[0]);
      if (o) return pickString(o, ["id", "tournament_id"]) || null;
    }
  }

  return null;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Best SB match for a local event name, if any. */
export function suggestSbMatchForEventName(
  eventName: string,
  matches: SbMatchOption[],
): SbMatchOption | null {
  const target = normName(eventName);
  if (!target || matches.length === 0) return null;

  let best: SbMatchOption | null = null;
  let bestScore = 0;

  for (const m of matches) {
    const labelNorm = normName(m.label);
    const rawName = pickString(m.raw, ["match_name", "event_name", "name", "title"]);
    const rawNorm = normName(rawName);

    let score = 0;
    if (rawNorm && (rawNorm.includes(target) || target.includes(rawNorm))) score = 90;
    else if (labelNorm.includes(target) || target.includes(labelNorm)) score = 70;
    else {
      const targetParts = target.split(/\s+/).filter(Boolean);
      const rawParts = rawNorm.split(/\s+/).filter(Boolean);
      const overlap = targetParts.filter((p) => rawParts.some((r) => r.includes(p) || p.includes(r))).length;
      score = overlap * 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return bestScore >= 20 ? best : null;
}

/** Count existing SB ticket rows from POST /ticket response. */
export function countSbTicketListings(data: unknown): number | null {
  if (data == null) return null;
  const rows = extractArray(data);
  if (rows.length > 0) return rows.length;
  const obj = asRecord(data);
  if (!obj) return null;
  if (obj.status === 0 || obj.status === "0") return 0;
  if ("result" in obj && Array.isArray(obj.result) && obj.result.length === 0) return 0;
  return null;
}
