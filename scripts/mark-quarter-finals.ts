import { createPrismaClient } from "../src/lib/prisma";

const QUARTER_FINALS = "Quarter-Finals";
const MIN_MATCH = 97;
const MAX_MATCH = 100;

/** Match labels like Match1, Match 72, MATCH 42 (whole string, optional space after "Match"). */
const MATCH_LABEL_NUM = /^match\s*(\d+)$/i;

function parseMatchNumber(s: string): number | null {
  const m = MATCH_LABEL_NUM.exec(s.trim());
  if (!m) return null;
  return Number(m[1]);
}

function isQuarterFinalsMatchNumber(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_MATCH && n <= MAX_MATCH;
}

async function main() {
  const prisma = createPrismaClient();

  const rows = await prisma.event.findMany({
    select: { id: true, matchLabel: true, name: true },
  });

  const ids = new Set<number>();
  for (const row of rows) {
    const fromLabel = parseMatchNumber(row.matchLabel);
    if (fromLabel !== null && isQuarterFinalsMatchNumber(fromLabel)) {
      ids.add(row.id);
      continue;
    }
    const fromName = parseMatchNumber(row.name);
    if (fromName !== null && isQuarterFinalsMatchNumber(fromName)) {
      ids.add(row.id);
    }
  }

  const idList = [...ids];
  const result =
    idList.length === 0
      ? { count: 0 }
      : await prisma.event.updateMany({
          where: { id: { in: idList } },
          data: { stage: QUARTER_FINALS },
        });

  console.log(
    JSON.stringify({
      rule:
        'Events whose matchLabel OR name (trimmed, entire field) matches /^match\\s*(\\d+)$/i with N in 97..100',
      idsConsidered: idList.length,
      rowsUpdated: result.count,
    }),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
