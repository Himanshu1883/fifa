import { buildMatchBuyUrl } from "@/lib/shop-buy-urls";
import type { ShopEventCatalogueMeta, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { defaultCatalogueMeta, type ShopEventMetaLookup } from "@/lib/shop-service";

export const SHOP_MATCH_COUNT = 104;

export function emptyShopMarketEvent(
  matchNum: number,
  catalogue?: ShopEventCatalogueMeta,
): ShopMarketEvent {
  const meta = catalogue ?? defaultCatalogueMeta(matchNum);
  return {
    matchNum,
    externalEventId: String(matchNum),
    catalogue: meta,
    listings: [],
    availableCount: 0,
    listingsCount: 0,
    lowestPrice: null,
    highestPrice: null,
    averagePrice: null,
    currency: "EUR",
    buyUrl: buildMatchBuyUrl(matchNum),
    rawPayload: {},
  };
}

/** Ensure matches 1–104 are always present (placeholders for missing API rows). */
export function ensureAllShopMatches(
  events: ShopMarketEvent[],
  metaByMatch?: ShopEventMetaLookup,
): ShopMarketEvent[] {
  const map = new Map(events.map((e) => [e.matchNum, e]));
  const out: ShopMarketEvent[] = [];
  for (let m = 1; m <= SHOP_MATCH_COUNT; m++) {
    out.push(map.get(m) ?? emptyShopMarketEvent(m, metaByMatch?.get(m)));
  }
  return out;
}
