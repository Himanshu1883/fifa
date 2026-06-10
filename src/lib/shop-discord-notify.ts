import "server-only";

import type {
  ShopLatestPayload,
  ShopMarketEvent,
  ShopMarketListing,
} from "@/lib/shop-marketplace-types";
import { shopDiscordNotifyFingerprint, shopLog } from "@/lib/shop-service";
import {
  computeChangedListings,
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
  claimShopDiscordNotifyFingerprint,
  loadShopDiscordNotifyFingerprints,
  persistShopDiscordNotifyFingerprint,
  revertShopDiscordNotifyFingerprint,
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

export type ShopDeltaCandidate = {
  event: ShopMarketEvent;
  changedListings: ShopMarketListing[];
};

function diffDeltaCandidates(
  next: ShopMarketEvent[],
  prevByMatch: Map<number, ShopMarketEvent>,
  storedFingerprints: Map<number, string | null>,
): ShopDeltaCandidate[] {
  const out: ShopDeltaCandidate[] = [];
  for (const event of dedupeShopEventsByMatchNum(next)) {
    if (!shouldSendDelta(event, storedFingerprints.get(event.matchNum))) continue;
    const changedListings = computeChangedListings(prevByMatch.get(event.matchNum), event);
    if (changedListings.length === 0) continue;
    out.push({ event, changedListings });
  }
  return out;
}

/** Fingerprint changed but no priced listing deltas (e.g. category removed) — persist without Discord send. */
async function persistRemovalOnlyFingerprints(
  next: ShopMarketEvent[],
  prevByMatch: Map<number, ShopMarketEvent>,
  storedFingerprints: Map<number, string | null>,
  scannedAt: string,
): Promise<void> {
  const scannedAtDate = new Date(scannedAt);
  const at = Number.isFinite(scannedAtDate.getTime()) ? scannedAtDate : undefined;
  for (const event of dedupeShopEventsByMatchNum(next)) {
    if (!shouldSendDelta(event, storedFingerprints.get(event.matchNum))) continue;
    if (computeChangedListings(prevByMatch.get(event.matchNum), event).length > 0) continue;
    await persistShopDiscordNotifyFingerprint(event, at);
  }
}

async function finishShopNotify(summary: ShopDiscordNotifySummary): Promise<ShopDiscordNotifySummary> {
  await persistShopDiscordNotifyLog(summary);
  return summary;
}

/**
 * Per-match send with DB claim (advisory lock + fingerprint persist before Discord POST).
 * If stored fingerprint === current, NEVER call Discord API.
 */
async function sendHardenedShopDelta(
  candidates: ShopDeltaCandidate[],
  scannedAt: string,
): Promise<{ results: ShopDiscordNotifyResult[]; notifiedEvents: ShopMarketEvent[] }> {
  const notifyCandidates = candidates.filter(
    (c) => c.changedListings.length > 0 && shopDiscordNotifyFingerprint(c.event),
  );
  if (notifyCandidates.length === 0) {
    shopLog("Discord shop delta skip (no candidates with priced listing changes)");
    return {
      results: [{ attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 }],
      notifiedEvents: [],
    };
  }

  const results: ShopDiscordNotifyResult[] = [];
  const notifiedEvents: ShopMarketEvent[] = [];
  const scannedAtDate = new Date(scannedAt);
  const scannedAtOpt = Number.isFinite(scannedAtDate.getTime()) ? scannedAtDate : undefined;
  let batchHeaderPending = true;

  for (const { event, changedListings } of notifyCandidates) {
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

      if (changedListings.length === 0) {
        await revertShopDiscordNotifyFingerprint(event.matchNum, claim.previousFingerprint);
        shopLog(`Discord shop delta skip M${event.matchNum} (no listing deltas after claim)`);
        return { result: null, notified: false };
      }

      const batchHeader = batchHeaderPending
        ? `**SHOP updates** — ${notifyCandidates.length} match${notifyCandidates.length === 1 ? "" : "es"} changed`
        : "";

      shopLog(
        `Discord shop delta send M${event.matchNum} (${changedListings.map((l) => l.categoryKey).join(", ")})`,
      );
      const result = await sendOneShopDeltaToDiscord(event, { batchHeader, changedListings });
      if (!result.ok) {
        await revertShopDiscordNotifyFingerprint(event.matchNum, claim.previousFingerprint);
        shopLog(`Discord shop delta M${event.matchNum} send failed — fingerprint reverted`);
        return { result, notified: false };
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

  const prevByMatch = new Map(previousAll.map((e) => [e.matchNum, e]));
  await persistRemovalOnlyFingerprints(
    allMatches,
    prevByMatch,
    storedFingerprints,
    input.payload.scannedAt,
  );

  const changed = diffDeltaCandidates(allMatches, prevByMatch, storedFingerprints);
  if (changed.length === 0) {
    shopLog("Discord shop delta skip (no matches with fingerprint or listing changes)");
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
