import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIntParam(raw: string | null, fallback: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, n));
}

function parseKind(raw: string | null): "RESALE" | "LAST_MINUTE" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "resale") return "RESALE";
  if (s === "last_minute" || s === "last-minute" || s === "lastminute" || s === "lm" || s === "shop") {
    return "LAST_MINUTE";
  }
  return null;
}

/**
 * Global webhook diff log feed (sock_available ingest + outbound notify metadata).
 *
 * Query: limit (default 50, max 100), offset, eventId?, kind?, notifyOnly=1
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseIntParam(sp.get("limit"), 50, 100);
    const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);
    const eventIdRaw = sp.get("eventId");
    const eventId = eventIdRaw ? Number.parseInt(eventIdRaw, 10) : null;
    const kind = parseKind(sp.get("kind"));
    const notifyOnly = sp.get("notifyOnly") === "1";

    const where = {
      ...(eventId != null && Number.isFinite(eventId) && eventId > 0 ? { eventId } : {}),
      ...(kind ? { kind } : {}),
      ...(notifyOnly ? { notifyAttempted: true } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.sockAvailableWebhookDiffLog.count({ where }),
      prisma.sockAvailableWebhookDiffLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          eventId: true,
          kind: true,
          prefId: true,
          newCount: true,
          changedCount: true,
          priceChangedCount: true,
          newSeatIds: true,
          sample: true,
          notifyAttempted: true,
          notifyOk: true,
          notifyProvider: true,
          notifyStatus: true,
          notifyError: true,
          notifyRaw: true,
          event: {
            select: { matchLabel: true, name: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      total,
      offset,
      limit,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        eventId: r.eventId,
        matchLabel: r.event.matchLabel,
        eventName: r.event.name,
        kind: r.kind,
        prefId: r.prefId,
        newCount: r.newCount,
        changedCount: r.changedCount,
        priceChangedCount: r.priceChangedCount,
        newSeatIds: r.newSeatIds,
        sample: r.sample,
        notifyAttempted: r.notifyAttempted,
        notifyOk: r.notifyOk,
        notifyProvider: r.notifyProvider,
        notifyStatus: r.notifyStatus,
        notifyError: r.notifyError,
        notifyRaw: r.notifyRaw,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
