import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteSbListingForEvent } from "@/lib/sb-listing-delete";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    logId: z.number().int().positive().optional(),
    sbTicketId: z.union([z.string().min(1), z.number().int().positive()]).optional(),
    blockName: z.string().optional(),
    row: z.string().optional(),
    seatIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((b) => b.logId != null || b.sbTicketId != null, {
    message: "Provide logId or sbTicketId.",
  });

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  if (!getSeatsBrokersConfig()) {
    return NextResponse.json(
      { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local." },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Provide logId or sbTicketId in JSON body." }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: { sbEventId: true },
  });
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  try {
    const sbTicketId =
      parsed.data.sbTicketId != null ? String(parsed.data.sbTicketId).trim() : undefined;

    const result = await deleteSbListingForEvent(id, {
      logId: parsed.data.logId,
      sbTicketId,
      matchId: event.sbEventId?.trim() ?? undefined,
      markInventoryRemoved: true,
      rowMeta: {
        blockName: parsed.data.blockName ?? null,
        row: parsed.data.row ?? null,
        seatIds: parsed.data.seatIds,
      },
    });

    if (!result.ok) {
      const status = result.httpStatus && result.httpStatus >= 400 ? 502 : 422;
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          httpStatus: result.httpStatus,
          ...(result.entry ? { entry: result.entry } : {}),
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      logId: result.logId,
      sbTicketId: result.sbTicketId,
      entry: result.entry,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
