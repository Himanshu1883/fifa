import { NextResponse } from "next/server";

import { sbGetTournament, sbListEvents, sbListTickets } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { formatSeatsBrokersFetchError } from "@/lib/seatsbrokers-errors";
import {
  parseSbEventsResponse,
  parseSbTournaments,
  suggestSbMatchForEventName,
  type SbMatchOption,
  type SbTournamentOption,
} from "@/lib/seatsbrokers-parse";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const config = getSeatsBrokersConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const tournamentIdParam = url.searchParams.get("tournamentId")?.trim() ?? "";
  const matchIdParam = url.searchParams.get("matchId")?.trim() ?? "";
  const eventNameParam = url.searchParams.get("eventName")?.trim() ?? "";

  try {
    if (matchIdParam) {
      const tickets = await sbListTickets(matchIdParam, config);
      return NextResponse.json({
        ok: tickets.ok,
        matchId: matchIdParam,
        tickets: tickets.ok ? tickets.data : null,
        ticketsError: tickets.ok ? undefined : tickets.error,
        ticketsStatus: tickets.status,
        ticketsRaw: tickets.raw,
      });
    }

    const tournamentId = tournamentIdParam || config.defaultTournamentId;
    let tournamentData: unknown = null;
    let tournamentError: string | undefined;
    let tournaments: SbTournamentOption[] = [];

    const tournament = await sbGetTournament(config);
    if (tournament.ok) {
      tournamentData = tournament.data;
      tournaments = parseSbTournaments(tournament.data);
    } else {
      tournamentError = tournament.error;
    }

    const events = await sbListEvents(tournamentId, config);
    if (!events.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: events.error,
          tournamentId,
          tournament: tournamentData,
          tournamentError,
          eventsStatus: events.status,
          eventsRaw: events.raw,
        },
        { status: 502 },
      );
    }

    const matches: SbMatchOption[] = parseSbEventsResponse(events.data);
    const suggested =
      eventNameParam && matches.length > 0
        ? suggestSbMatchForEventName(eventNameParam, matches)
        : null;

    let suggestedDetail: unknown = null;
    if (suggested) {
      const tickets = await sbListTickets(suggested.matchId, config);
      suggestedDetail = {
        match: suggested,
        tickets: tickets.ok ? tickets.data : null,
        ticketsError: tickets.ok ? undefined : tickets.error,
        ticketsStatus: tickets.status,
      };
    }

    return NextResponse.json({
      ok: true,
      baseUrl: config.baseUrl,
      defaultTournamentId: config.defaultTournamentId,
      tournamentId,
      tournaments,
      tournament: tournamentData,
      tournamentError,
      events: events.data,
      eventsRaw: events.raw,
      matches,
      suggested,
      suggestedDetail,
    });
  } catch (e) {
    const message = formatSeatsBrokersFetchError(e);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
