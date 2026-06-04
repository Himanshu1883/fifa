import { NextResponse } from "next/server";
import {
  fetchVivaLatestMarketplace,
  normalizeVivaLatest,
  shopLog,
} from "@/lib/shop-service";
import { loadShopEventMetaLookup, syncShopMarketplaceToDatabase } from "@/lib/shop-sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const api = await fetchVivaLatestMarketplace();
    const metaByMatch = await loadShopEventMetaLookup();
    const payload = normalizeVivaLatest(api, metaByMatch);

    shopLog("UI updated (API response ready)");

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
