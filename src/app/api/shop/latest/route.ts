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

    void maybeNotifyShopDiscord({ payload, previousEvents })
      .then((summary) => {
        if (summary.mode !== "skipped") {
          shopLog(
            `Discord shop ${summary.mode} ${summary.ok ? "OK" : "failed"} (${summary.changedCount} matches)`,
          );
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        shopLog(`Discord shop notify error: ${msg}`);
      });

    void syncShopMarketplaceToDatabase(payload).catch(() => {
      /* logged inside sync */
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    shopLog(`API route error: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
