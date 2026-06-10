/**
 * Simulates M48 duplicate-send scenario + M4 partial delta embed scenario.
 * Run: DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/test-shop-discord-dedup.ts
 */
import "dotenv/config";
import { shopDiscordNotifyFingerprint } from "../src/lib/shop-service";
import type { ShopMarketEvent, ShopMarketListing } from "../src/lib/shop-marketplace-types";

function dedupeShopEventsByMatchNum(events: ShopMarketEvent[]): ShopMarketEvent[] {
  const map = new Map<number, ShopMarketEvent>();
  for (const event of events) {
    map.set(event.matchNum, event);
  }
  return [...map.values()].sort((a, b) => a.matchNum - b.matchNum);
}

function listing(
  categoryKey: string,
  label: string,
  price: number,
  available = true,
): ShopMarketListing {
  return {
    marketKey: categoryKey,
    categoryKey,
    categoryLabel: label,
    available,
    price,
  };
}

function shopEvent(
  matchNum: number,
  name: string,
  listings: ShopMarketListing[],
): ShopMarketEvent {
  const priced = listings.filter((l) => l.available && l.price !== null);
  const prices = priced.map((l) => l.price as number);
  return {
    matchNum,
    externalEventId: String(matchNum),
    catalogue: {
      linkedEventId: null,
      eventName: name,
      matchLabel: `Match ${matchNum}`,
      stage: null,
      venue: null,
      country: null,
      eventDate: null,
      competition: "FIFA World Cup 2026",
    },
    listings,
    availableCount: listings.filter((l) => l.available).length,
    listingsCount: listings.length,
    lowestPrice: prices.length ? Math.min(...prices) : null,
    highestPrice: prices.length ? Math.max(...prices) : null,
    averagePrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    currency: "EUR",
    buyUrl: null,
    rawPayload: {},
  };
}

function m48Event(price = 1945): ShopMarketEvent {
  return shopEvent(48, "Colombia vs Congo DR", [listing("cat1", "Category 1", price)]);
}

function m4Event(extra: ShopMarketListing[] = []): ShopMarketEvent {
  const base = [
    listing("cat1", "Category 1", 2735),
    listing("fan1", "Fan 1", 2735),
    listing("fan2", "Fan 2", 1940),
  ];
  return shopEvent(4, "USA vs Paraguay", [...base, ...extra]);
}

function shouldSendDelta(
  next: ShopMarketEvent,
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = shopDiscordNotifyFingerprint(next);
  if (!fingerprint) return false;
  return fingerprint !== (storedFingerprint ?? null);
}

/** Mirror of shop-discord-webhook computeChangedListings (avoid server-only imports in script). */
function computeChangedListings(
  prev: ShopMarketEvent | undefined,
  next: ShopMarketEvent,
): ShopMarketListing[] {
  const prevByKey = new Map<string, number>();
  for (const listing of prev?.listings ?? []) {
    if (listing.available && listing.price !== null) {
      prevByKey.set(listing.categoryKey, listing.price);
    }
  }
  const changed: ShopMarketListing[] = [];
  for (const listing of next.listings) {
    if (!listing.available || listing.price === null) continue;
    const prevPrice = prevByKey.get(listing.categoryKey);
    if (prevPrice === undefined || prevPrice !== listing.price) {
      changed.push(listing);
    }
  }
  return changed.sort((a, b) =>
    a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }),
  );
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

// --- Scenario 4: M4 partial delta — only newly appeared categories ---
const m4Prev = m4Event();
const m4Next = m4Event([
  listing("cat2", "Category 2", 1120),
  listing("cat3", "Category 3", 1120),
]);
const m4Changed = computeChangedListings(m4Prev, m4Next);
console.assert(m4Changed.length === 2, `M4 changed count: ${m4Changed.length}`);
console.assert(
  m4Changed.every((l) => l.categoryKey === "cat2" || l.categoryKey === "cat3"),
  "M4 changed: only cat2 and cat3",
);
console.assert(
  !m4Changed.some((l) => ["cat1", "fan1", "fan2"].includes(l.categoryKey)),
  "M4 changed: excludes unchanged categories",
);
const m4FpPrev = shopDiscordNotifyFingerprint(m4Prev);
const m4FpNext = shopDiscordNotifyFingerprint(m4Next);
console.assert(m4FpPrev !== m4FpNext, "M4 fingerprint changes when cat2/cat3 appear");
console.assert(shouldSendDelta(m4Next, m4FpPrev), "M4 send when fingerprint differs");
console.assert(!shouldSendDelta(m4Next, m4FpNext), "M4 skip when fingerprint matches stored");

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
    console.log("M48 + M4 shop Discord dedup tests passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
