import { NextResponse } from "next/server";
import { z } from "zod";

import { loadSbOfferPreviewForSeatIds } from "@/lib/sb-offer-preview-service";
import { parseSbTicketTypeId } from "@/lib/sb-ticket-types";

export const runtime = "nodejs";

const bodySchema = z.object({
  seatIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const ticketType = parseSbTicketTypeId(url.searchParams.get("ticketType")?.trim());

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Body must include seatIds: string[]." }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await loadSbOfferPreviewForSeatIds(id, body.seatIds, { ticketType });
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
