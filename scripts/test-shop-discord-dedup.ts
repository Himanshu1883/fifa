/**
 * Simulates M48 duplicate-send scenario + M4 partial delta / flicker embed scenario.
 * Run: DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/test-shop-discord-dedup.ts
 */
import "dotenv/config";
import {
  shopDiscordNotifyFingerprint,
  shouldSendShopDiscordDelta,
  shopDiscordFingerprintCoveredByStored,
} from "../src/lib/shop-service";
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
    listing("1", "Category 1", 2735),
    listing("f1", "Final / Fan 1", 2735),
    listing("f2", "Final / Fan 2", 1940),
  ];
  return shopEvent(4, "USA vs Paraguay", [...base, ...extra]);
}

function m4EventFan1Only(): ShopMarketEvent {
  return shopEvent(4, "USA vs Paraguay", [
    listing("1", "Category 1", 2735),
    listing("f1", "Final / Fan 1", 2735),
  ]);
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

function computeChangedListingsFromStoredFingerprint(
  storedFingerprint: string | null | undefined,
  next: ShopMarketEvent,
): ShopMarketListing[] {
  const prevByKey = new Map<string, number>();
  if (storedFingerprint) {
    for (const part of storedFingerprint.split(";")) {
      if (!part) continue;
      const colon = part.indexOf(":");
      if (colon <= 0) continue;
      const key = part.slice(0, colon);
      const price = Number(part.slice(colon + 1));
      if (key && Number.isFinite(price)) prevByKey.set(key, price);
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
console.assert(!shouldSendShopDiscordDelta(m48Event(), fp), "skip when stored matches");
console.assert(shouldSendShopDiscordDelta(m48Event(), null), "send when stored null");
console.assert(shouldSendShopDiscordDelta(m48Event(2000), fp), "send when price changes");

// --- Scenario 4: M4 partial delta — only newly appeared categories ---
const m4Prev = m4Event();
const m4Next = m4Event([
  listing("2", "Category 2", 1120),
  listing("3", "Category 3", 1120),
]);
const m4Changed = computeChangedListings(m4Prev, m4Next);
console.assert(m4Changed.length === 2, `M4 changed count: ${m4Changed.length}`);
console.assert(
  m4Changed.every((l) => l.categoryKey === "2" || l.categoryKey === "3"),
  "M4 changed: only cat2 and cat3",
);
console.assert(
  !m4Changed.some((l) => ["1", "f1", "f2"].includes(l.categoryKey)),
  "M4 changed: excludes unchanged categories",
);
const m4FpPrev = shopDiscordNotifyFingerprint(m4Prev);
const m4FpNext = shopDiscordNotifyFingerprint(m4Next);
console.assert(m4FpPrev !== m4FpNext, "M4 fingerprint changes when cat2/cat3 appear");
console.assert(shouldSendShopDiscordDelta(m4Next, m4FpPrev), "M4 send when fingerprint differs");
console.assert(!shouldSendShopDiscordDelta(m4Next, m4FpNext), "M4 skip when fingerprint matches stored");

// --- Scenario 5: M4 identical resend (8:16 + 8:18 bug) — claim-before-send ---
const m4Fp = shopDiscordNotifyFingerprint(m4Event());
console.assert(m4Fp === "1:2735;f1:2735;f2:1940", `M4 fingerprint: ${m4Fp}`);

function m101Event(): ShopMarketEvent {
  return shopEvent(101, "Match 101", [
    listing("1", "Category 1", 3710),
    listing("f1", "Final / Fan 1", 11130),
    listing("f2", "Final / Fan 2", 4330),
  ]);
}

async function claimBeforeSend(
  event: ShopMarketEvent,
  db: Map<number, string | null>,
  notifyLog: Set<string>,
): Promise<"send" | "skip"> {
  const fp = shopDiscordNotifyFingerprint(event);
  if (!fp) return "skip";
  const stored = db.get(event.matchNum) ?? null;
  if (!shouldSendShopDiscordDelta(event, stored)) return "skip";
  const logKey = `${event.matchNum}:${fp}`;
  if (notifyLog.has(logKey)) {
    if (stored !== fp) db.set(event.matchNum, fp);
    return "skip";
  }
  db.set(event.matchNum, fp);
  notifyLog.add(logKey);
  return "send";
}

async function runM4IdenticalResendTest(): Promise<void> {
  const m4Db = new Map<number, string | null>();
  const notifyLog = new Set<string>();
  let sendCount = 0;

  const first = await claimBeforeSend(m4Event(), m4Db, notifyLog);
  if (first === "send") sendCount += 1;

  const second = await claimBeforeSend(m4Event(), m4Db, notifyLog);
  if (second === "send") sendCount += 1;

  console.assert(first === "send", "M4 first poll should send");
  console.assert(second === "skip", "M4 second identical poll should skip");
  console.assert(sendCount === 1, `M4 identical resend: expected 1 send, got ${sendCount}`);
}

// --- Scenario 6: M4 API flicker — f1+f2 → f1 only → f1+f2 same prices ---
async function runM4FlickerTest(): Promise<void> {
  const m4Db = new Map<number, string | null>();
  const notifyLog = new Set<string>();
  let sendCount = 0;

  const fullFp = shopDiscordNotifyFingerprint(m4Event());
  const fan1OnlyFp = shopDiscordNotifyFingerprint(m4EventFan1Only());
  console.assert(fullFp === "1:2735;f1:2735;f2:1940", `M4 full fp: ${fullFp}`);
  console.assert(fan1OnlyFp === "1:2735;f1:2735", `M4 fan1-only fp: ${fan1OnlyFp}`);
  console.assert(
    shopDiscordFingerprintCoveredByStored(fan1OnlyFp, fullFp),
    "fan1-only is subset of full notified state",
  );
  console.assert(
    !shouldSendShopDiscordDelta(m4EventFan1Only(), fullFp),
    "skip flicker poll when stored has fuller state",
  );
  console.assert(
    !shouldSendShopDiscordDelta(m4Event(), fullFp),
    "skip when returning to same stored fingerprint",
  );

  const poll1 = await claimBeforeSend(m4Event(), m4Db, notifyLog);
  if (poll1 === "send") sendCount += 1;

  const poll2 = await claimBeforeSend(m4EventFan1Only(), m4Db, notifyLog);
  if (poll2 === "send") sendCount += 1;

  const poll3 = await claimBeforeSend(m4Event(), m4Db, notifyLog);
  if (poll3 === "send") sendCount += 1;

  console.assert(poll1 === "send", "M4 flicker poll1 should send");
  console.assert(poll2 === "skip", "M4 flicker poll2 (partial) should skip");
  console.assert(poll3 === "skip", "M4 flicker poll3 (restore) should skip");
  console.assert(sendCount === 1, `M4 flicker: expected 1 send total, got ${sendCount}`);

  const embedDiff = computeChangedListingsFromStoredFingerprint(null, m4Event());
  console.assert(embedDiff.length === 3, `first send embed shows all priced cats: ${embedDiff.length}`);

  const flickerEmbedDiff = computeChangedListingsFromStoredFingerprint(fullFp, m4EventFan1Only());
  console.assert(
    flickerEmbedDiff.length === 0,
    `partial flicker has no embed diff vs stored: ${flickerEmbedDiff.length}`,
  );
}

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
    if (!shouldSendShopDiscordDelta(event, stored)) return;
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

async function runM101IdenticalResendTest(): Promise<void> {
  const m101Db = new Map<number, string | null>();
  const notifyLog = new Set<string>();
  let sendCount = 0;

  const fp = shopDiscordNotifyFingerprint(m101Event());
  console.assert(fp === "1:3710;f1:11130;f2:4330", `M101 fingerprint: ${fp}`);

  const first = await claimBeforeSend(m101Event(), m101Db, notifyLog);
  if (first === "send") sendCount += 1;

  // Simulate 5+ minutes later — stored cleared (old deploy) but notify log retained
  m101Db.set(101, null);

  const second = await claimBeforeSend(m101Event(), m101Db, notifyLog);
  if (second === "send") sendCount += 1;

  console.assert(first === "send", "M101 first poll should send");
  console.assert(second === "skip", "M101 second identical poll should skip via notify log");
  console.assert(sendCount === 1, `M101 identical resend: expected 1 send, got ${sendCount}`);
  console.assert(m101Db.get(101) === fp, "M101 notify log self-heals stored fingerprint");
}

runConcurrentTest()
  .then(() => runM4IdenticalResendTest())
  .then(() => runM4FlickerTest())
  .then(() => runM101IdenticalResendTest())
  .then(() => {
    console.log("M48 + M4 + M101 shop Discord dedup tests passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
