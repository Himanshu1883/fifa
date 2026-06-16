/**
 * Local runner for SeatSidekick → Discord poll.
 * Usage: npm run seatsidekick:poll
 * Dry: npm run seatsidekick:poll:dry
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { runSeatsidekickDiscordPoll } from "../src/lib/seatsidekick-discord-poll";

async function main() {
  const dry =
    (process.env.SEATSIDEKICK_POLL_DRY ?? "").trim() === "1" ||
    process.argv.includes("--dry");
  if (dry) {
    process.env.SEATSIDEKICK_POLL_ENABLED = "1";
    console.log("[dry] Running poll (Discord sends still occur unless webhooks unset)");
  }

  const summary = await runSeatsidekickDiscordPoll();
  console.log(JSON.stringify(summary, null, 2));

  const failures = summary.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`\n${failures.length} match(es) failed`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
