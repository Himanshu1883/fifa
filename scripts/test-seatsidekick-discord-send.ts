/**
 * Fetch one SeatSidekick match and post listings to Discord (resale format).
 *
 * Usage:
 *   npm run seatsidekick:test-send
 *   npm run seatsidekick:test-send -- 10229226700904 17
 *   npm run seatsidekick:test-send -- 10229226700904 17 --limit 23
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import pg from "pg";
import { fetchSeatsidekickMatch } from "../src/lib/seatsidekick-fetch";
import {
  flattenSeatsidekickToSnapshot,
  seatsidekickMatchLabel,
  seatsidekickMatchName,
  snapshotSeatToListingKey,
} from "../src/lib/seatsidekick-listings";
import {
  postSeatsidekickListingsDualDiscord,
  dualDiscordPostSucceeded,
} from "../src/lib/seatsidekick-discord-post";
import { resolveMatchResaleWebhookUrlDedicatedOnly } from "../src/lib/match-discord-webhooks";
import { resolveDiscordNewListingsWebhookUrl } from "../src/lib/webhook-settings";

import { sortNewListingsByPriceAsc } from "../src/lib/sock-available-diff";

const DEFAULT_PERF = "10229226700904";
const DEFAULT_MATCH = 17;

function parseArgs(): { performanceId: string; matchNum: number; limit: number | null } {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  let limit: number | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit" && argv[i + 1]) {
      limit = Number(argv[i + 1]);
      i++;
      continue;
    }
    positional.push(argv[i]);
  }
  const performanceId = (positional[0] ?? DEFAULT_PERF).trim();
  const matchNum = Number(positional[1] ?? DEFAULT_MATCH);
  const resolvedLimit = limit ?? 20;
  if (!performanceId || !Number.isInteger(matchNum) || matchNum < 1) {
    console.error("Usage: test-seatsidekick-discord-send.ts [performanceId] [matchNum] [--limit N]");
    process.exit(1);
  }
  return { performanceId, matchNum, limit: resolvedLimit };
}

async function resolveEventId(performanceId: string): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return 0;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: number }>(
      `SELECT id FROM "Event" WHERE pref_id = $1 OR resale_pref_id = $1 LIMIT 1`,
      [performanceId],
    );
    return rows[0]?.id ?? 0;
  } catch {
    return 0;
  } finally {
    await client.end();
  }
}

async function main() {
  const { performanceId, matchNum, limit } = parseArgs();

  console.log(`Fetching SeatSidekick ${performanceId} (Match ${matchNum})…`);
  const data = await fetchSeatsidekickMatch(performanceId);
  const snapshot = flattenSeatsidekickToSnapshot(data);
  const seatCount = Object.keys(snapshot.seats).length;
  console.log(`Seats on SeatSidekick: ${seatCount}`);

  let listings = Object.entries(snapshot.seats).map(([seatId, seat]) =>
    snapshotSeatToListingKey(seatId, seat),
  );
  listings = sortNewListingsByPriceAsc(listings);
  if (limit != null && Number.isFinite(limit) && limit > 0) {
    listings = listings.slice(0, limit);
  }

  const eventLabel = seatsidekickMatchLabel(matchNum);
  const eventName = seatsidekickMatchName(data.match);
  const eventId = await resolveEventId(performanceId);

  const dedicated = await resolveMatchResaleWebhookUrlDedicatedOnly(matchNum);
  const general = await resolveDiscordNewListingsWebhookUrl();
  if (!dedicated && !general) {
    console.error("No resale webhook configured (match DB row or DISCORD_NEW_LISTINGS_WEBHOOK_URL)");
    process.exit(1);
  }

  console.log(
    `Posting ${listings.length} listing(s) as 2 separate messages when both webhooks set — dedicated: ${dedicated ? "yes" : "no"}, #resale-drop: ${general ? "yes" : "no"}`,
  );

  const dual = await postSeatsidekickListingsDualDiscord({
    eventLabel,
    eventName,
    eventId,
    prefId: performanceId,
    matchNum,
    newCount: listings.length,
    newSeatIds: listings,
    dedicatedWebhookUrl: dedicated,
    generalWebhookUrl: general,
    titleOverride: `🆕 ${listings.length.toLocaleString("en-US")} lowest resale listing${listings.length === 1 ? "" : "s"}`,
  });

  console.log(
    JSON.stringify(
      {
        seatCount,
        posted: listings.length,
        dedicated: dual.dedicated,
        general: dual.general,
        combined: dual.combined,
      },
      null,
      2,
    ),
  );
  if (dual.combined.attempted && !dualDiscordPostSucceeded(dual)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
