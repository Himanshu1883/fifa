import { createPrismaClient } from "../src/lib/prisma";

type Args = {
  eventId: number | null;
  dryRun: boolean;
  yes: boolean;
};

function parseArgs(argv: string[]): Args {
  let eventId: number | null = null;
  let dryRun = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";

    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (a === "--yes" || a === "--confirm" || a === "-y") {
      yes = true;
      continue;
    }

    if (a === "--event-id") {
      const raw = argv[i + 1];
      i++;
      const n = raw ? Number(raw) : Number.NaN;
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid --event-id value: ${raw ?? ""}`);
      }
      eventId = n;
      continue;
    }

    if (a.startsWith("--event-id=")) {
      const raw = a.slice("--event-id=".length);
      const n = raw ? Number(raw) : Number.NaN;
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid --event-id value: ${raw}`);
      }
      eventId = n;
      continue;
    }

    if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage:",
          "  node --import tsx scripts/set-sock-available-all-resale.ts [--event-id 80] [--dry-run] [--yes]",
          "",
          "What it does:",
          "  - Converts all sock_available.kind=LAST_MINUTE rows to kind=RESALE (aka Source=Resale).",
          "  - If both RESALE and LAST_MINUTE exist for the same (event_id, resalemovementid),",
          "    it deletes the LAST_MINUTE row first to avoid unique conflicts.",
          "",
          "Safety:",
          "  - Use --dry-run to preview counts.",
          "  - Requires --yes to make changes.",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return { eventId, dryRun, yes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = createPrismaClient();

  const scope = args.eventId ?? null;

  const totals = await prisma.$queryRaw<Array<{ kind: "RESALE" | "LAST_MINUTE"; count: string }>>`
    SELECT kind, COUNT(*)::text AS count
    FROM "sock_available"
    WHERE (${scope}::int IS NULL OR event_id = ${scope})
    GROUP BY kind
    ORDER BY kind ASC
  `;

  const beforeResale = Number(totals.find((r) => r.kind === "RESALE")?.count ?? "0");
  const beforeLastMinute = Number(totals.find((r) => r.kind === "LAST_MINUTE")?.count ?? "0");

  const conflictRow = await prisma.$queryRaw<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count
    FROM (
      SELECT event_id, resalemovementid
      FROM "sock_available"
      WHERE (${scope}::int IS NULL OR event_id = ${scope})
        AND kind IN ('RESALE', 'LAST_MINUTE')
      GROUP BY event_id, resalemovementid
      HAVING COUNT(*) > 1
    ) t
  `;

  const conflictPairs = Number(conflictRow[0]?.count ?? "0");

  console.log(
    JSON.stringify(
      {
        scope: args.eventId ? { eventId: args.eventId } : "all_events",
        before: { resale: beforeResale, lastMinute: beforeLastMinute },
        conflictPairs,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );

  if (args.dryRun) {
    await prisma.$disconnect();
    return;
  }

  if (!args.yes) {
    await prisma.$disconnect();
    throw new Error("Refusing to modify database without --yes (or -y). Run with --dry-run to preview first.");
  }

  let deletedConflicts = 0;
  if (conflictPairs > 0) {
    deletedConflicts = await prisma.$executeRaw<number>`
      DELETE FROM "sock_available" AS s
      USING (
        SELECT event_id, resalemovementid
        FROM "sock_available"
        WHERE (${scope}::int IS NULL OR event_id = ${scope})
          AND kind IN ('RESALE', 'LAST_MINUTE')
        GROUP BY event_id, resalemovementid
        HAVING COUNT(*) > 1
      ) d
      WHERE s.kind = 'LAST_MINUTE'
        AND s.event_id = d.event_id
        AND s.resalemovementid = d.resalemovementid
        AND (${scope}::int IS NULL OR s.event_id = ${scope})
    `;
  }

  const updatedToResale = await prisma.$executeRaw<number>`
    UPDATE "sock_available"
    SET kind = 'RESALE'
    WHERE kind = 'LAST_MINUTE'
      AND (${scope}::int IS NULL OR event_id = ${scope})
  `;

  const afterTotals = await prisma.$queryRaw<Array<{ kind: "RESALE" | "LAST_MINUTE"; count: string }>>`
    SELECT kind, COUNT(*)::text AS count
    FROM "sock_available"
    WHERE (${scope}::int IS NULL OR event_id = ${scope})
    GROUP BY kind
    ORDER BY kind ASC
  `;

  const afterResale = Number(afterTotals.find((r) => r.kind === "RESALE")?.count ?? "0");
  const afterLastMinute = Number(afterTotals.find((r) => r.kind === "LAST_MINUTE")?.count ?? "0");

  console.log(
    JSON.stringify(
      {
        deletedConflicts,
        updatedToResale,
        after: { resale: afterResale, lastMinute: afterLastMinute },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

