import "server-only";

import type { SeatsidekickMatchResponse } from "@/lib/seatsidekick-types";

const DEFAULT_BASE = "https://seatsidekick.com/api/match";
const FETCH_TIMEOUT_MS = 12_000;

function apiBase(): string {
  return (process.env.SEATSIDEKICK_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, "");
}

export async function fetchSeatsidekickMatch(performanceId: string): Promise<SeatsidekickMatchResponse> {
  const id = performanceId.trim();
  if (!id) throw new Error("performanceId required");

  const url = `${apiBase()}/${encodeURIComponent(id)}`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`SeatSidekick HTTP ${res.status} for ${id}`);
    }
    const json = (await res.json()) as SeatsidekickMatchResponse;
    if (!json || typeof json !== "object") {
      throw new Error(`SeatSidekick invalid JSON for ${id}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}
