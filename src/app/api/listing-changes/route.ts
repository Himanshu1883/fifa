import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Kind = "RESALE" | "LAST_MINUTE";

type NewSeatIdLike = {
  key?: unknown;
  seatId?: unknown;
  resaleMovementId?: unknown;
  categoryId?: unknown;
  categoryName?: unknown;
  blockName?: unknown;
  row?: unknown;
  seatNumber?: unknown;
  amountRaw?: unknown;
  [k: string]: unknown;
};

function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  return false;
}

function shouldEnrichItem(x: NewSeatIdLike): boolean {
  return (
    isMissing(x.categoryName) ||
    isMissing(x.blockName) ||
    isMissing(x.row) ||
    isMissing(x.seatNumber) ||
    isMissing(x.amountRaw)
  );
}

function keyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function lookupKeyForItem(x: NewSeatIdLike): string | null {
  const key = keyString(x.key);
  const seatId = keyString(x.seatId);
  const movementId = keyString(x.resaleMovementId);

  if (key?.startsWith("m:")) return key;
  if (movementId) return `m:${movementId}`;
  if (key?.startsWith("s:")) return key;
  if (seatId) return `s:${seatId}`;
  return null;
}

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

async function enrichNewSeatIdsForRows(args: { eventId: number; rows: Array<{ kind: Kind; newSeatIds: unknown }> }) {
  const neededByKind: Record<Kind, { seatIds: Set<string>; movementIds: Set<string> }> = {
    LAST_MINUTE: { seatIds: new Set<string>(), movementIds: new Set<string>() },
    RESALE: { seatIds: new Set<string>(), movementIds: new Set<string>() },
  };
  // Avoid huge `IN (...)` lists when logs contain many keys.
  // UI only shows a limited number by default; if we need more later we can paginate.
  const maxItemsPerRow = 120;

  for (const r of args.rows) {
    if (!Array.isArray(r.newSeatIds)) continue;
    let considered = 0;
    for (const raw of r.newSeatIds) {
      if (!raw || typeof raw !== "object") continue;
      const x = raw as NewSeatIdLike;
      if (!shouldEnrichItem(x)) continue;
      considered += 1;
      if (considered > maxItemsPerRow) break;

      const key = keyString(x.key);
      const seatId = keyString(x.seatId);
      const movementId = keyString(x.resaleMovementId);
      if (key?.startsWith("m:") || movementId) {
        const id = movementId ?? (key ? key.slice(2) : null);
        if (id) neededByKind[r.kind].movementIds.add(id);
      } else if (seatId) {
        neededByKind[r.kind].seatIds.add(seatId);
      } else if (key?.startsWith("s:")) {
        const id = key.slice(2).trim();
        if (id) neededByKind[r.kind].seatIds.add(id);
      }
    }
  }

  const seatMapByKind: Record<Kind, Map<string, NewSeatIdLike>> = {
    LAST_MINUTE: new Map<string, NewSeatIdLike>(),
    RESALE: new Map<string, NewSeatIdLike>(),
  };

  await Promise.all(
    (Object.keys(neededByKind) as Kind[]).map(async (kind) => {
      const movementIds = Array.from(neededByKind[kind].movementIds);
      const seatIds = Array.from(neededByKind[kind].seatIds);
      if (movementIds.length === 0 && seatIds.length === 0) return;

      const OR: Array<Record<string, unknown>> = [];
      if (movementIds.length) OR.push({ resaleMovementId: { in: movementIds } });
      if (seatIds.length) OR.push({ seatId: { in: seatIds } });

      const found = await prisma.sockAvailable.findMany({
        where: {
          eventId: args.eventId,
          kind,
          OR,
        },
        select: {
          seatId: true,
          resaleMovementId: true,
          categoryName: true,
          categoryId: true,
          blockName: true,
          row: true,
          seatNumber: true,
          amount: true,
        },
      });

      const map = seatMapByKind[kind];
      for (const s of found) {
        const data: NewSeatIdLike = {
          categoryName: s.categoryName,
          categoryId: s.categoryId,
          blockName: s.blockName,
          row: s.row,
          seatNumber: s.seatNumber,
          amountRaw: s.amount,
        };
        map.set(`s:${s.seatId}`, data);
        if (s.resaleMovementId) map.set(`m:${s.resaleMovementId}`, data);
      }
    }),
  );

  return args.rows.map((r) => {
    if (!Array.isArray(r.newSeatIds) || r.newSeatIds.length === 0) return r;
    const map = seatMapByKind[r.kind];
    const next = r.newSeatIds.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const x = raw as NewSeatIdLike;
      if (!shouldEnrichItem(x)) return raw;
      const lk = lookupKeyForItem(x);
      if (!lk) return raw;
      const data = map.get(lk);
      if (!data) return raw;

      return {
        ...x,
        categoryName: isMissing(x.categoryName) ? data.categoryName : x.categoryName,
        categoryId: isMissing(x.categoryId) ? data.categoryId : x.categoryId,
        blockName: isMissing(x.blockName) ? data.blockName : x.blockName,
        row: isMissing(x.row) ? data.row : x.row,
        seatNumber: isMissing(x.seatNumber) ? data.seatNumber : x.seatNumber,
        amountRaw: isMissing(x.amountRaw) ? data.amountRaw : x.amountRaw,
      };
    });
    return { ...r, newSeatIds: next };
  });
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

    const kinds: Kind[] = ["RESALE", "LAST_MINUTE"];
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

    const enrichedRows = await enrichNewSeatIdsForRows({ eventId, rows });
    return NextResponse.json({ ok: true, eventId, kind, rows: enrichedRows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 400) }, { status: 500 });
  }
}

