/**
 * Smoke-test GET /api/events/[eventId]/seat-offers-transformed against the DB.
 * Run (dev server up): node --import tsx scripts/sample-seat-offers-transformed.ts
 * Or DB-only preview: node --import tsx scripts/sample-seat-offers-transformed.ts --db-only
 */
import { createPrismaClient } from "../src/lib/prisma";
import { transformSeatOffersFromSockRows } from "../src/lib/seat-offers-transform";

async function main() {
  const dbOnly = process.argv.includes("--db-only");
  const prisma = createPrismaClient();

  const top = await prisma.sockAvailable.groupBy({
    by: ["eventId"],
    _count: { _all: true },
    orderBy: { _count: { eventId: "desc" } },
    take: 1,
  });

  if (top.length === 0) {
    console.log(JSON.stringify({ ok: false, message: "No sock_available rows in database." }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const eventId = top[0]!.eventId;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, sbEventId: true, prefId: true },
  });

  const rows = await prisma.sockAvailable.findMany({
    where: { eventId },
    select: {
      id: true,
      amount: true,
      areaName: true,
      blockName: true,
      contingentId: true,
      row: true,
      seatNumber: true,
      seatId: true,
      resaleMovementId: true,
      categoryName: true,
      categoryId: true,
      areaId: true,
      blockId: true,
      kind: true,
    },
    take: 500,
  });

  const payload = rows.map((r) => ({
    id: r.id,
    amount: r.amount?.toString() ?? null,
    areaName: r.areaName,
    blockName: r.blockName,
    contingentId: r.contingentId,
    row: r.row,
    seatNumber: r.seatNumber,
    seatId: r.seatId,
    resaleMovementId: r.resaleMovementId,
    categoryName: r.categoryName,
    categoryId: r.categoryId,
    areaId: r.areaId,
    blockId: r.blockId,
    kind: r.kind,
  }));

  const { offers, skippedEmptyBuckets } = transformSeatOffersFromSockRows(payload);

  const sample = {
    ok: true,
    eventId,
    eventName: event?.name ?? null,
    sbEventId: event?.sbEventId ?? null,
    prefId: event?.prefId ?? null,
    sourceRowCount: payload.length,
    offerCount: offers.length,
    skippedEmptyBuckets,
    offersPreview: offers.slice(0, 3).map((o) => ({
      kind: o.kind,
      offerType: o.offerType,
      priceUsd: o.priceUsd,
      originalCount: o.originalCount,
      transformedCount: o.transformedCount,
      seatKeys: o.seats.map((s) => s.key),
    })),
    curl: `curl -s 'http://localhost:3010/api/events/${eventId}/seat-offers-transformed' | jq '.offerCount,.offers[0]'`,
  };

  console.log(JSON.stringify(sample, null, 2));

  if (!dbOnly) {
    const base = process.env.API_BASE ?? "http://localhost:3010";
    const url = `${base}/api/events/${eventId}/seat-offers-transformed`;
    try {
      const res = await fetch(url);
      const body = await res.json();
      console.log("\nHTTP", res.status, JSON.stringify({ offerCount: body.offerCount, ok: body.ok }, null, 2));
    } catch (e) {
      console.log("\nHTTP fetch skipped (start dev:3010):", e instanceof Error ? e.message : String(e));
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
