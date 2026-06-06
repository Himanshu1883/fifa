import { NextResponse } from "next/server";

import { cancelBulkPushJob, getBulkPushJobSnapshot } from "@/lib/sb-bulk-push-service";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const jobIdParam = url.searchParams.get("jobId")?.trim();
  if (!jobIdParam) {
    return NextResponse.json({ ok: false, error: "Provide jobId." }, { status: 400 });
  }

  const jobId = Number.parseInt(jobIdParam, 10);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid jobId." }, { status: 400 });
  }

  try {
    const result = await cancelBulkPushJob(id, jobId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    const job = await getBulkPushJobSnapshot(jobId);
    return NextResponse.json({ ok: true, job: job ?? result.job });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
