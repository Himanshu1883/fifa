import { NextResponse } from "next/server";
import { z } from "zod";

import { parseSbTicketTypeId } from "@/lib/sb-ticket-types";
import {
  getSbAutoPushSettings,
  isEventRegisteredForSbAutoPush,
  setSbAutoPushEnabled,
  setSbAutoPushTicketType,
} from "@/lib/sb-auto-push-settings";
import {
  runSbAutoPushForAllRegisteredEvents,
  runSbAutoPushForEvent,
  type SbAutoPushBatchRunResult,
  type SbAutoPushRunResult,
} from "@/lib/seatsbrokers-push-service";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    ticketType: z.string().trim().min(1).max(8).optional(),
    /** When enabling, push new listings for this event immediately (if eligible). */
    eventId: z.coerce.number().int().positive().optional(),
    /** When enabling without eventId, push all registered events (default true). */
    runAllRegistered: z.boolean().optional(),
  })
  .refine((d) => d.enabled !== undefined || d.ticketType !== undefined, {
    message: "Provide enabled and/or ticketType.",
  });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const eventIdRaw = url.searchParams.get("eventId")?.trim();
  const eventId = eventIdRaw ? Number.parseInt(eventIdRaw, 10) : null;

  const settings = await getSbAutoPushSettings();
  let eventEligible: boolean | null = null;
  if (eventId != null && Number.isFinite(eventId) && eventId > 0) {
    eventEligible = await isEventRegisteredForSbAutoPush(eventId);
  }

  return NextResponse.json({
    ok: true,
    enabled: settings.enabled,
    ticketType: settings.ticketType,
    eventEligible,
  });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body must include { enabled?: boolean, ticketType?: string }." },
      { status: 400 },
    );
  }

  if (parsed.data.ticketType !== undefined) {
    await setSbAutoPushTicketType(parseSbTicketTypeId(parsed.data.ticketType));
  }
  if (parsed.data.enabled !== undefined) {
    await setSbAutoPushEnabled(parsed.data.enabled);
  }

  const settings = await getSbAutoPushSettings();

  let autoPushRun: SbAutoPushRunResult | undefined;
  let autoPushBatch: SbAutoPushBatchRunResult | undefined;

  if (parsed.data.enabled === true) {
    if (parsed.data.eventId != null) {
      autoPushRun = await runSbAutoPushForEvent(parsed.data.eventId);
    } else if (parsed.data.runAllRegistered !== false) {
      autoPushBatch = await runSbAutoPushForAllRegisteredEvents();
    }
  }

  return NextResponse.json({
    ok: true,
    enabled: settings.enabled,
    ticketType: settings.ticketType,
    autoPushRun,
    autoPushBatch,
  });
}
