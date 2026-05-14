import { NextResponse } from "next/server";

import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Returns the next `Event.prefId` for events whose match number is within an inclusive range.
 *
 * Query params:
 * - `from` / `to`: integers, inclusive range (e.g. ?from=1&to=11)
 * - aliases: `matchFrom` / `matchTo`
 *
 * Match number is parsed from whole-string labels like `Match1` via `parseEventMatchNumber(matchLabel, name)`.
 * Events with missing/unparseable match numbers are excluded.
 *
 * Cursor is persisted per range scope (e.g. scope = "match:1-11") so repeated calls rotate through the list.
 */

function parseIntParam(raw: string | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = parseIntParam(sp.get("from") ?? sp.get("matchFrom"));
    const to = parseIntParam(sp.get("to") ?? sp.get("matchTo"));

    if (from == null || to == null || from > to) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid match range",
          from,
          to,
        },
        { status: 400 },
      );
    }

    const rows = await prisma.event.findMany({
      select: { id: true, matchLabel: true, name: true, prefId: true },
    });

    const list = rows
      .map((e) => ({
        ...e,
        matchNum: parseEventMatchNumber(e.matchLabel, e.name),
      }))
      .filter((e) => e.matchNum != null && e.matchNum >= from && e.matchNum <= to)
      .sort((a, b) => {
        if (a.matchNum !== b.matchNum) return a.matchNum! - b.matchNum!;
        return a.id - b.id;
      });

    if (list.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No events in range", from, to },
        { status: 400 },
      );
    }

    const scope = `match:${from}-${to}`;

    const payload = await prisma.$transaction(async (tx) => {
      await tx.prefRotationState.upsert({
        where: { scope },
        create: { scope, nextIndex: 0 },
        update: {},
      });

      const state = await tx.prefRotationState.findUniqueOrThrow({
        where: { scope },
      });

      const n = list.length;
      const index = ((state.nextIndex % n) + n) % n;
      const event = list[index]!;

      await tx.prefRotationState.update({
        where: { scope },
        data: { nextIndex: state.nextIndex + 1 },
      });

      return { index, eventId: event.id, matchLabel: event.matchLabel, prefId: event.prefId };
    });

    return NextResponse.json({
      ok: true,
      scope,
      from,
      to,
      count: list.length,
      index: payload.index,
      eventId: payload.eventId,
      matchLabel: payload.matchLabel,
      prefId: payload.prefId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message.slice(0, 400) },
      { status: 500 },
    );
  }
}

