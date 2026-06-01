import { NextResponse } from "next/server";

import { sbGetTicketBlocks, sbGetTicketDropdown } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { parseSbDropdownCategories, parseSbTicketBlocks } from "@/lib/seatsbrokers-catalog";

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
  const matchId = url.searchParams.get("matchId")?.trim() ?? "";
  const categoryId = url.searchParams.get("categoryId")?.trim() ?? "";

  if (!matchId) {
    return NextResponse.json({ ok: false, error: "matchId is required." }, { status: 400 });
  }

  if (categoryId) {
    const blocks = await sbGetTicketBlocks(matchId, categoryId, config);
    return NextResponse.json({
      ok: blocks.ok,
      matchId,
      categoryId,
      blocks: blocks.ok ? parseSbTicketBlocks(blocks.data) : [],
      error: blocks.ok ? undefined : blocks.error,
    });
  }

  const dropdown = await sbGetTicketDropdown(matchId, config);
  return NextResponse.json({
    ok: dropdown.ok,
    matchId,
    categories: dropdown.ok ? parseSbDropdownCategories(dropdown.data) : [],
    error: dropdown.ok ? undefined : dropdown.error,
    raw: dropdown.ok ? dropdown.data : undefined,
  });
}
