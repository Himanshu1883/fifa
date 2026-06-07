import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getActiveBulkPushJobForEvent,
  getBulkPushJobSnapshot,
  processBulkPushJob,
  startBulkPushJob,
} from "@/lib/sb-bulk-push-service";
import { DEFAULT_SB_TICKET_TYPE_ID } from "@/lib/sb-ticket-types";

export const runtime = "nodejs";

const itemSchema = z.object({
  seatIds: z.array(z.string().min(1)).min(1).max(50),
  omitTicketBlock: z.boolean().optional(),
  blockName: z.string().optional(),
  rowLabel: z.string().optional(),
  seatSpan: z.string().optional(),
  label: z.string().optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
  ticketType: z.string().trim().min(1).max(8).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const jobIdParam = url.searchParams.get("jobId")?.trim();
  const active = url.searchParams.get("active") === "1" || url.searchParams.get("active") === "true";

  try {
    let job = null;
    if (jobIdParam) {
      const jobId = Number.parseInt(jobIdParam, 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return NextResponse.json({ ok: false, error: "Invalid jobId." }, { status: 400 });
      }
      await processBulkPushJob(jobId);
      job = await getBulkPushJobSnapshot(jobId);
      if (job && job.eventId !== id) {
        return NextResponse.json({ ok: false, error: "Job does not belong to this event." }, { status: 404 });
      }
    } else if (active) {
      job = await getActiveBulkPushJobForEvent(id);
      if (job) {
        await processBulkPushJob(job.id);
        job = await getBulkPushJobSnapshot(job.id);
      }
    } else {
      return NextResponse.json({ ok: false, error: "Provide jobId or active=1." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, job });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const missingTable =
      message.includes("does not exist") ||
      message.includes("sb_bulk_push_jobs") ||
      message.includes("P2021");
    if (missingTable) {
      return NextResponse.json({
        ok: true,
        job: null,
        warning: "Run prisma migrate deploy for SB bulk push jobs.",
      });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await startBulkPushJob(
      id,
      parsed.data.items,
      parsed.data.ticketType ?? DEFAULT_SB_TICKET_TYPE_ID,
    );
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json({
      ok: true,
      jobId: result.job.id,
      job: result.job,
      alreadyRunning: result.alreadyRunning ?? false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const missingTable =
      message.includes("does not exist") ||
      message.includes("sb_bulk_push_jobs") ||
      message.includes("P2021");
    if (missingTable) {
      return NextResponse.json(
        { ok: false, error: "Run prisma migrate deploy for SB bulk push jobs." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
