import "server-only";

import type {
  ShopLatestPayload,
  ShopMarketEvent,
  ShopMarketListing,
} from "@/lib/shop-marketplace-types";
import { shopLog } from "@/lib/shop-service";
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
import { ensureAllShopMatches } from "@/lib/shop-match-grid";

export type ShopDiscordNotifySummary = {
  attempted: boolean;
  ok: boolean;
  mode: "baseline" | "delta" | "skipped";
  results: ShopDiscordNotifyResult[];
  changedCount: number;
};

function listingByCategory(listings: ShopMarketListing[]): Map<string, ShopMarketListing> {
  return new Map(listings.map((l) => [l.categoryKey, l]));
}

/**
 * True when `next` has in-stock listings worth reporting: at least one available
 * category AND (newly available OR any price change on a still-available category).
 * Ignores stock-outs and all-dash matches; no minimum price delta.
 */
function isMatchNotifyWorthy(prev: ShopMarketEvent | undefined, next: ShopMarketEvent): boolean {
  const nextAvailable = next.listings.filter((l) => l.available);
  if (nextAvailable.length === 0) return false;

  const prevByCategory = listingByCategory(prev?.listings ?? []);

  for (const nextListing of nextAvailable) {
    const prevListing = prevByCategory.get(nextListing.categoryKey);
    if (!prevListing?.available) return true;
    if (prevListing.price !== nextListing.price) return true;
  }

  return false;
}

function diffChangedEvents(prev: ShopMarketEvent[], next: ShopMarketEvent[]): ShopMarketEvent[] {
  const prevMap = new Map(prev.map((e) => [e.matchNum, e]));
  return next.filter((e) => isMatchNotifyWorthy(prevMap.get(e.matchNum), e));
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
    return { attempted: false, ok: false, mode: "skipped", results: [], changedCount: 0 };
  }

  const allMatches = ensureAllShopMatches(input.payload.events);
  const previousAll = ensureAllShopMatches(input.previousEvents);
  const baselineSent = await isShopDiscordBaselineSent();

  if (!baselineSent) {
    shopLog("Discord shop baseline send started");
    const results = await sendShopBaselineToDiscord(allMatches);
    const ok = results.length > 0 && results.every((r) => r.ok);
    if (ok) await markShopDiscordBaselineSent();
    shopLog(`Discord shop baseline ${ok ? "OK" : "failed"}`);
    return finishShopNotify({
      attempted: true,
      ok,
      mode: "baseline",
      results,
      changedCount: allMatches.length,
    });
  }

  const changed = diffChangedEvents(previousAll, allMatches);
  if (changed.length === 0) {
    return { attempted: false, ok: true, mode: "skipped", results: [], changedCount: 0 };
  }

  shopLog(`Discord shop delta send (${changed.length} matches with stock)`);
  const results = await sendShopDeltaToDiscord(changed);
  const attempted = results.some((r) => r.attempted);
  const ok = results.length > 0 && results.every((r) => r.ok);
  return finishShopNotify({
    attempted,
    ok,
    mode: "delta",
    results,
    changedCount: changed.length,
  });
}
