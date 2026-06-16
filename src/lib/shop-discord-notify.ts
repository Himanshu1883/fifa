import "server-only";

import type {
  ShopLatestPayload,
  ShopMarketEvent,
  ShopMarketListing,
} from "@/lib/shop-marketplace-types";
import { shopDiscordNotifyFingerprint, shopLog, shouldSendShopDiscordDelta } from "@/lib/shop-service";
import {
  computeChangedListingsFromStoredFingerprint,
  dedupeShopEventsByMatchNum,
  sendOneShopDeltaToDiscord,
  sendShopBaselineToDiscord,
  sendShopListingRefreshToDiscord,
  type ShopDiscordNotifyResult,
} from "@/lib/shop-discord-webhook";
import {
  hasAnyDedicatedShopWebhookConfigured,
  isMatchShopDiscordBaselineSent,
  isShopDiscordBaselineSent,
  markMatchShopDiscordBaselineSent,
  markShopDiscordBaselineSent,
  markShopDiscordLastHeartbeatAt,
  resolveDiscordShopWebhookUrl,
  shouldSendShopDiscordHeartbeat,
  type ShopDiscordWebhookHeartbeatTarget,
} from "@/lib/webhook-settings";
import {
  listMatchNumsWithPerMatchShopWebhook,
  resolveMatchShopWebhookUrlDedicatedOnly,
} from "@/lib/match-discord-webhooks";
import { persistShopDiscordNotifyLog } from "@/lib/shop-discord-log";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import {
  bootstrapShopDiscordNotifyFingerprints,
  claimShopDiscordNotifyFingerprint,
  loadShopDiscordNotifyFingerprints,
  persistShopDiscordNotifyFingerprint,
  revertShopDiscordNotifyFingerprint,
  updateShopDiscordNotifyFingerprints,
} from "@/lib/shop-sync-service";

export type ShopDiscordNotifySummary = {
  attempted: boolean;
  ok: boolean;
  mode: "baseline" | "delta" | "heartbeat" | "skipped";
  results: ShopDiscordNotifyResult[];
  changedCount: number;
  /** Matches successfully sent — fingerprints persisted immediately per match. */
  notifiedEvents: ShopMarketEvent[];
  /** Set when mode=skipped so poll logs explain why nothing was sent. */
  skipReason?: string;
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

export type ShopDeltaCandidate = {
  event: ShopMarketEvent;
};

/** Gate on stored notify fingerprint only — scrape diffs do not trigger sends. */
function diffDeltaCandidates(
  next: ShopMarketEvent[],
  storedFingerprints: Map<number, string | null>,
): ShopDeltaCandidate[] {
  const out: ShopDeltaCandidate[] = [];
  for (const event of dedupeShopEventsByMatchNum(next)) {
    if (!shouldSendShopDiscordDelta(event, storedFingerprints.get(event.matchNum))) continue;
    out.push({ event });
  }
  return out;
}

async function finishShopNotify(summary: ShopDiscordNotifySummary): Promise<ShopDiscordNotifySummary> {
  await persistShopDiscordNotifyLog(summary);
  return summary;
}

async function shopDiscordHeartbeatTargetForMatch(matchNum: number): Promise<ShopDiscordWebhookHeartbeatTarget> {
  const dedicated = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
  return dedicated ? matchNum : "general";
}

async function markShopDiscordNotifySentForMatch(matchNum: number): Promise<void> {
  await markShopDiscordLastHeartbeatAt(await shopDiscordHeartbeatTargetForMatch(matchNum));
}

async function perMatchShopWebhookNums(): Promise<Set<number>> {
  return new Set(await listMatchNumsWithPerMatchShopWebhook());
}

async function maybeSendShopDiscordHeartbeats(
  allMatches: ShopMarketEvent[],
): Promise<ShopDiscordNotifySummary | null> {
  const results: ShopDiscordNotifyResult[] = [];
  const generalWebhook = await resolveDiscordShopWebhookUrl();
  const perMatchNums = await perMatchShopWebhookNums();
  const generalEvents = allMatches.filter((e) => !perMatchNums.has(e.matchNum));

  if (
    generalWebhook &&
    generalEvents.length > 0 &&
    (await shouldSendShopDiscordHeartbeat("general"))
  ) {
    shopLog("Discord shop listing refresh send (general)");
    const refreshResults = await sendShopListingRefreshToDiscord({
      events: generalEvents,
      webhookUrl: generalWebhook,
    });
    results.push(...refreshResults);
    if (refreshResults.some((r) => r.ok && r.attempted)) {
      await markShopDiscordLastHeartbeatAt("general");
    }
  }

  for (const matchNum of perMatchNums) {
    const webhook = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
    if (!webhook) continue;
    const event = allMatches.find((e) => e.matchNum === matchNum);
    if (!event) continue;
    if (!(await shouldSendShopDiscordHeartbeat(matchNum))) continue;

    shopLog(`Discord shop listing refresh send M${matchNum}`);
    const refreshResults = await sendShopListingRefreshToDiscord({
      events: [event],
      webhookUrl: webhook,
      dedicatedMatchNum: matchNum,
    });
    results.push(...refreshResults);
    if (refreshResults.some((r) => r.ok && r.attempted)) {
      await markShopDiscordLastHeartbeatAt(matchNum);
    }
  }

  if (results.length === 0) return null;

  const attempted = results.some((r) => r.attempted);
  const ok = results.length > 0 && results.every((r) => r.ok || !r.attempted);
  return {
    attempted,
    ok,
    mode: "heartbeat",
    results,
    changedCount: 0,
    notifiedEvents: [],
  };
}

/**
 * Per-match send with DB claim (advisory lock + fingerprint persist before Discord POST).
 * If stored fingerprint covers current prices, NEVER call Discord API.
 */
async function sendHardenedShopDelta(
  candidates: ShopDeltaCandidate[],
  scannedAt: string,
): Promise<{ results: ShopDiscordNotifyResult[]; notifiedEvents: ShopMarketEvent[] }> {
  const notifyCandidates = candidates.filter((c) => shopDiscordNotifyFingerprint(c.event));
  if (notifyCandidates.length === 0) {
    shopLog("Discord shop delta skip (no candidates with priced listings)");
    return {
      results: [{ attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 }],
      notifiedEvents: [],
    };
  }

  const results: ShopDiscordNotifyResult[] = [];
  const notifiedEvents: ShopMarketEvent[] = [];
  const scannedAtDate = new Date(scannedAt);
  const scannedAtOpt = Number.isFinite(scannedAtDate.getTime()) ? scannedAtDate : undefined;

  for (const { event } of notifyCandidates) {
    const outcome = await withMatchNotifyLock(event.matchNum, async () => {
      const claim = await claimShopDiscordNotifyFingerprint(event, scannedAtOpt);
      if (claim.action === "skip") {
        if (claim.reason === "same_fingerprint") {
          shopLog(`Discord shop delta skip M${event.matchNum} (already notified for this price)`);
        }
        return { result: null, notified: false };
      }
      if (claim.action === "error") {
        shopLog(`Discord shop delta skip M${event.matchNum} (fingerprint claim failed)`);
        return { result: null, notified: false };
      }

      const sentFingerprint = shopDiscordNotifyFingerprint(event);
      if (sentFingerprint !== claim.fingerprint) {
        await revertShopDiscordNotifyFingerprint(
          event.matchNum,
          claim.previousFingerprint,
          claim.notifyLogId,
        );
        shopLog(
          `Discord shop delta skip M${event.matchNum} (fingerprint drift after claim: ${claim.fingerprint} vs ${sentFingerprint})`,
        );
        return { result: null, notified: false };
      }

      const changedListings: ShopMarketListing[] = computeChangedListingsFromStoredFingerprint(
        claim.previousFingerprint,
        event,
      );
      if (changedListings.length === 0) {
        await revertShopDiscordNotifyFingerprint(
          event.matchNum,
          claim.previousFingerprint,
          claim.notifyLogId,
        );
        shopLog(`Discord shop delta skip M${event.matchNum} (no listing deltas vs stored fingerprint)`);
        return { result: null, notified: false };
      }

      shopLog(
        `Discord shop delta send M${event.matchNum} (${changedListings.map((l) => l.categoryKey).join(", ")})`,
      );
      const result = await sendOneShopDeltaToDiscord(event, { changedListings });
      if (!result.ok) {
        await revertShopDiscordNotifyFingerprint(
          event.matchNum,
          claim.previousFingerprint,
          claim.notifyLogId,
        );
        shopLog(`Discord shop delta M${event.matchNum} send failed — fingerprint reverted`);
        return { result, notified: false };
      }

      if (result.ok && result.attempted) {
        await markShopDiscordNotifySentForMatch(event.matchNum);
      }
      return { result, notified: true };
    });

    if (outcome.result) {
      results.push(outcome.result);
      if (!outcome.result.ok) break;
    }
    if (outcome.notified) {
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

/** Send shop baseline to per-match webhooks configured after the global baseline ran. */
async function sendPendingPerMatchShopBaselines(
  allMatches: ShopMarketEvent[],
): Promise<{ results: ShopDiscordNotifyResult[]; notifiedEvents: ShopMarketEvent[] }> {
  const results: ShopDiscordNotifyResult[] = [];
  const notifiedEvents: ShopMarketEvent[] = [];
  const perMatchNums = await perMatchShopWebhookNums();

  for (const matchNum of perMatchNums) {
    if (await isMatchShopDiscordBaselineSent(matchNum)) continue;
    const webhook = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
    if (!webhook) continue;

    const event = allMatches.find((e) => e.matchNum === matchNum);
    if (!event) continue;

    shopLog(`Discord shop per-match baseline send M${matchNum}`);
    const batchResults = await sendShopBaselineToDiscord([event]);
    results.push(...batchResults);
    const attempted = batchResults.some((r) => r.attempted);
    const ok = batchResults.length > 0 && batchResults.every((r) => r.ok || !r.attempted);
    if (attempted && ok) {
      await markMatchShopDiscordBaselineSent(matchNum);
      await persistShopDiscordNotifyFingerprint(event);
      await markShopDiscordNotifySentForMatch(matchNum);
      notifiedEvents.push(event);
    }
    if (batchResults.some((r) => r.attempted && !r.ok)) break;
  }

  return { results, notifiedEvents };
}

export async function maybeNotifyShopDiscord(input: {
  payload: ShopLatestPayload;
  previousEvents: ShopMarketEvent[];
}): Promise<ShopDiscordNotifySummary> {
  const generalWebhook = await resolveDiscordShopWebhookUrl();
  const dedicatedConfigured = await hasAnyDedicatedShopWebhookConfigured();
  if (!generalWebhook && !dedicatedConfigured) {
    shopLog("Discord shop skip (no shop webhook configured)");
    return finishShopNotify({
      attempted: false,
      ok: false,
      mode: "skipped",
      results: [],
      changedCount: 0,
      notifiedEvents: [],
      skipReason: "no_webhook_url",
    });
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
      if (generalWebhook) {
        await markShopDiscordLastHeartbeatAt("general");
      }
      for (const matchNum of await listMatchNumsWithPerMatchShopWebhook()) {
        const webhook = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
        if (webhook) {
          await markMatchShopDiscordBaselineSent(matchNum);
          await markShopDiscordLastHeartbeatAt(matchNum);
        }
      }
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

  const pendingDedicated = await sendPendingPerMatchShopBaselines(allMatches);
  if (pendingDedicated.results.some((r) => r.attempted)) {
    const ok = pendingDedicated.results.every((r) => r.ok || !r.attempted);
    shopLog(`Discord shop dedicated baseline ${ok ? "OK" : "failed"}`);
    return finishShopNotify({
      attempted: true,
      ok,
      mode: "baseline",
      results: pendingDedicated.results,
      changedCount: pendingDedicated.notifiedEvents.length,
      notifiedEvents: ok ? pendingDedicated.notifiedEvents : [],
    });
  }

  await bootstrapShopDiscordNotifyFingerprints(allMatches, previousAll, storedFingerprints);

  const changed = diffDeltaCandidates(allMatches, storedFingerprints);
  if (changed.length === 0) {
    shopLog("Discord shop delta skip (no matches with fingerprint changes vs stored)");
    const heartbeatSummary = await maybeSendShopDiscordHeartbeats(allMatches);
    if (heartbeatSummary) {
      shopLog(`Discord shop heartbeat ${heartbeatSummary.ok ? "OK" : "failed"}`);
      return finishShopNotify(heartbeatSummary);
    }
    return finishShopNotify({
      attempted: false,
      ok: true,
      mode: "skipped",
      results: [],
      changedCount: 0,
      notifiedEvents: [],
      skipReason: "no_fingerprint_changes",
    });
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
    skipReason:
      !attempted && notifiedEvents.length === 0 ? "all_delta_claims_skipped" : undefined,
  });
}
