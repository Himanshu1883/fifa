import { NextResponse } from "next/server";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import { maybeNotifyShopDiscord } from "@/lib/shop-discord-notify";
import {
  fetchVivaLatestMarketplace,
  normalizeVivaLatest,
  shopLog,
} from "@/lib/shop-service";
import {
  loadShopEventMetaLookup,
  loadShopEventsFromDatabase,
  syncShopMarketplaceToDatabase,
  updateShopDiscordNotifyFingerprints,
} from "@/lib/shop-sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const api = await fetchVivaLatestMarketplace();
    const metaByMatch = await loadShopEventMetaLookup();
    const previousEvents = await loadShopEventsFromDatabase(metaByMatch);
    const normalized = normalizeVivaLatest(api, metaByMatch);
    const payload = {
      ...normalized,
      events: ensureAllShopMatches(normalized.events, metaByMatch),
    };

    shopLog("UI updated (API response ready)");

    void (async () => {
      try {
        const summary = await maybeNotifyShopDiscord({ payload, previousEvents });
        if (summary.mode !== "skipped") {
          shopLog(
            `Discord shop ${summary.mode} ${summary.ok ? "OK" : "failed"} (${summary.changedCount} matches)`,
          );
        }
        await syncShopMarketplaceToDatabase(payload);
        if (summary.notifiedEvents.length > 0) {
          await updateShopDiscordNotifyFingerprints(summary.notifiedEvents);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        shopLog(`Discord shop notify/sync error: ${msg}`);
      }
    })();

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    shopLog(`API route error: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
