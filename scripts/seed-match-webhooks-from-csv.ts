/**
 * Bulk upsert per-match Discord webhooks from a CSV file.
 *
 * CSV format (one row per match):
 *   matchNum,resaleWebhookUrl,shopWebhookUrl
 *
 * Empty URL cells are ignored (existing DB value kept on upsert for that column).
 *
 * Usage:
 *   node --import tsx scripts/seed-match-webhooks-from-csv.ts path/to/webhooks.csv
 *   npm run seed:match-webhooks-csv -- path/to/webhooks.csv
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

const DISCORD_WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i;

type CsvRow = {
  matchNum: number;
  resaleWebhookUrl: string | null;
  shopWebhookUrl: string | null;
};

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  const rows: CsvRow[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.toLowerCase().startsWith("matchnum")) continue;

    const parts = line.split(",").map((p) => p.trim());
    const matchNum = Number(parts[0]);
    if (!Number.isInteger(matchNum) || matchNum < 1 || matchNum > 104) continue;

    const resale = parts[1]?.trim() || null;
    const shop = parts[2]?.trim() || null;
    if (!resale && !shop) continue;

    rows.push({
      matchNum,
      resaleWebhookUrl: resale,
      shopWebhookUrl: shop,
    });
  }

  return rows.sort((a, b) => a.matchNum - b.matchNum);
}

function assertValidUrl(label: string, matchNum: number, url: string): void {
  if (!DISCORD_WEBHOOK_RE.test(url)) {
    throw new Error(`Invalid ${label} webhook for M${matchNum}: ${url.slice(0, 60)}…`);
  }
}

async function main() {
  const csvArg = process.argv[2]?.trim();
  if (!csvArg) {
    console.error("Usage: node --import tsx scripts/seed-match-webhooks-from-csv.ts <webhooks.csv>");
    process.exit(1);
  }

  const csvPath = path.resolve(csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found:", csvPath);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  if (rows.length === 0) {
    console.error("No valid rows in CSV");
    process.exit(1);
  }

  for (const row of rows) {
    if (row.resaleWebhookUrl) assertValidUrl("resale", row.matchNum, row.resaleWebhookUrl);
    if (row.shopWebhookUrl) assertValidUrl("shop", row.matchNum, row.shopWebhookUrl);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const row of rows) {
      if (row.resaleWebhookUrl && row.shopWebhookUrl) {
        await client.query(
          `INSERT INTO match_discord_webhooks (match_num, resale_webhook_url, shop_webhook_url, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (match_num) DO UPDATE SET
             resale_webhook_url = EXCLUDED.resale_webhook_url,
             shop_webhook_url = EXCLUDED.shop_webhook_url,
             updated_at = NOW()`,
          [row.matchNum, row.resaleWebhookUrl, row.shopWebhookUrl],
        );
      } else if (row.resaleWebhookUrl) {
        await client.query(
          `INSERT INTO match_discord_webhooks (match_num, resale_webhook_url, shop_webhook_url, updated_at)
           VALUES ($1, $2, NULL, NOW())
           ON CONFLICT (match_num) DO UPDATE SET
             resale_webhook_url = EXCLUDED.resale_webhook_url,
             updated_at = NOW()`,
          [row.matchNum, row.resaleWebhookUrl],
        );
      } else if (row.shopWebhookUrl) {
        await client.query(
          `INSERT INTO match_discord_webhooks (match_num, resale_webhook_url, shop_webhook_url, updated_at)
           VALUES ($1, NULL, $2, NOW())
           ON CONFLICT (match_num) DO UPDATE SET
             shop_webhook_url = EXCLUDED.shop_webhook_url,
             updated_at = NOW()`,
          [row.matchNum, row.shopWebhookUrl],
        );
      }
    }

    const { rows: configured } = await client.query<{ match_num: number }>(
      `SELECT match_num FROM match_discord_webhooks
       WHERE resale_webhook_url IS NOT NULL OR shop_webhook_url IS NOT NULL
       ORDER BY match_num`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          csv: path.basename(csvPath),
          seeded: rows.length,
          matchNums: rows.map((r) => r.matchNum),
          configuredTotal: configured.length,
          configuredMatchNums: configured.map((r) => r.match_num),
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
