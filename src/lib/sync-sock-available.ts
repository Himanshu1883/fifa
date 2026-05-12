import type { Prisma } from "@/generated/prisma/client";
import type { SockAvailableKind } from "@/generated/prisma/enums";
import type { SockAvailableRowInput } from "@/lib/parse-sock-available-geojson-webhook";

type Tx = Pick<Prisma.TransactionClient, "sockAvailable" | "event">;

const CREATE_MANY_CHUNK = 500;

/**
 * Replace-all: wipe an event's current sock_available rows, then insert the new payload.
 *
 * Caller should parse/validate first; we only delete after we already have a `rows[]` array.
 * Event lookup matches Event.prefId OR Event.resalePrefId using the provided query/body id.
 */
export async function syncSockAvailableForEvent(
  tx: Tx,
  prefOrResalePrefId: string,
  kind: SockAvailableKind,
  rows: SockAvailableRowInput[],
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
    where: {
      OR: [{ prefId: prefOrResalePrefId }, { resalePrefId: prefOrResalePrefId }],
    },
    select: { id: true },
  });
  if (!ev) return null;

  const byMovement = new Map<string, SockAvailableRowInput>();
  for (const r of rows) {
    if (!byMovement.has(r.resaleMovementId)) {
      byMovement.set(r.resaleMovementId, r);
    }
  }
  const uniqueRows = Array.from(byMovement.values());
  const skippedDuplicateInPayloadCount = rows.length - uniqueRows.length;

  const deleted = await tx.sockAvailable.deleteMany({
    where: { eventId: ev.id, kind },
  });

  let insertedCount = 0;
  for (let i = 0; i < uniqueRows.length; i += CREATE_MANY_CHUNK) {
    const chunk = uniqueRows.slice(i, i + CREATE_MANY_CHUNK);
    const created = await tx.sockAvailable.createMany({
      data: chunk.map((r) => ({
        eventId: ev.id,
        areaId: r.areaId,
        areaName: r.areaName,
        blockId: r.blockId,
        blockName: r.blockName,
        contingentId: r.contingentId,
        seatId: r.seatId,
        seatNumber: r.seatNumber,
        amount: r.amount,
        resaleMovementId: r.resaleMovementId,
        row: r.row,
        categoryName: r.categoryName,
        categoryId: r.categoryId,
        kind,
      })),
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

