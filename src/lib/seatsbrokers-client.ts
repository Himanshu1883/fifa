import { requireSeatsBrokersConfig, type SeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { formatSeatsBrokersError, formatSeatsBrokersFetchError } from "@/lib/seatsbrokers-errors";

export type SeatsBrokersApiResult<T = unknown> =
  | { ok: true; status: number; data: T; raw: string }
  | { ok: false; status: number; error: string; raw: string };

const SB_FETCH_TIMEOUT_MS = 25_000;

function resolveUrl(config: SeatsBrokersConfig, path: string): string {
  const clean = path.replace(/^\//, "");
  return new URL(clean, config.baseUrl).toString();
}

async function parseResponse(res: Response): Promise<SeatsBrokersApiResult> {
  const raw = await res.text();
  let data: unknown = raw;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    /* plain text body */
  }

  if (!res.ok) {
    const jsonMsg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : null;
    const errMsg = formatSeatsBrokersError(res.status, jsonMsg ?? raw, res.statusText || "Request failed");
    return { ok: false, status: res.status, error: errMsg, raw };
  }

  return { ok: true, status: res.status, data, raw };
}

async function sbFetch(config: SeatsBrokersConfig, path: string, init: RequestInit): Promise<SeatsBrokersApiResult> {
  try {
    const res = await fetch(resolveUrl(config, path), {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(SB_FETCH_TIMEOUT_MS),
    });
    return parseResponse(res);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: formatSeatsBrokersFetchError(e),
      raw: "",
    };
  }
}

async function postForm(
  config: SeatsBrokersConfig,
  path: string,
  fields: Record<string, string>,
): Promise<SeatsBrokersApiResult> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== "") form.append(key, value);
  }

  return sbFetch(config, path, {
    method: "POST",
    headers: { apiKey: config.apiKey },
    body: form,
  });
}

async function getJson(config: SeatsBrokersConfig, path: string): Promise<SeatsBrokersApiResult> {
  return sbFetch(config, path, {
    method: "GET",
    headers: { apiKey: config.apiKey },
  });
}

export async function sbGetTournament(config?: SeatsBrokersConfig) {
  return getJson(config ?? requireSeatsBrokersConfig(), "tournament");
}

export async function sbListEvents(tournamentId: string, config?: SeatsBrokersConfig) {
  return postForm(config ?? requireSeatsBrokersConfig(), "events", { tournament_id: tournamentId });
}

export async function sbListTickets(matchId: string, config?: SeatsBrokersConfig) {
  return postForm(config ?? requireSeatsBrokersConfig(), "ticket", { match_id: matchId });
}

export async function sbCreateTicket(
  fields: Record<string, string>,
  config?: SeatsBrokersConfig,
): Promise<SeatsBrokersApiResult> {
  return postForm(config ?? requireSeatsBrokersConfig(), "ticket/create", fields);
}

export async function sbGetTicketDropdown(matchId: string, config?: SeatsBrokersConfig) {
  return postForm(config ?? requireSeatsBrokersConfig(), "ticket_dropdown", { match_id: matchId });
}
