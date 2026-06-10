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

function parseChannel(raw: string | null): "shop" | "resale" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "resale") return "resale";
  return "shop";
}

/**
 * Webhook log feed.
 *
 * Query: channel=shop|resale (default shop), limit, offset, notifyOnly=1
 * Resale: sock_available RESALE scrape diffs + Discord new-listing notify metadata.
 * Shop: SHOP marketplace Discord baseline/delta sends.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseIntParam(sp.get("limit"), 50, 100);
    const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);
    const channel = parseChannel(sp.get("channel"));
    const notifyOnly = sp.get("notifyOnly") === "1";

    if (channel === "shop") {
      const where = notifyOnly ? { attempted: true } : {};
      const [total, rows] = await Promise.all([
        prisma.shopDiscordNotifyLog.count({ where }),
        prisma.shopDiscordNotifyLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
      ]);

      return NextResponse.json({
        ok: true,
        channel: "shop",
        total,
        offset,
        limit,
        rows: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          mode: r.mode,
          matchCount: r.matchCount,
          changedCount: r.changedCount,
          attempted: r.attempted,
          ok: r.ok,
          status: r.status,
          error: r.error,
          notifyRaw: r.notifyRaw,
        })),
      });
    }

    const where = {
      kind: "RESALE" as const,
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
      channel: "resale",
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
    const missing =
      message.includes("does not exist") ||
      message.includes("shop_discord_notify_logs") ||
      message.includes("P2021");
    if (missing) {
      return NextResponse.json({
        ok: false,
        error: "Run prisma migrate deploy for shop_discord_notify_logs.",
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
