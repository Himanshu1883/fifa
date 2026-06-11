import { after, NextResponse } from "next/server";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import { maybeNotifyShopDiscord } from "@/lib/shop-discord-notify";
import {
  fetchVivaLatestMarketplace,
  normalizeVivaLatest,
  shopLog,
} from "@/lib/shop-service";
import type { ShopLatestPayload } from "@/lib/shop-marketplace-types";
import { maybeNotifyPriceListDiscord } from "@/lib/price-list-discord-notify";
import { persistPriceListDiscordBackgroundError } from "@/lib/price-list-discord-log";
import { persistShopDiscordBackgroundError } from "@/lib/shop-discord-log";
import {
  loadShopEventsFromDatabase,
  loadShopLatestPayloadFromDatabase,
  safeLoadShopEventMetaLookup,
  syncShopMarketplaceToDatabase,
} from "@/lib/shop-sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Discord notify + DB sync can run longer than the default 10s on Hobby. */
export const maxDuration = 60;

function jsonPayload(payload: ShopLatestPayload, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function runShopBackgroundWork(payload: ShopLatestPayload): Promise<void> {
  try {
    const metaByMatch = await safeLoadShopEventMetaLookup();
    const enriched: ShopLatestPayload = {
      ...payload,
      events: ensureAllShopMatches(payload.events, metaByMatch),
    };
    const previousEvents = await loadShopEventsFromDatabase(metaByMatch);
    const summary = await maybeNotifyShopDiscord({ payload: enriched, previousEvents });
    if (summary.mode === "skipped" && summary.skipReason) {
      shopLog(`Discord shop skipped: ${summary.skipReason}`);
    } else if (summary.mode !== "skipped") {
      shopLog(
        `Discord shop ${summary.mode} ${summary.ok ? "OK" : "failed"} (${summary.changedCount} matches)`,
      );
    }
    await syncShopMarketplaceToDatabase(enriched);

    const priceListSummary = await maybeNotifyPriceListDiscord({ shopEvents: enriched.events });
    if (priceListSummary.mode === "skipped" && priceListSummary.skipReason) {
      shopLog(`Discord price list skipped: ${priceListSummary.skipReason}`);
    } else if (priceListSummary.mode !== "skipped") {
      shopLog(
        `Discord price list ${priceListSummary.mode} ${priceListSummary.ok ? "OK" : "failed"} (resale ${priceListSummary.resaleCount}, shop ${priceListSummary.shopCount})`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    shopLog(`Discord shop notify/sync error: ${msg}`);
    await persistShopDiscordBackgroundError(`background_work: ${msg}`);
    await persistPriceListDiscordBackgroundError(`background_work: ${msg}`);
  }
}

/** Defer notify+sync via `after()` so poll responses stay fast; logs prove this runs on Vercel Hobby. */
function scheduleShopBackgroundWork(payload: ShopLatestPayload): void {
  after(async () => {
    shopLog("Background notify+sync started");
    await runShopBackgroundWork(payload);
    shopLog("Background notify+sync finished");
  });
}

export async function GET(request: Request) {
  const isCron = request.headers.get("x-vercel-cron") === "1";
  if (isCron) {
    shopLog("Cron poll started");
  }

  try {
    const api = await fetchVivaLatestMarketplace();
    const normalized = normalizeVivaLatest(api, new Map());
    const payload: ShopLatestPayload = {
      ...normalized,
      events: ensureAllShopMatches(normalized.events, new Map()),
    };

    shopLog("UI updated (API response ready)");
    scheduleShopBackgroundWork(payload);
    return jsonPayload(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    shopLog(`Viva fetch failed: ${message}`);

    const metaByMatch = await safeLoadShopEventMetaLookup(8_000);
    const cached = await loadShopLatestPayloadFromDatabase(metaByMatch);
    if (cached) {
      shopLog("Serving cached DB payload (Viva API unavailable)");
      scheduleShopBackgroundWork(cached);
      return jsonPayload(cached, { "X-Shop-Data-Source": "cache" });
    }

    shopLog(`API route error: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
