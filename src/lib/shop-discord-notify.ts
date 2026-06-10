import "server-only";

import type {
  ShopLatestPayload,
  ShopMarketEvent,
} from "@/lib/shop-marketplace-types";
import { shopDiscordNotifyFingerprint, shopLog } from "@/lib/shop-service";
import {
  dedupeShopEventsByMatchNum,
  sendOneShopDeltaToDiscord,
  sendShopBaselineToDiscord,
  type ShopDiscordNotifyResult,
} from "@/lib/shop-discord-webhook";
import {
  isShopDiscordBaselineSent,
  markShopDiscordBaselineSent,
  resolveDiscordShopWebhookUrl,
} from "@/lib/webhook-settings";
import { persistShopDiscordNotifyLog } from "@/lib/shop-discord-log";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import {
  bootstrapShopDiscordNotifyFingerprints,
  loadShopDiscordNotifyFingerprints,
  loadShopDiscordNotifyFingerprintForMatch,
  persistShopDiscordNotifyFingerprint,
  updateShopDiscordNotifyFingerprints,
} from "@/lib/shop-sync-service";

export type ShopDiscordNotifySummary = {
  attempted: boolean;
  ok: boolean;
  mode: "baseline" | "delta" | "skipped";
  results: ShopDiscordNotifyResult[];
  changedCount: number;
  /** Matches successfully sent — fingerprints persisted immediately per match. */
  notifiedEvents: ShopMarketEvent[];
};

/** Serialize Discord notify work per match to prevent concurrent poll races. */
const matchNotifyChains = new Map<number, Promise<void>>();

function withMatchNotifyLock<T>(matchNum: number, fn: () => Promise<T>): Promise<T> {
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

/**
 * Send once per price state: skip when stored fingerprint matches current prices.
 */
function shouldSendDelta(
  next: ShopMarketEvent,
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = shopDiscordNotifyFingerprint(next);
  if (!fingerprint) return false;
  return fingerprint !== (storedFingerprint ?? null);
}

function diffDeltaEvents(
  next: ShopMarketEvent[],
  storedFingerprints: Map<number, string | null>,
): ShopMarketEvent[] {
  return dedupeShopEventsByMatchNum(
    next.filter((e) => shouldSendDelta(e, storedFingerprints.get(e.matchNum))),
  );
}

async function finishShopNotify(summary: ShopDiscordNotifySummary): Promise<ShopDiscordNotifySummary> {
  await persistShopDiscordNotifyLog(summary);
  return summary;
}

/**
 * Per-match send with fresh DB fingerprint check + immediate persist on success.
 * Each matchNum is sent at most once per poll and once per price state globally.
 */
async function sendHardenedShopDelta(
  candidates: ShopMarketEvent[],
  scannedAt: string,
): Promise<{ results: ShopDiscordNotifyResult[]; notifiedEvents: ShopMarketEvent[] }> {
  const deduped = dedupeShopEventsByMatchNum(candidates);
  const notifyEvents = deduped.filter((e) => shopDiscordNotifyFingerprint(e));
  if (notifyEvents.length === 0) {
    return {
      results: [{ attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 }],
      notifiedEvents: [],
    };
  }

  const results: ShopDiscordNotifyResult[] = [];
  const notifiedEvents: ShopMarketEvent[] = [];
  const scannedAtDate = new Date(scannedAt);
  let batchHeaderPending = true;

  for (const event of notifyEvents) {
    const outcome = await withMatchNotifyLock(event.matchNum, async () => {
      const fingerprint = shopDiscordNotifyFingerprint(event);
      if (!fingerprint) return { result: null, notified: false };

      const stored = await loadShopDiscordNotifyFingerprintForMatch(event.matchNum);
      if (fingerprint === stored) {
        shopLog(`Discord shop delta skip M${event.matchNum} (already notified for this price)`);
        return { result: null, notified: false };
      }

      const batchHeader = batchHeaderPending
        ? `**SHOP updates** — ${notifyEvents.length} match${notifyEvents.length === 1 ? "" : "es"} changed`
        : "";

      const result = await sendOneShopDeltaToDiscord(event, { batchHeader });
      if (!result.ok) {
        return { result, notified: false };
      }

      const persisted = await persistShopDiscordNotifyFingerprint(
        event,
        Number.isFinite(scannedAtDate.getTime()) ? scannedAtDate : undefined,
      );
      if (!persisted) {
        shopLog(`Discord shop delta M${event.matchNum} sent but fingerprint persist failed`);
      }
      return { result, notified: true };
    });

    if (outcome.result) {
      results.push(outcome.result);
      if (!outcome.result.ok) break;
    }
    if (outcome.notified) {
      batchHeaderPending = false;
      notifiedEvents.push(event);
    }
  }

  if (results.length === 0) {
    return {
      results: [{ attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 }],
      notifiedEvents: [],
    };
  }

  return { results, notifiedEvents };
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
      await updateShopDiscordNotifyFingerprints(allMatches);
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

  const changed = diffDeltaEvents(allMatches, storedFingerprints);
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
  const { results, notifiedEvents } = await sendHardenedShopDelta(changed, input.payload.scannedAt);
  const attempted = results.some((r) => r.attempted);
  const ok = results.length > 0 && results.every((r) => r.ok || !r.attempted);
  return finishShopNotify({
    attempted,
    ok,
    mode: "delta",
    results,
    changedCount: notifiedEvents.length,
    notifiedEvents,
  });
}
