/**
 * Post a test embed to Match N shop webhook (reads URL from DB).
 * Usage: node --import tsx scripts/test-match-discord-webhook.ts 17 shop
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import pg from "pg";

async function main() {
  const matchNum = Number(process.argv[2]);
  const kind = (process.argv[3] ?? "shop").toLowerCase();
  if (!Number.isInteger(matchNum) || matchNum < 1) {
    console.error("Usage: test-match-discord-webhook.ts <matchNum> [shop|resale]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const col = kind === "resale" ? "resale_webhook_url" : "shop_webhook_url";
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let webhookUrl: string | null = null;
  try {
    const { rows } = await client.query(
      `SELECT ${col} AS url FROM match_discord_webhooks WHERE match_num = $1`,
      [matchNum],
    );
    webhookUrl = rows[0]?.url ?? null;
  } finally {
    await client.end();
  }

  if (!webhookUrl) {
    console.error(`No ${kind} webhook configured for match ${matchNum}`);
    process.exit(1);
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `Test — Match ${matchNum} ${kind}`,
          description: "Local webhook routing test from eventdetail.",
          color: 0x2ecc71,
        },
      ],
    }),
  });

  const text = await res.text();
  console.log(JSON.stringify({ ok: res.ok, status: res.status, body: text.slice(0, 200) }, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
