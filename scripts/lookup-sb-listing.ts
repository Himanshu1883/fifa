import { prisma } from "../src/lib/prisma";

async function main() {
  const ticketId = process.argv[2] ?? "872971";
  const logs = await prisma.sbListingPushLog.findMany({
    where: {
      OR: [{ sbTicketId: ticketId }, { sbTicketId: { contains: ticketId } }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (logs.length === 0) {
    console.log("No push log for", ticketId);
    return;
  }
  const log = logs[0]!;
  const event = await prisma.event.findUnique({
    where: { id: log.eventId },
    select: { id: true, name: true, prefId: true, resalePrefId: true, sbEventId: true },
  });
  const summary = log.requestSummary as Record<string, unknown> | null;
  const seatIds = (summary?.sourceSeatIds ?? summary?.seatIds) as string[] | undefined;
  console.log(JSON.stringify({ log, event, seatIds }, null, 2));
  if (seatIds?.length) {
    for (const sid of seatIds) {
      const sock = await prisma.sockAvailable.findFirst({
        where: { eventId: log.eventId, seatId: sid, kind: "RESALE" },
      });
      console.log(
        "sock",
        sid,
        sock
          ? { blockName: sock.blockName, blockId: sock.blockId, row: sock.row, seatNumber: sock.seatNumber }
          : "MISSING",
      );
    }
  }
  const resaleCount = await prisma.sockAvailable.count({
    where: { eventId: log.eventId, kind: "RESALE" },
  });
  console.log("resale_sock_rows:", resaleCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
