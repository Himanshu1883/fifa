import { readFileSync } from "node:fs";
import { createPrismaClient } from "../src/lib/prisma";
import type { BuyingCriteriaRuleKind } from "../src/generated/prisma/client";

type Args = {
  csvPath: string;
  dryRun: boolean;
  yes: boolean;
  prod: boolean;
};

type CsvRow = Record<string, string>;

type ParsedRule =
  | {
      kind: "QTY_UNDER_PRICE";
      minQty: number;
      maxPriceUsdCents: number;
    }
  | {
      kind: "TOGETHER_UNDER_PRICE";
      togetherCount: number;
      maxPriceUsdCents: number;
    };

type ParsedRow = {
  matchNum: number;
  frontRow: boolean | null;
  catRules: Record<1 | 2 | 3 | 4, ParsedRule[]>;
};

function parseArgs(argv: string[]): Args {
  let csvPath = "/Users/shubkumar/Downloads/Untitled spreadsheet - Sheet1 (1).csv";
  let dryRun = true;
  let yes = false;
  let prod = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";

    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "--yes" || a === "-y") {
      yes = true;
      dryRun = false;
      continue;
    }
    if (a === "--prod") {
      prod = true;
      continue;
    }
    if (a === "--csv") {
      const raw = argv[i + 1];
      i++;
      if (!raw) throw new Error("Missing --csv value.");
      csvPath = raw;
      continue;
    }
    if (a.startsWith("--csv=")) {
      csvPath = a.slice("--csv=".length);
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage:",
          '  node --import tsx scripts/import-buying-criteria-from-csv.ts --csv "/path/to/file.csv" [--dry-run] [--yes --prod]',
          "",
          "What it does:",
          "  - Parses a spreadsheet-style CSV of per-match rules.",
          "  - Imports:",
          "      - Qty rule patterns like `80/$200` => QTY_UNDER_PRICE(minQty=80, max=$200).",
          "      - Together rule patterns like `x2 x3 /$650` => TOGETHER_UNDER_PRICE(2,$650) and (3,$650).",
          "      - CAT 3 FRONT ROW column => event_buying_criteria.cat3FrontRow (when set to YES/NO).",
          "",
          "Safety:",
          "  - Default is --dry-run.",
          "  - Requires --yes to write.",
          "  - Requires --prod if DATABASE_URL is not localhost (to avoid accidental prod writes).",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return { csvPath, dryRun, yes, prod };
}

function parseUsdToCents(amount: string): number {
  const trimmed = amount.trim().replaceAll(",", "");
  const [whole, frac = ""] = trimmed.split(".");
  const frac2 = (frac + "00").slice(0, 2);
  const dollars = Number(whole);
  const cents = Number(frac2);
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) throw new Error(`Invalid USD amount: ${amount}`);
  return dollars * 100 + cents;
}

function parseMatchNum(raw: string): number | null {
  const m = String(raw ?? "").trim().match(/match\s*(\d+)/i);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const headers: string[] = [];
  const rows: CsvRow[] = [];

  let curField = "";
  let curRow: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    curRow.push(curField);
    curField = "";
  };

  const pushRow = () => {
    // Drop trailing completely empty columns (this CSV has a trailing comma in the header row).
    while (curRow.length && curRow[curRow.length - 1]?.trim() === "") curRow.pop();
    if (curRow.length === 0) return;

    if (headers.length === 0) {
      for (const h of curRow) headers.push(String(h ?? "").trim());
      curRow = [];
      return;
    }

    const obj: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i] ?? `col_${i + 1}`;
      obj[key] = curRow[i] ?? "";
    }
    rows.push(obj);
    curRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1] ?? "";
        if (next === '"') {
          curField += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      curField += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    curField += ch;
  }

  // Flush last row
  pushField();
  pushRow();

  return { headers, rows };
}

function extractTogetherCounts(segment: string): number[] {
  const out: number[] = [];
  const re = /x\s*(\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    const n = Number.parseInt(m[1] ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) continue;
    out.push(n);
  }
  return out;
}

function extractUsdPrice(segment: string): string | null {
  const s = segment;
  const candidates: string[] = [];

  const dollarBefore = /\$\s*(\d+(?:\.\d{1,2})?)/g;
  const dollarAfter = /(\d+(?:\.\d{1,2})?)\s*\$/g;
  let m: RegExpExecArray | null;

  while ((m = dollarBefore.exec(s))) candidates.push(m[1] ?? "");
  while ((m = dollarAfter.exec(s))) candidates.push(m[1] ?? "");

  // Prefer the last price in the segment (often `x2 x3 /$650`)
  const last = candidates.at(-1)?.trim();
  return last ? last : null;
}

function parseQtyRulesFromCell(cell: string): Array<{ minQty: number; priceUsd: string }> {
  const out: Array<{ minQty: number; priceUsd: string }> = [];
  const text = String(cell ?? "").replaceAll("\r\n", "\n");

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.includes("section") || lower.includes("cat ")) continue;
    if (!/^\d+/.test(line)) continue;

    // `80/$200` or `80/200` or `80 / $200`
    const m = line.match(/^(\d+)\s*\/\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
    if (m) {
      const minQty = Number.parseInt(m[1] ?? "", 10);
      const priceUsd = String(m[2] ?? "").trim();
      if (Number.isFinite(minQty) && minQty > 0 && priceUsd) out.push({ minQty, priceUsd });
      continue;
    }

    // `100$400` (seen in the sheet)
    const m2 = line.match(/^(\d+)\s*\$+\s*(\d+(?:\.\d{1,2})?)/);
    if (m2) {
      const minQty = Number.parseInt(m2[1] ?? "", 10);
      const priceUsd = String(m2[2] ?? "").trim();
      if (Number.isFinite(minQty) && minQty > 0 && priceUsd) out.push({ minQty, priceUsd });
      continue;
    }
  }

  return out;
}

function parseTogetherRulesFromCell(cell: string): Array<{ togetherCount: number; priceUsd: string }> {
  const out: Array<{ togetherCount: number; priceUsd: string }> = [];
  const text = String(cell ?? "").replaceAll("\r\n", "\n");

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const counts = extractTogetherCounts(line);
    if (counts.length === 0) continue;

    const priceUsd = extractUsdPrice(line);
    if (!priceUsd) continue;

    for (const c of counts) out.push({ togetherCount: c, priceUsd });
  }

  // Also handle single-line cells where price is present but newlines weren't used.
  if (out.length === 0) {
    const counts = extractTogetherCounts(text);
    const priceUsd = extractUsdPrice(text);
    if (counts.length && priceUsd) for (const c of counts) out.push({ togetherCount: c, priceUsd });
  }

  return out;
}

function parseFrontRow(cell: string): boolean | null {
  const s = String(cell ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/(^|[^a-z])yes([^a-z]|$)/i.test(s)) return true;
  if (/(^|[^a-z])no([^a-z]|$)/i.test(s)) return false;
  return null;
}

function coerceRulesForCat(cell: string): ParsedRule[] {
  const rules: ParsedRule[] = [];

  for (const qr of parseQtyRulesFromCell(cell)) {
    try {
      rules.push({
        kind: "QTY_UNDER_PRICE",
        minQty: qr.minQty,
        maxPriceUsdCents: parseUsdToCents(qr.priceUsd),
      });
    } catch {
      // ignore
    }
  }

  for (const tr of parseTogetherRulesFromCell(cell)) {
    try {
      rules.push({
        kind: "TOGETHER_UNDER_PRICE",
        togetherCount: tr.togetherCount,
        maxPriceUsdCents: parseUsdToCents(tr.priceUsd),
      });
    } catch {
      // ignore
    }
  }

  return rules;
}

function parseSheetRow(row: CsvRow): ParsedRow | null {
  const matchNum = parseMatchNum(row["GAME NUMBER"] ?? row["Game Number"] ?? row["GAME"] ?? "");
  if (!matchNum) return null;

  const frontRow = parseFrontRow(row["CAT 3 FRONT ROW"] ?? "");

  const catRules = {
    1: coerceRulesForCat(row["CAT 1"] ?? ""),
    2: coerceRulesForCat(row["CAT 2"] ?? ""),
    3: coerceRulesForCat(row["CAT 3"] ?? ""),
    4: coerceRulesForCat(row["CAT 4"] ?? ""),
  } satisfies Record<1 | 2 | 3 | 4, ParsedRule[]>;

  return { matchNum, frontRow, catRules };
}

function kindToDb(kind: ParsedRule["kind"]): BuyingCriteriaRuleKind {
  // Prisma enum values match these exact strings.
  return kind;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL ?? "";
  const isLocalhost = /localhost|127\.0\.0\.1/.test(url);
  if (args.yes && !args.prod && !isLocalhost) {
    throw new Error("Refusing to write: DATABASE_URL is not localhost. Re-run with --yes --prod to confirm.");
  }

  const csvText = readFileSync(args.csvPath, "utf8");
  const { rows } = parseCsv(csvText);

  const parsed: ParsedRow[] = [];
  for (const r of rows) {
    const pr = parseSheetRow(r);
    if (pr) parsed.push(pr);
  }

  const prisma = createPrismaClient();
  const events = await prisma.event.findMany({ select: { id: true, matchLabel: true, name: true } });

  const eventIdByMatchNum = new Map<number, number>();
  for (const e of events) {
    const n = parseMatchNum(e.matchLabel) ?? parseMatchNum(e.name);
    if (n) eventIdByMatchNum.set(n, e.id);
  }

  let matched = 0;
  let missingEvent = 0;
  let frontRowUpdates = 0;
  let qtyRules = 0;
  let togetherRules = 0;

  const plan: Array<{
    eventId: number;
    matchNum: number;
    frontRow: boolean | null;
    catRules: ParsedRow["catRules"];
  }> = [];

  for (const r of parsed) {
    const eventId = eventIdByMatchNum.get(r.matchNum);
    if (!eventId) {
      missingEvent++;
      continue;
    }
    matched++;
    plan.push({ eventId, matchNum: r.matchNum, frontRow: r.frontRow, catRules: r.catRules });
    if (r.frontRow !== null) frontRowUpdates++;
    for (const c of [1, 2, 3, 4] as const) {
      for (const rule of r.catRules[c]) {
        if (rule.kind === "QTY_UNDER_PRICE") qtyRules++;
        else togetherRules++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        csv: { parsedRows: parsed.length, matchedEvents: matched, missingEvents: missingEvent },
        planned: { frontRowUpdates, qtyRules, togetherRules },
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
    throw new Error("Refusing to modify database without --yes. Re-run with --dry-run to preview.");
  }

  // Avoid a single long interactive transaction (can time out on prod DB).
  // Instead, snapshot per-event in a short transaction.
  let updatedFrontRow = 0;
  let deleted = 0;
  let inserted = 0;

  for (const item of plan) {
    const res = await prisma.$transaction(
      async (tx) => {
        let eventUpdatedFrontRow = 0;
        let eventDeleted = 0;
        let eventInserted = 0;

        if (item.frontRow !== null) {
          eventUpdatedFrontRow++;
          await tx.eventBuyingCriteria.upsert({
            where: { eventId: item.eventId },
            create: {
              eventId: item.eventId,
              cat1: null,
              cat2: null,
              cat3: null,
              cat3FrontRow: item.frontRow,
              cat4: null,
            },
            update: { cat3FrontRow: item.frontRow },
          });
        }

        for (const categoryNum of [1, 2, 3, 4] as const) {
          const rules = item.catRules[categoryNum];
          if (rules.length === 0) continue;

          const hasQty = rules.some((r) => r.kind === "QTY_UNDER_PRICE");
          const hasTogether = rules.some((r) => r.kind === "TOGETHER_UNDER_PRICE");

          const deleteKinds: BuyingCriteriaRuleKind[] = [];
          if (hasQty) deleteKinds.push("QTY_UNDER_PRICE");
          if (hasTogether) deleteKinds.push("TOGETHER_UNDER_PRICE");

          const delRes = await tx.eventBuyingCriteriaRule.deleteMany({
            where: { eventId: item.eventId, categoryNum, kind: { in: deleteKinds } },
          });
          eventDeleted += delRes.count;

          const createData = rules.map((r) => {
            if (r.kind === "QTY_UNDER_PRICE") {
              return {
                eventId: item.eventId,
                categoryNum,
                kind: kindToDb(r.kind),
                minQty: r.minQty,
                togetherCount: null,
                maxPriceUsdCents: r.maxPriceUsdCents,
              };
            }
            return {
              eventId: item.eventId,
              categoryNum,
              kind: kindToDb(r.kind),
              minQty: null,
              togetherCount: r.togetherCount,
              maxPriceUsdCents: r.maxPriceUsdCents,
            };
          });

          if (createData.length) {
            const insRes = await tx.eventBuyingCriteriaRule.createMany({ data: createData });
            eventInserted += insRes.count;
          }
        }

        return { eventUpdatedFrontRow, eventDeleted, eventInserted };
      },
      { timeout: 60_000 },
    );

    updatedFrontRow += res.eventUpdatedFrontRow;
    deleted += res.eventDeleted;
    inserted += res.eventInserted;
  }

  console.log(JSON.stringify({ ok: true, updatedFrontRow, deleted, inserted }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

