import type { Prisma } from "@/generated/prisma/client";
import type { SeatListingRowInput } from "@/lib/parse-seat-listings-geojson-webhook";

type Tx = Pick<Prisma.TransactionClient, "eventSeatListing" | "event">;

const CREATE_MANY_CHUNK = 500;

/**
 * Full snapshot for an event: replace all seat listings. Event is resolved by
 * `Event.resalePrefId` only (resale channel). `amount` is stored in cents
 * (minor units), same scale as the webhook payload integers.
 */
export async function syncResaleSeatListingsForEvent(
  tx: Tx,
  resalePrefId: string,
  rows: SeatListingRowInput[],
): Promise<{ eventId: number } | null> {
  const ev = await tx.event.findFirst({
    where: { resalePrefId },
    select: { id: true },
  });
  if (!ev) return null;

  await tx.eventSeatListing.deleteMany({ where: { eventId: ev.id } });

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += CREATE_MANY_CHUNK) {
      const chunk = rows.slice(i, i + CREATE_MANY_CHUNK);
      await tx.eventSeatListing.createMany({
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
      });
    }
  }

  return { eventId: ev.id };
}
