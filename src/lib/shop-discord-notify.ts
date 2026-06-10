import "server-only";

import type { ShopLatestPayload, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { shopEventFingerprint, shopLog } from "@/lib/shop-service";
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

function diffChangedEvents(prev: ShopMarketEvent[], next: ShopMarketEvent[]): ShopMarketEvent[] {
  const prevMap = new Map(prev.map((e) => [e.matchNum, shopEventFingerprint(e)]));
  return next.filter((e) => prevMap.get(e.matchNum) !== shopEventFingerprint(e));
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

  shopLog(`Discord shop delta send (${changed.length} matches)`);
  const result = await sendShopDeltaToDiscord(changed);
  return finishShopNotify({
    attempted: result.attempted,
    ok: result.ok,
    mode: "delta",
    results: [result],
    changedCount: changed.length,
  });
}
