import "server-only";

import type {
  ShopLatestPayload,
  ShopMarketEvent,
  ShopMarketListing,
} from "@/lib/shop-marketplace-types";
import { shopDiscordNotifyFingerprint, shopLog } from "@/lib/shop-service";
import {
  sendShopBaselineToDiscord,
  sendShopDeltaToDiscord,
  type ShopDiscordNotifyResult,
} from "@/lib/shop-discord-webhook";
import {
  isShopDiscordBaselineSent,
  markShopDiscordBaselineSent,
  resolveDiscordShopWebhookUrl,
} from "@/lib/webhook-settings";
import { persistShopDiscordNotifyLog } from "@/lib/shop-discord-log";
import { emptyShopMarketEvent, ensureAllShopMatches } from "@/lib/shop-match-grid";
import {
  bootstrapShopDiscordNotifyFingerprints,
  loadShopDiscordNotifyFingerprints,
} from "@/lib/shop-sync-service";

export type ShopDiscordNotifySummary = {
  attempted: boolean;
  ok: boolean;
  mode: "baseline" | "delta" | "skipped";
  results: ShopDiscordNotifyResult[];
  changedCount: number;
  /** Matches successfully sent — persist fingerprints after DB sync. */
  notifiedEvents: ShopMarketEvent[];
};

function listingByCategory(listings: ShopMarketListing[]): Map<string, ShopMarketListing> {
  return new Map(listings.map((l) => [l.categoryKey, l]));
}

/**
 * True when an available category's price changed vs the previous scrape.
 * Ignores availability-only flips, stock-outs, and unpriced listings.
 */
function isMatchPriceChanged(prev: ShopMarketEvent | undefined, next: ShopMarketEvent): boolean {
  const nextPriced = next.listings.filter((l) => l.available && l.price !== null);
  if (nextPriced.length === 0) return false;

  const prevByCategory = listingByCategory(prev?.listings ?? []);

  for (const nextListing of nextPriced) {
    const prevListing = prevByCategory.get(nextListing.categoryKey);
    if (prevListing?.available && prevListing.price !== nextListing.price) {
      return true;
    }
  }

  return false;
}

/**
 * Delta candidate: priced stock, fingerprint differs from last notify, and either
 * an available category price changed vs previous scrape or this is a new price state.
 */
function shouldSendDelta(
  prev: ShopMarketEvent | undefined,
  next: ShopMarketEvent,
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = shopDiscordNotifyFingerprint(next);
  if (!fingerprint) return false;
  if (fingerprint === (storedFingerprint ?? null)) return false;

  if (isMatchPriceChanged(prev, next)) return true;

  const prevFingerprint = shopDiscordNotifyFingerprint(
    prev ?? emptyShopMarketEvent(next.matchNum),
  );
  return fingerprint !== prevFingerprint;
}

function diffDeltaEvents(
  prev: ShopMarketEvent[],
  next: ShopMarketEvent[],
  storedFingerprints: Map<number, string | null>,
): ShopMarketEvent[] {
  const prevMap = new Map(prev.map((e) => [e.matchNum, e]));
  return next.filter((e) =>
    shouldSendDelta(prevMap.get(e.matchNum), e, storedFingerprints.get(e.matchNum)),
  );
}

async function finishShopNotify(summary: ShopDiscordNotifySummary): Promise<ShopDiscordNotifySummary> {
  await persistShopDiscordNotifyLog(summary);
  return summary;
}

export async function maybeNotifyShopDiscord(input: {
  payload: ShopLatestPayload;
  previousEvents: ShopMarketEvent[];
}): Promise<ShopDiscordNotifySummary> {
  const webhook = await resolveDiscordShopWebhookUrl();
  if (!webhook) {
    return {
      attempted: false,
      ok: false,
      mode: "skipped",
      results: [],
      changedCount: 0,
      notifiedEvents: [],
    };
  }

  const allMatches = ensureAllShopMatches(input.payload.events);
  const previousAll = ensureAllShopMatches(input.previousEvents);
  const storedFingerprints = await loadShopDiscordNotifyFingerprints();
  const baselineSent = await isShopDiscordBaselineSent();

  if (!baselineSent) {
    shopLog("Discord shop baseline send started");
    const results = await sendShopBaselineToDiscord(allMatches);
    const ok = results.length > 0 && results.every((r) => r.ok);
    if (ok) {
      await markShopDiscordBaselineSent();
    }
    shopLog(`Discord shop baseline ${ok ? "OK" : "failed"}`);
    return finishShopNotify({
      attempted: true,
      ok,
      mode: "baseline",
      results,
      changedCount: allMatches.length,
      notifiedEvents: ok ? allMatches : [],
    });
  }

  await bootstrapShopDiscordNotifyFingerprints(allMatches, previousAll, storedFingerprints);

  const changed = diffDeltaEvents(previousAll, allMatches, storedFingerprints);
  if (changed.length === 0) {
    return {
      attempted: false,
      ok: true,
      mode: "skipped",
      results: [],
      changedCount: 0,
      notifiedEvents: [],
    };
  }

  shopLog(`Discord shop delta send (${changed.length} matches with price changes)`);
  const results = await sendShopDeltaToDiscord(changed);
  const attempted = results.some((r) => r.attempted);
  const ok = results.length > 0 && results.every((r) => r.ok);
  return finishShopNotify({
    attempted,
    ok,
    mode: "delta",
    results,
    changedCount: changed.length,
    notifiedEvents: ok ? changed : [],
  });
}
