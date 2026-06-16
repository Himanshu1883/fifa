import "server-only";

import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import {
  listMatchNumsWithPerMatchShopWebhook,
  resolveMatchResaleWebhookUrlDedicatedOnly,
  resolveMatchShopWebhookUrlDedicatedOnly,
} from "@/lib/match-discord-webhooks";
import { SHOP_MATCH_COUNT } from "@/lib/shop-match-grid";
import { prisma } from "@/lib/prisma";
import {
  maybeNotifyResaleDiscordForEvent,
  resetDedicatedResaleDiscordNotifyState,
} from "@/lib/resale-discord-notify";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import { persistShopDiscordNotifyLog } from "@/lib/shop-discord-log";
import type { ShopDiscordNotifySummary } from "@/lib/shop-discord-notify";
import { sendShopBaselineToDiscord, type ShopDiscordNotifyResult } from "@/lib/shop-discord-webhook";
import type { ShopMarketEvent } from "@/lib/shop-marketplace-types";
import {
  fetchVivaLatestMarketplace,
  normalizeVivaLatest,
  shopLog,
} from "@/lib/shop-service";
import {
  loadShopEventsFromDatabase,
  loadShopLatestPayloadFromDatabase,
  persistShopDiscordNotifyFingerprint,
  safeLoadShopEventMetaLookup,
  updateShopDiscordNotifyFingerprints,
} from "@/lib/shop-sync-service";
import {
  markMatchShopDiscordBaselineSent,
  markShopDiscordBaselineSent,
  resolveDiscordShopWebhookUrl,
} from "@/lib/webhook-settings";

export type WebhookBaselineChannelResult = {
  attempted: boolean;
  ok: boolean;
  error?: string;
  mode?: string;
};

export type WebhookBaselineSendResult = {
  ok: boolean;
  shop: WebhookBaselineChannelResult;
  resale: WebhookBaselineChannelResult;
};

async function loadShopLatestEvents(): Promise<ShopMarketEvent[]> {
  const metaByMatch = await safeLoadShopEventMetaLookup();
  try {
    const api = await fetchVivaLatestMarketplace();
    const normalized = normalizeVivaLatest(api, metaByMatch);
    return ensureAllShopMatches(normalized.events, metaByMatch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    shopLog(`Baseline load: live shop fetch failed (${msg}), using DB cache`);
    const cached = await loadShopLatestPayloadFromDatabase(metaByMatch);
    if (cached) {
      return ensureAllShopMatches(cached.events, metaByMatch);
    }
    return await loadShopEventsFromDatabase(metaByMatch);
  }
}

async function findDbEventForMatchNum(matchNum: number) {
  const rows = await prisma.event.findMany({
    select: {
      id: true,
      matchLabel: true,
      name: true,
      prefId: true,
      resalePrefId: true,
    },
  });
  for (const row of rows) {
    if (parseEventMatchNumber(row.matchLabel, row.name) === matchNum) return row;
  }
  return null;
}

function shopChannelFromResults(results: ShopDiscordNotifyResult[]): WebhookBaselineChannelResult {
  if (results.length === 0) {
    return { attempted: false, ok: false, error: "No shop data to send" };
  }
  const attempted = results.some((r) => r.attempted);
  const ok = results.every((r) => r.ok || !r.attempted);
  const error = results.find((r) => r.error)?.error;
  return { attempted, ok, error, mode: "baseline" };
}

async function persistManualShopBaselineLog(
  summary: Pick<ShopDiscordNotifySummary, "ok" | "results" | "changedCount">,
): Promise<void> {
  await persistShopDiscordNotifyLog({
    attempted: true,
    ok: summary.ok,
    mode: "baseline",
    results: summary.results,
    changedCount: summary.changedCount,
    notifiedEvents: [],
  });
}

export async function sendGeneralShopBaselineNow(): Promise<WebhookBaselineSendResult> {
  const webhook = await resolveDiscordShopWebhookUrl();
  if (!webhook) {
    return {
      ok: false,
      shop: { attempted: false, ok: false, error: "General shop webhook not configured" },
      resale: { attempted: false, ok: true },
    };
  }

  const allMatches = await loadShopLatestEvents();
  shopLog("Manual general shop baseline send started");
  const results = await sendShopBaselineToDiscord(allMatches);
  const shop = shopChannelFromResults(results);
  if (shop.attempted && shop.ok) {
    await markShopDiscordBaselineSent();
    await updateShopDiscordNotifyFingerprints(allMatches);
    for (const matchNum of await listMatchNumsWithPerMatchShopWebhook()) {
      const dedicatedWebhook = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
      if (dedicatedWebhook) {
        await markMatchShopDiscordBaselineSent(matchNum);
      }
    }
  }
  await persistManualShopBaselineLog({
    ok: shop.ok,
    results,
    changedCount: allMatches.length,
  });
  shopLog(`Manual general shop baseline ${shop.ok ? "OK" : "failed"}`);

  return { ok: shop.ok, shop, resale: { attempted: false, ok: true } };
}

export async function sendMatchBaselineNow(matchNum: number): Promise<WebhookBaselineSendResult> {
  const resaleWebhook = await resolveMatchResaleWebhookUrlDedicatedOnly(matchNum);
  const shopWebhook = await resolveMatchShopWebhookUrlDedicatedOnly(matchNum);
  if (!resaleWebhook && !shopWebhook) {
    return {
      ok: false,
      shop: { attempted: false, ok: false, error: `Match ${matchNum} webhooks not configured` },
      resale: { attempted: false, ok: false, error: `Match ${matchNum} webhooks not configured` },
    };
  }

  const allMatches = await loadShopLatestEvents();
  const event = allMatches.find((e) => e.matchNum === matchNum);

  let shop: WebhookBaselineChannelResult = { attempted: false, ok: true };
  if (shopWebhook) {
    if (!event) {
      shop = { attempted: false, ok: false, error: `Match ${matchNum} shop data not found` };
    } else {
      shopLog(`Manual per-match baseline send M${matchNum} (shop) started`);
      const shopResults = await sendShopBaselineToDiscord([event]);
      shop = shopChannelFromResults(shopResults);
      if (shop.attempted && shop.ok) {
        await markMatchShopDiscordBaselineSent(matchNum);
        await persistShopDiscordNotifyFingerprint(event);
      }
      await persistManualShopBaselineLog({
        ok: shop.ok,
        results: shopResults,
        changedCount: 1,
      });
    }
  }

  let resale: WebhookBaselineChannelResult = { attempted: false, ok: true };
  if (resaleWebhook) {
    const dbEvent = await findDbEventForMatchNum(matchNum);
    if (!dbEvent) {
      resale = { attempted: false, ok: false, error: `No event row linked to Match ${matchNum}` };
    } else {
      await resetDedicatedResaleDiscordNotifyState(matchNum);
      const prefId = dbEvent.resalePrefId?.trim() || dbEvent.prefId?.trim() || "";
      if (!prefId) {
        resale = { attempted: false, ok: false, error: "Event has no prefId for resale" };
      } else {
        const resaleResult = await maybeNotifyResaleDiscordForEvent({
          eventId: dbEvent.id,
          eventLabel: dbEvent.matchLabel || dbEvent.name,
          eventName: dbEvent.name,
          prefId,
        });
        resale = {
          attempted: resaleResult.attempted,
          ok: resaleResult.ok || !resaleResult.attempted,
          error: resaleResult.error,
          mode: resaleResult.mode,
        };
      }
    }
  }

  const ok = (shop.attempted ? shop.ok : true) && (resale.attempted ? resale.ok : true);
  shopLog(`Manual per-match baseline M${matchNum} shop=${shop.ok ? "OK" : "skip"} resale=${resale.mode ?? "skip"}`);
  return { ok, shop, resale };
}

/** @deprecated Use sendMatchBaselineNow */
export async function sendDedicatedMatchBaselineNow(matchNum: number): Promise<WebhookBaselineSendResult> {
  return sendMatchBaselineNow(matchNum);
}

export function parseBaselineMatchNum(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > SHOP_MATCH_COUNT) return null;
  return n;
}
