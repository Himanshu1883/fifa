/**
 * Delete ALL SB listing push logs from the database (all events, active + deleted + failed).
 *
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-all-sb-listing-logs.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-all-sb-listing-logs.ts --yes
 */
import { prisma } from "../src/lib/prisma";
import { sbPushLogExcludingClaimWhere } from "../src/lib/sb-listing-push-log-query";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let yes = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes" || a === "-y") yes = true;
  }
  return { dryRun, yes };
}

async function main() {
  const { dryRun, yes } = parseArgs(process.argv.slice(2));

  const total = await prisma.sbListingPushLog.count();
  const catalogWhere = { ok: true, ...sbPushLogExcludingClaimWhere() };
  const catalogVisible = await prisma.sbListingPushLog.count({ where: catalogWhere });
  const active = await prisma.sbListingPushLog.count({
    where: { ...catalogWhere, sbDeletedAt: null },
  });
  const deleted = await prisma.sbListingPushLog.count({
    where: { ...catalogWhere, sbDeletedAt: { not: null } },
  });
  const byEvent = await prisma.sbListingPushLog.groupBy({
    by: ["eventId"],
    _count: { _all: true },
    orderBy: { _count: { eventId: "desc" } },
  });

  console.log("SB listing push logs (all events):");
  console.log({
    totalRows: total,
    catalogUiAll: catalogVisible,
    catalogUiActive: active,
    catalogUiDeleted: deleted,
    eventCount: byEvent.length,
  });

  if (total === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (dryRun || !yes) {
    console.log("\nDry run — pass --yes to delete ALL rows from sb_listing_push_logs.");
    return;
  }

  const result = await prisma.sbListingPushLog.deleteMany({});
  console.log("\nDeleted", result.count, "push log row(s) across all events.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
