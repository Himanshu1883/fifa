import { NextResponse } from "next/server";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { repairStaleSbDeleteLogs } from "@/lib/sb-listing-delete";
import { reconcileSbListingsAfterSockSync } from "@/lib/sb-listing-reconcile";
import { loadSbListingStatusForEvent } from "@/lib/sb-listing-status";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  try {
    let reconcile: Awaited<ReturnType<typeof reconcileSbListingsAfterSockSync>> | undefined;
    try {
      reconcile = await reconcileSbListingsAfterSockSync(id);
    } catch (reconcileErr) {
      console.warn("[sb-listing-status] reconcile failed", reconcileErr);
    }

    let repair: Awaited<ReturnType<typeof repairStaleSbDeleteLogs>> | undefined;
    try {
      repair = await repairStaleSbDeleteLogs({ eventId: id });
    } catch (repairErr) {
      console.warn("[sb-listing-status] stale delete repair failed", repairErr);
    }

    const status = await loadSbListingStatusForEvent(id);
    return NextResponse.json({
      ok: true,
      configured: Boolean(getSeatsBrokersConfig()),
      ...status,
      reconcile,
      repair,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Still return empty status so the UI can show Push to SB (e.g. before migration).
    const missingTable =
      message.includes("does not exist") ||
      message.includes("inventory_removed_at") ||
      message.includes("P2021");
    if (missingTable) {
      return NextResponse.json({
        ok: true,
        configured: Boolean(getSeatsBrokersConfig()),
        bySeatKey: {},
        active: [],
        removed: [],
        warning: "Run prisma migrate deploy for SB removal tracking.",
      });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
