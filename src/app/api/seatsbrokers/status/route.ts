import { NextResponse } from "next/server";

import { sbGetTournament, sbListTickets } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const runtime = "nodejs";

/** GET — verify SeatsBrokers credentials; optional ?matchId= for list tickets test */
export async function GET(req: Request) {
  const config = getSeatsBrokersConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId")?.trim();

  try {
    const tournament = await sbGetTournament(config);
    if (!tournament.ok) {
      return NextResponse.json(
        { ok: false, step: "tournament", status: tournament.status, error: tournament.error },
        { status: 502 },
      );
    }

    if (matchId) {
      const tickets = await sbListTickets(matchId, config);
      return NextResponse.json({
        ok: tickets.ok,
        configured: true,
        baseUrl: config.baseUrl,
        tournament: tournament.data,
        matchId,
        tickets: tickets.ok ? tickets.data : { error: tickets.error, status: tickets.status },
      });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      baseUrl: config.baseUrl,
      tournament: tournament.data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
