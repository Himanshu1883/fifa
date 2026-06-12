/**
 * One-off: delete ALL SB listing push logs for an event (active + deleted + failed).
 *
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-event-sb-listing-logs.ts 5677 --dry-run
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-event-sb-listing-logs.ts 5677 --yes
 */
import { createPrismaClient } from "../src/lib/prisma";

const prisma = createPrismaClient();

function parseArgs(argv: string[]) {
  let dryRun = false;
  let yes = false;
  let eventRef = "";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes" || a === "-y") yes = true;
    else if (!a.startsWith("-") && !eventRef) eventRef = a.trim();
  }

  return { dryRun, yes, eventRef };
}

async function main() {
  const { dryRun, yes, eventRef } = parseArgs(process.argv.slice(2));
  if (!eventRef) {
    console.error("Usage: purge-event-sb-listing-logs.ts <eventId|sbMatchId|eventNameHint> [--dry-run] [--yes]");
    process.exit(1);
  }

  const eventIdNum = Number.parseInt(eventRef, 10);
  const event = await prisma.event.findFirst({
    where: Number.isFinite(eventIdNum) && eventIdNum > 0
      ? { id: eventIdNum }
      : {
          OR: [
            { sbEventId: eventRef },
            { name: { contains: eventRef, mode: "insensitive" } },
            { name: { equals: eventRef, mode: "insensitive" } },
          ],
        },
    select: { id: true, name: true, sbEventId: true },
  });

  if (!event) {
    console.error("Event not found for:", eventRef);
    process.exit(1);
  }

  const rows = await prisma.sbListingPushLog.findMany({
    where: { eventId: event.id },
    select: {
      id: true,
      ok: true,
      sbTicketId: true,
      sbDeletedAt: true,
      inventoryRemovedAt: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const active = rows.filter((r) => r.ok && r.sbTicketId && !r.sbDeletedAt);
  const deleted = rows.filter((r) => r.sbDeletedAt != null);
  const other = rows.length - new Set([...active, ...deleted].map((r) => r.id)).size;

  console.log("Event:", event);
  console.log("Total push logs:", rows.length);
  console.log("Active (pushed, not deleted on SB):", active.length);
  console.log("Deleted on SB:", deleted.length);
  console.log("Other rows:", other);

  if (rows.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  for (const r of rows.slice(0, 15)) {
    console.log({
      id: r.id,
      sbTicketId: r.sbTicketId,
      ok: r.ok,
      sbDeletedAt: r.sbDeletedAt?.toISOString() ?? null,
      error: r.errorMessage?.slice(0, 40) ?? null,
    });
  }
  if (rows.length > 15) console.log(`… and ${rows.length - 15} more`);

  if (dryRun || !yes) {
    console.log("\nDry run — pass --yes to delete ALL rows for this event from sb_listing_push_logs.");
    return;
  }

  const result = await prisma.sbListingPushLog.deleteMany({ where: { eventId: event.id } });
  console.log("\nDeleted", result.count, "push log row(s) for event", event.id, `(${event.name}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
