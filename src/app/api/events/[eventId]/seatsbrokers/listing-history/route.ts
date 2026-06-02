import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 500);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, name: true, sbEventId: true },
  });
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const [rows, total] = await Promise.all([
    prisma.sbListingPushLog.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.sbListingPushLog.count({ where: { eventId: id } }),
  ]);

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    eventName: event.name,
    matchId: event.sbEventId,
    total,
    limit,
    offset,
    listings: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      trigger: r.trigger,
      ok: r.ok,
      httpStatus: r.httpStatus,
      sbTicketId: r.sbTicketId,
      offerIndex: r.offerIndex,
      listingFingerprint: r.listingFingerprint,
      matchId: r.matchId,
      requestFields: r.requestFields,
      requestSummary: r.requestSummary,
      responseBody: r.responseBody,
      errorMessage: r.errorMessage,
    })),
  });
}
