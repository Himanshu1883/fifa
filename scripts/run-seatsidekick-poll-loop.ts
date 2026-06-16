/**
 * Run SeatSidekick → Discord poll on an interval (local scheduler).
 * Default every 120s. Production Vercel cron min is 1 minute (see vercel.json).
 *
 * Usage: npm run seatsidekick:poll:loop
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { runSeatsidekickDiscordPoll } from "../src/lib/seatsidekick-discord-poll";

const DEFAULT_INTERVAL_MS = 120_000;
const INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.SEATSIDEKICK_POLL_INTERVAL_MS ?? DEFAULT_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
);

async function tick(label: string) {
  const started = Date.now();
  console.log(`\n[${new Date().toISOString()}] ${label}`);
  try {
    const summary = await runSeatsidekickDiscordPoll();
    console.log(
      JSON.stringify(
        {
          ok: summary.ok,
          postMode: summary.postMode,
          postTopN: summary.postTopN,
          generalWebhookConfigured: summary.generalWebhookConfigured,
          polled: summary.polled,
          notified: summary.notified,
          skipped: summary.skipped,
          failed: summary.failed,
          ms: Date.now() - started,
        },
        null,
        2,
      ),
    );
    if (!summary.generalWebhookConfigured) {
      console.warn(
        "WARN: DISCORD_NEW_LISTINGS_WEBHOOK_URL (#resale-drop) not set — only per-match channels receive posts.",
      );
    }
  } catch (e) {
    console.error(e);
  }
}

async function main() {
  console.log(`SeatSidekick poll loop every ${INTERVAL_MS / 1000}s (Ctrl+C to stop)`);
  await tick("initial run");
  setInterval(() => {
    void tick("scheduled run");
  }, INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
