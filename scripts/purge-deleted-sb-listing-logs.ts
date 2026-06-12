/**
 * Remove deleted SB listing push logs from the database (cleans /sb-listings catalog).
 *
 *   npx tsx scripts/purge-deleted-sb-listing-logs.ts --dry-run
 *   npx tsx scripts/purge-deleted-sb-listing-logs.ts --yes
 *   npx tsx scripts/purge-deleted-sb-listing-logs.ts --yes --include-failed
 *   npx tsx scripts/purge-deleted-sb-listing-logs.ts --yes --sb-ticket 872971
 */

import { createPrismaClient } from "../src/lib/prisma";
import { sbPushLogExcludingClaimWhere } from "../src/lib/sb-listing-push-log-query";

const prisma = createPrismaClient();

function parseArgs(argv: string[]) {
  let dryRun = false;
  let yes = false;
  let includeFailed = false;
  let sbTicket = "";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--include-failed") includeFailed = true;
    else if (a === "--sb-ticket" && argv[i + 1]) sbTicket = String(argv[++i]).trim();
    else if (a.startsWith("--sb-ticket=")) sbTicket = a.slice("--sb-ticket=".length).trim();
    else if (a === "--help" || a === "-h") {
      console.log(`See script header for usage.`);
      process.exit(0);
    }
  }

  return { dryRun, yes, includeFailed, sbTicket };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const where = {
    ok: true,
    ...sbPushLogExcludingClaimWhere(),
    ...(args.sbTicket ? { sbTicketId: args.sbTicket } : {}),
    ...(args.includeFailed
      ? {
          OR: [{ sbDeletedAt: { not: null } }, { inventoryRemovedAt: { not: null } }],
        }
      : { sbDeletedAt: { not: null } }),
  };

  const rows = await prisma.sbListingPushLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      eventId: true,
      sbTicketId: true,
      sbDeletedAt: true,
      inventoryRemovedAt: true,
      sbDeleteError: true,
      createdAt: true,
    },
  });

  console.log(
    args.includeFailed
      ? "Target: deleted on SB OR any inventory-removed row (includes delete_failed)."
      : "Target: rows with sb_deleted_at set (successfully removed on SB).",
  );
  console.log("Rows to delete:", rows.length);

  if (rows.length === 0) {
    console.log("Nothing to purge.");
    return;
  }

  for (const r of rows.slice(0, 20)) {
    console.log({
      id: r.id,
      eventId: r.eventId,
      sbTicketId: r.sbTicketId,
      sbDeletedAt: r.sbDeletedAt?.toISOString() ?? null,
      failed: Boolean(r.inventoryRemovedAt && r.sbDeleteError && !r.sbDeletedAt),
    });
  }
  if (rows.length > 20) console.log(`… and ${rows.length - 20} more`);

  if (args.dryRun || !args.yes) {
    console.log("\nDry run — pass --yes to delete these rows from sb_listing_push_logs.");
    return;
  }

  const result = await prisma.sbListingPushLog.deleteMany({ where });
  console.log("\nDeleted", result.count, "push log row(s).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
