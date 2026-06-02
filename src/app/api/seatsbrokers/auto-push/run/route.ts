import { NextResponse } from "next/server";
import { z } from "zod";

import { getSbAutoPushEnabled } from "@/lib/sb-auto-push-settings";
import {
  runSbAutoPushForAllRegisteredEvents,
  runSbAutoPushForEvent,
} from "@/lib/seatsbrokers-push-service";

export const runtime = "nodejs";

const bodySchema = z.object({
  eventId: z.coerce.number().int().positive().optional(),
});

/** Tick endpoint: push new RESALE listings (same as manual, deduped) for registered events. */
export async function POST(req: Request) {
  const enabled = await getSbAutoPushEnabled();
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      ran: false,
      skippedReason: "auto_push_disabled",
    });
  }

  let eventId: number | undefined;
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success) eventId = parsed.data.eventId;
  } catch {
    /* empty body → all registered events */
  }

  if (eventId != null) {
    const autoPushRun = await runSbAutoPushForEvent(eventId);
    return NextResponse.json({
      ok: true,
      enabled: true,
      autoPushRun,
    });
  }

  const autoPushBatch = await runSbAutoPushForAllRegisteredEvents();
  const created = autoPushBatch.events.reduce((n, e) => n + (e.created ?? 0), 0);
  const failed = autoPushBatch.events.reduce((n, e) => n + (e.failed ?? 0), 0);
  const skipped = autoPushBatch.events.reduce((n, e) => n + (e.skipped ?? 0), 0);

  return NextResponse.json({
    ok: true,
    enabled: true,
    autoPushBatch,
    totals: { created, failed, skipped },
  });
}
