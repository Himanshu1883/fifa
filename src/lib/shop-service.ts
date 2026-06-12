import { buildMatchBuyUrl } from "@/lib/shop-buy-urls";
import type {
  ShopEventCatalogueMeta,
  ShopLatestPayload,
  ShopMarketEvent,
  ShopMarketListing,
  VivaLatestApiResponse,
  VivaMarketplaceListingEntry,
} from "@/lib/shop-marketplace-types";

/** Primary LMS marketplace feed (override with SHOP_API_URL in env). */
export const SHOP_API_URL =
  process.env.SHOP_API_URL?.trim() ||
  "https://www.vivalafifa.com/api/wc/2026/tickets/lms/latest";

/** Upper bound for upstream marketplace fetch (Vercel + slow upstream). */
export const SHOP_VIVA_FETCH_TIMEOUT_MS = 25_000;

const MARKET_KEY_RE = /^(\d+)-(.+)$/;

export const SHOP_CATEGORY_LABELS: Record<string, string> = {
  "1": "Category 1",
  "2": "Category 2",
  "3": "Category 3",
  "4": "Category 4",
  f1: "Final / Fan 1",
  f2: "Final / Fan 2",
  f3: "Final / Fan 3",
};

export function shopLog(message: string): void {
  console.log(`[SHOP] ${message}`);
}

export function categoryLabelForKey(categoryKey: string): string {
  return SHOP_CATEGORY_LABELS[categoryKey] ?? `Category ${categoryKey}`;
}

export function parseMarketKey(key: string): { matchNum: number; categoryKey: string } | null {
  const m = MARKET_KEY_RE.exec(key.trim());
  if (!m) return null;
  const matchNum = Number.parseInt(m[1], 10);
  if (!Number.isFinite(matchNum) || matchNum <= 0) return null;
  return { matchNum, categoryKey: m[2] };
}

function isListingEntry(v: unknown): v is VivaMarketplaceListingEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.available === "boolean";
}

export function parseVivaLatestResponse(body: unknown): VivaLatestApiResponse {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid API response: expected object");
  }
  const o = body as Record<string, unknown>;
  if (!o.results || typeof o.results !== "object" || Array.isArray(o.results)) {
    throw new Error("Invalid API response: missing results");
  }
  const scannedAt = typeof o.scannedAt === "string" ? o.scannedAt : new Date().toISOString();
  const results: Record<string, VivaMarketplaceListingEntry> = {};
  for (const [key, val] of Object.entries(o.results as Record<string, unknown>)) {
    if (!isListingEntry(val)) continue;
    const entry: VivaMarketplaceListingEntry = { available: val.available };
    if (typeof val.price === "number" && Number.isFinite(val.price)) {
      entry.price = val.price;
    }
    results[key] = entry;
  }
  return { results, scannedAt };
}

export type ShopEventMetaLookup = Map<number, ShopEventCatalogueMeta>;

export function defaultCatalogueMeta(matchNum: number): ShopEventCatalogueMeta {
  return {
    linkedEventId: null,
    eventName: `Match ${matchNum}`,
    matchLabel: `Match ${matchNum}`,
    stage: null,
    venue: null,
    country: null,
    eventDate: null,
    competition: "FIFA World Cup 2026",
  };
}

function buildListing(marketKey: string, categoryKey: string, entry: VivaMarketplaceListingEntry): ShopMarketListing {
  return {
    marketKey,
    categoryKey,
    categoryLabel: categoryLabelForKey(categoryKey),
    available: entry.available,
    price: typeof entry.price === "number" && Number.isFinite(entry.price) ? entry.price : null,
  };
}

function priceStats(listings: ShopMarketListing[]): {
  lowest: number | null;
  highest: number | null;
  average: number | null;
} {
  const prices = listings
    .filter((l) => l.available && l.price !== null)
    .map((l) => l.price as number);
  if (prices.length === 0) {
    return { lowest: null, highest: null, average: null };
  }
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    average: Math.round(sum / prices.length),
  };
}

export function normalizeVivaLatest(
  api: VivaLatestApiResponse,
  metaByMatch: ShopEventMetaLookup,
): ShopLatestPayload {
  const byMatch = new Map<
    number,
    { listings: ShopMarketListing[]; raw: Record<string, VivaMarketplaceListingEntry> }
  >();

  for (const [marketKey, entry] of Object.entries(api.results)) {
    const parsed = parseMarketKey(marketKey);
    if (!parsed) continue;
    let bucket = byMatch.get(parsed.matchNum);
    if (!bucket) {
      bucket = { listings: [], raw: {} };
      byMatch.set(parsed.matchNum, bucket);
    }
    bucket.listings.push(buildListing(marketKey, parsed.categoryKey, entry));
    bucket.raw[marketKey] = entry;
  }

  const events: ShopMarketEvent[] = [];
  for (const [matchNum, bucket] of byMatch.entries()) {
    bucket.listings.sort((a, b) => a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }));
    const stats = priceStats(bucket.listings);
    const availableCount = bucket.listings.filter((l) => l.available).length;
    const catalogue = metaByMatch.get(matchNum) ?? defaultCatalogueMeta(matchNum);

    events.push({
      matchNum,
      externalEventId: String(matchNum),
      catalogue,
      listings: bucket.listings,
      availableCount,
      listingsCount: bucket.listings.length,
      lowestPrice: stats.lowest,
      highestPrice: stats.highest,
      averagePrice: stats.average,
      currency: "USD",
      buyUrl: buildMatchBuyUrl(matchNum),
      rawPayload: bucket.raw,
    });
  }

  events.sort((a, b) => a.matchNum - b.matchNum);

  return {
    scannedAt: api.scannedAt,
    fetchedAt: new Date().toISOString(),
    events,
  };
}

export async function fetchVivaLatestMarketplace(signal?: AbortSignal): Promise<VivaLatestApiResponse> {
  shopLog(`Fetch started (${SHOP_API_URL})`);
  const timeoutSignal = AbortSignal.timeout(SHOP_VIVA_FETCH_TIMEOUT_MS);
  const combined =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
  let res: Response;
  try {
    res = await fetch(SHOP_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: combined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`Fetch failed: ${msg}`);
    throw new Error(`Network error: ${msg}`);
  }

  if (!res.ok) {
    shopLog(`Fetch HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}`);
  }

  const json: unknown = await res.json();
  const parsed = parseVivaLatestResponse(json);
  shopLog("Fetch success");
  return parsed;
}

/** Available priced categories only — used for Discord delta dedup (matches 1–104). */
export function shopDiscordNotifyFingerprint(event: ShopMarketEvent): string {
  const parts = event.listings
    .filter((l) => l.available && l.price !== null)
    .sort((a, b) => a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }))
    .map((l) => `${l.categoryKey}:${l.price}`);
  return parts.join(";");
}

/** Decode `catKey:price;...` notify fingerprints for embed diffs and subset checks. */
export function parseShopDiscordNotifyFingerprint(
  fingerprint: string | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!fingerprint) return map;
  for (const part of fingerprint.split(";")) {
    if (!part) continue;
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const key = part.slice(0, colon);
    const price = Number(part.slice(colon + 1));
    if (key && Number.isFinite(price)) map.set(key, price);
  }
  return map;
}

/** True when every priced category in `current` exists in `stored` at the same price. */
export function shopDiscordFingerprintCoveredByStored(
  current: string,
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;
  const storedMap = parseShopDiscordNotifyFingerprint(stored);
  const currentMap = parseShopDiscordNotifyFingerprint(current);
  for (const [key, price] of currentMap) {
    if (storedMap.get(key) !== price) return false;
  }
  return true;
}

/** Gate Discord delta sends on last successfully notified fingerprint only. */
export function shouldSendShopDiscordDelta(
  next: ShopMarketEvent,
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = shopDiscordNotifyFingerprint(next);
  if (!fingerprint) return false;
  const stored = storedFingerprint ?? null;
  if (stored === null) return true;
  if (fingerprint === stored) return false;
  if (shopDiscordFingerprintCoveredByStored(fingerprint, stored)) return false;
  return true;
}

/** Stable fingerprint for smart refresh (per event). */
export function shopEventFingerprint(event: ShopMarketEvent): string {
  const parts = event.listings.map(
    (l) => `${l.marketKey}:${l.available ? 1 : 0}:${l.price ?? ""}`,
  );
  return `${event.matchNum}|${event.availableCount}|${parts.join(";")}`;
}

export function mergeShopEvents(
  prev: ShopMarketEvent[],
  next: ShopMarketEvent[],
): { events: ShopMarketEvent[]; changedMatchNums: Set<number> } {
  const prevMap = new Map(prev.map((e) => [e.matchNum, e]));
  const changedMatchNums = new Set<number>();
  const events: ShopMarketEvent[] = [];

  for (const n of next) {
    const p = prevMap.get(n.matchNum);
    if (!p || shopEventFingerprint(p) !== shopEventFingerprint(n)) {
      changedMatchNums.add(n.matchNum);
    }
    events.push(n);
  }

  return { events, changedMatchNums };
}
