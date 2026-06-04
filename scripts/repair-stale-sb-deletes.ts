/**
 * Mark stale delete_failed logs as deleted when the ticket is no longer on SB.
 *
 *   npx tsx scripts/repair-stale-sb-deletes.ts
 *   npx tsx scripts/repair-stale-sb-deletes.ts --event-id 85
 *   npx tsx scripts/repair-stale-sb-deletes.ts --sb-ticket 872971
 */

import { repairStaleSbDeleteLogs } from "../src/lib/sb-listing-delete";
import { prisma } from "../src/lib/prisma";

async function main() {
  let eventId: number | undefined;
  const ticket = process.argv.find((a) => a.startsWith("--sb-ticket="))?.slice("--sb-ticket=".length)
    ?? (process.argv.includes("--sb-ticket") ? process.argv[process.argv.indexOf("--sb-ticket") + 1] : undefined);

  const eventArg = process.argv.find((a) => a.startsWith("--event-id="))?.slice("--event-id=".length)
    ?? (process.argv.includes("--event-id") ? process.argv[process.argv.indexOf("--event-id") + 1] : undefined);
  if (eventArg) eventId = Number(eventArg);

  if (ticket) {
    const log = await prisma.sbListingPushLog.findFirst({
      where: { sbTicketId: ticket.trim() },
      orderBy: { createdAt: "desc" },
      select: { eventId: true, sbTicketId: true, sbDeletedAt: true, sbDeleteError: true },
    });
    console.log("Before:", log);
    eventId = log?.eventId;
  }

  const result = await repairStaleSbDeleteLogs(eventId != null ? { eventId } : undefined);
  console.log("Repair:", result);

  if (ticket) {
    const after = await prisma.sbListingPushLog.findFirst({
      where: { sbTicketId: ticket.trim() },
      orderBy: { createdAt: "desc" },
      select: { sbDeletedAt: true, sbDeleteError: true, inventoryRemovedAt: true },
    });
    console.log("After:", after);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
