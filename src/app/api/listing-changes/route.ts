import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseIntParam(raw: string | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function parseKind(raw: string | null): "RESALE" | "LAST_MINUTE" | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "resale") return "RESALE";
  if (s === "last_minute" || s === "last-minute" || s === "lastminute" || s === "lm" || s === "shop") return "LAST_MINUTE";
  if (s === "last minute") return "LAST_MINUTE";
  return null;
}

/**
 * Fetch recent persisted webhook diff logs for an event.
 *
 * Query params:
 * - eventId: required integer
 * - kind: optional ("RESALE" | "LAST_MINUTE") with aliases like "shop"
 * - limit: optional (default 20, capped to 50)
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const eventId = parseIntParam(sp.get("eventId"));
    if (eventId == null || eventId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid eventId" }, { status: 400 });
    }

    const limitRaw = parseIntParam(sp.get("limit"));
    const limit = Math.max(1, Math.min(50, limitRaw ?? 20));
    const kind = parseKind(sp.get("kind"));

    const kinds: Array<"RESALE" | "LAST_MINUTE"> = ["RESALE", "LAST_MINUTE"];
    const where = kind
      ? { eventId, kind }
      : {
          eventId,
          kind: { in: kinds },
        };

    const rows = await prisma.sockAvailableWebhookDiffLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
      },
    });

    return NextResponse.json({ ok: true, eventId, kind, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 400) }, { status: 500 });
  }
}

