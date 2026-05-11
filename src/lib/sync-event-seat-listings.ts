import type { Prisma } from "@/generated/prisma/client";
import type { SeatListingRowInput } from "@/lib/parse-seat-listings-geojson-webhook";

type Tx = Pick<Prisma.TransactionClient, "eventSeatListing" | "event">;

const CREATE_MANY_CHUNK = 500;

/**
 * Replace-all: wipe an event's current seat listings, then insert the new payload.
 *
 * Safety: caller should parse/validate the payload before calling this, so we only
 * delete after we already have a valid `rows[]` array.
 *
 * Event is resolved by `Event.resalePrefId` only (resale channel). `amount` is stored
 * in cents (minor units), same scale as the webhook payload integers.
 */
export async function syncResaleSeatListingsForEvent(
  tx: Tx,
  resalePrefId: string,
  rows: SeatListingRowInput[],
): Promise<{
  eventId: number;
  deletedCount: number;
  rowCount: number;
  uniqueRowCount: number;
  insertedCount: number;
  skippedDuplicateInPayloadCount: number;
  skippedDbCount: number;
} | null> {
  const ev = await tx.event.findFirst({
    where: { resalePrefId },
    select: { id: true },
  });
  if (!ev) return null;

  // In case upstream repeats the same resaleMovementId within one payload, dedupe
  // so the DB unique constraint can't fail.
  const byMovement = new Map<string, SeatListingRowInput>();
  for (const r of rows) {
    if (!byMovement.has(r.resaleMovementId)) {
      byMovement.set(r.resaleMovementId, r);
    }
  }
  const uniqueRows = Array.from(byMovement.values());
  const skippedDuplicateInPayloadCount = rows.length - uniqueRows.length;

  // Replace-all: clear existing rows before insert.
  const deleted = await tx.eventSeatListing.deleteMany({
    where: { eventId: ev.id },
  });

  let insertedCount = 0;
  for (let i = 0; i < uniqueRows.length; i += CREATE_MANY_CHUNK) {
    const chunk = uniqueRows.slice(i, i + CREATE_MANY_CHUNK);
    const created = await tx.eventSeatListing.createMany({
      data: chunk.map((r) => ({
        eventId: ev.id,
        categoryBlockId: r.categoryBlockId,
        categoryBlockName: r.categoryBlockName,
        areaId: r.areaId,
        areaName: r.areaName,
        color: r.color,
        rowLabel: r.rowLabel,
        seatNumber: r.seatNumber,
        seatCategoryId: r.seatCategoryId,
        seatCategoryName: r.seatCategoryName,
        contingentId: r.contingentId,
        amount: r.amount,
        resaleMovementId: r.resaleMovementId,
        exclusive: r.exclusive,
        propertiesId: r.propertiesId,
        geometryType: r.geometryType,
        rotation: r.rotation,
        coordX: r.coordX,
        coordY: r.coordY,
        mainId: r.mainId,
      })),
      // Should be redundant after delete + in-payload dedupe, but keeps this safe
      // under concurrent webhook calls.
      skipDuplicates: true,
    });
    insertedCount += created.count;
  }

  return {
    eventId: ev.id,
    deletedCount: deleted.count,
    rowCount: rows.length,
    uniqueRowCount: uniqueRows.length,
    insertedCount,
    skippedDuplicateInPayloadCount,
    skippedDbCount: uniqueRows.length - insertedCount,
  };
}
