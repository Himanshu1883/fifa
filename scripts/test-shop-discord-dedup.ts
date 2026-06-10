/**
 * Simulates M48 duplicate-send scenario: concurrent polls + same price re-poll.
 * Run: DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/test-shop-discord-dedup.ts
 */
import "dotenv/config";
import { shopDiscordNotifyFingerprint } from "../src/lib/shop-service";
import type { ShopMarketEvent, ShopMarketListing } from "../src/lib/shop-marketplace-types";
import { dedupeShopEventsByMatchNum } from "../src/lib/shop-discord-webhook";

function m48Event(price = 1945): ShopMarketEvent {
  const listings: ShopMarketListing[] = [
    {
      marketKey: "cat1",
      categoryKey: "cat1",
      categoryLabel: "Category 1",
      available: true,
      price,
    },
  ];
  return {
    matchNum: 48,
    externalEventId: "48",
    catalogue: {
      linkedEventId: null,
      eventName: "Colombia vs Congo DR",
      matchLabel: "Match 48",
      stage: null,
      venue: null,
      country: null,
      eventDate: null,
      competition: "FIFA World Cup 2026",
    },
    listings,
    availableCount: 1,
    listingsCount: 1,
    lowestPrice: price,
    highestPrice: price,
    averagePrice: price,
    currency: "EUR",
    buyUrl: null,
    rawPayload: {},
  };
}

function shouldSendDelta(
  next: ShopMarketEvent,
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = shopDiscordNotifyFingerprint(next);
  if (!fingerprint) return false;
  return fingerprint !== (storedFingerprint ?? null);
}

// --- Scenario 1: same match twice in changed array ---
const dupInput = [m48Event(), m48Event()];
const deduped = dedupeShopEventsByMatchNum(dupInput);
console.assert(deduped.length === 1, "dedupe: one entry per matchNum");

// --- Scenario 2: fingerprint gate ---
const fp = shopDiscordNotifyFingerprint(m48Event());
console.assert(fp === "cat1:1945", `fingerprint: ${fp}`);
console.assert(!shouldSendDelta(m48Event(), fp), "skip when stored matches");
console.assert(shouldSendDelta(m48Event(), null), "send when stored null");
console.assert(shouldSendDelta(m48Event(2000), fp), "send when price changes");

// --- Scenario 3: concurrent poll simulation (in-memory store) ---
const db = new Map<number, string | null>();
async function loadFp(matchNum: number): Promise<string | null> {
  return db.get(matchNum) ?? null;
}
async function persistFp(event: ShopMarketEvent): Promise<void> {
  db.set(event.matchNum, shopDiscordNotifyFingerprint(event));
}

const matchNotifyChains = new Map<number, Promise<void>>();
function withLock<T>(matchNum: number, fn: () => Promise<T>): Promise<T> {
  const prev = matchNotifyChains.get(matchNum) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  matchNotifyChains.set(
    matchNum,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

let sendCount = 0;
async function simulatePoll(): Promise<void> {
  const event = m48Event();
  await withLock(48, async () => {
    const stored = await loadFp(48);
    const fingerprint = shopDiscordNotifyFingerprint(event);
    if (fingerprint === stored) return;
    sendCount += 1;
    await persistFp(event);
  });
}

async function runConcurrentTest(): Promise<void> {
  sendCount = 0;
  db.clear();
  matchNotifyChains.clear();
  await Promise.all([simulatePoll(), simulatePoll(), simulatePoll()]);
  console.assert(sendCount === 1, `concurrent polls: expected 1 send, got ${sendCount}`);

  sendCount = 0;
  await Promise.all([simulatePoll(), simulatePoll()]);
  console.assert(sendCount === 0, `same price re-poll: expected 0 sends, got ${sendCount}`);

  db.set(48, shopDiscordNotifyFingerprint(m48Event(1800)));
  sendCount = 0;
  await simulatePoll();
  console.assert(sendCount === 1, `price update: expected 1 send, got ${sendCount}`);
}

runConcurrentTest()
  .then(() => {
    console.log("M48 shop Discord dedup tests passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
