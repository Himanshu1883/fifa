/**
 * Upsert per-match Discord webhooks from env vars (local testing).
 *
 * Usage (PowerShell):
 *   node --import tsx scripts/seed-match-discord-webhook.ts 17
 *
 * Reads MATCH{N}_SHOP_WEBHOOK_URL and MATCH{N}_RESALE_WEBHOOK_URL from .env.local.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

const DISCORD_WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\//i;

function normalizeUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function assertDiscordUrl(url: string | null): void {
  if (url && !DISCORD_WEBHOOK_RE.test(url)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
}

async function main() {
  const matchNum = Number(process.argv[2]);
  if (!Number.isInteger(matchNum) || matchNum < 1) {
    console.error("Usage: seed-match-discord-webhook.ts <matchNum>");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required in .env.local");
    process.exit(1);
  }

  const shop = normalizeUrl(process.env[`MATCH${matchNum}_SHOP_WEBHOOK_URL`]);
  const resale = normalizeUrl(process.env[`MATCH${matchNum}_RESALE_WEBHOOK_URL`]);

  if (!shop && !resale) {
    console.error(
      `Set MATCH${matchNum}_SHOP_WEBHOOK_URL and/or MATCH${matchNum}_RESALE_WEBHOOK_URL in .env.local`,
    );
    process.exit(1);
  }

  assertDiscordUrl(shop);
  assertDiscordUrl(resale);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO match_discord_webhooks (match_num, shop_webhook_url, resale_webhook_url, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (match_num) DO UPDATE SET
         shop_webhook_url = COALESCE(EXCLUDED.shop_webhook_url, match_discord_webhooks.shop_webhook_url),
         resale_webhook_url = COALESCE(EXCLUDED.resale_webhook_url, match_discord_webhooks.resale_webhook_url),
         updated_at = NOW()`,
      [matchNum, shop, resale],
    );

    const { rows } = await client.query(
      `SELECT match_num, shop_webhook_url IS NOT NULL AS shop_configured, resale_webhook_url IS NOT NULL AS resale_configured
       FROM match_discord_webhooks WHERE match_num = $1`,
      [matchNum],
    );

    console.log(JSON.stringify({ ok: true, row: rows[0] }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
