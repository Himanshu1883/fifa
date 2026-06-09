import "server-only";

import { sbListEvents } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { parseSbEventsResponse, sbMatchDisplayName } from "@/lib/seatsbrokers-parse";

const CACHE_TTL_MS = 5 * 60 * 1000;

type LabelCacheEntry = {
  expiresAt: number;
  labelsByMatchId: Map<string, string>;
};

let labelCache: LabelCacheEntry | null = null;
let labelLoadPromise: Promise<Map<string, string>> | null = null;

function uniqueNonEmptyIds(matchIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matchIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function loadAllSbMatchLabels(tournamentId?: string): Promise<Map<string, string>> {
  const config = getSeatsBrokersConfig();
  if (!config) return new Map();

  const now = Date.now();
  if (labelCache && labelCache.expiresAt > now) {
    return labelCache.labelsByMatchId;
  }

  if (!labelLoadPromise) {
    labelLoadPromise = (async () => {
      const events = await sbListEvents(tournamentId ?? config.defaultTournamentId, config);
      const labelsByMatchId = new Map<string, string>();
      if (events.ok) {
        for (const match of parseSbEventsResponse(events.data)) {
          labelsByMatchId.set(match.matchId, sbMatchDisplayName(match));
        }
      }
      labelCache = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        labelsByMatchId,
      };
      return labelsByMatchId;
    })().finally(() => {
      labelLoadPromise = null;
    });
  }

  return labelLoadPromise;
}

/** Resolve SB match display names for many ids with at most one SB events API call. */
export async function resolveSbMatchLabels(
  matchIds: Iterable<string>,
  opts?: { tournamentId?: string },
): Promise<Record<string, string>> {
  const ids = uniqueNonEmptyIds(matchIds);
  if (ids.length === 0) return {};

  const allLabels = await loadAllSbMatchLabels(opts?.tournamentId);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const label = allLabels.get(id);
    if (label) out[id] = label;
  }
  return out;
}

export async function resolveSbMatchLabel(matchId: string): Promise<string | null> {
  const labels = await resolveSbMatchLabels([matchId]);
  return labels[matchId.trim()] ?? null;
}
