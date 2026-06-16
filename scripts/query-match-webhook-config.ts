/**
 * Print configured per-match Discord webhook counts from DATABASE_URL.
 * Usage: node --import tsx scripts/query-match-webhook-config.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{
      match_num: number;
      has_resale: number;
      has_shop: number;
    }>(`
      SELECT match_num,
             CASE WHEN resale_webhook_url IS NOT NULL THEN 1 ELSE 0 END AS has_resale,
             CASE WHEN shop_webhook_url IS NOT NULL THEN 1 ELSE 0 END AS has_shop
      FROM match_discord_webhooks
      WHERE resale_webhook_url IS NOT NULL OR shop_webhook_url IS NOT NULL
      ORDER BY match_num`);

    const shop = rows.filter((r) => r.has_shop).map((r) => r.match_num);
    const resale = rows.filter((r) => r.has_resale).map((r) => r.match_num);

    console.log(
      JSON.stringify(
        {
          shopCount: shop.length,
          shopRange: shop.length ? [shop[0], shop[shop.length - 1]] : null,
          shopAbove50: shop.filter((n) => n > 50),
          resaleCount: resale.length,
          resaleRange: resale.length ? [resale[0], resale[resale.length - 1]] : null,
          resaleAbove50: resale.filter((n) => n > 50),
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
