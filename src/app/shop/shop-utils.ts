import type { ShopMarketEvent, ShopMarketListing } from "@/lib/shop-marketplace-types";

export function formatRelativeSeconds(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
}

export function formatShopPrice(amount: number | null, currency: string): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.length === 3 ? currency : "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const SHOP_MAIN_CATEGORIES = ["1", "2", "3", "4"] as const;
export type ShopMainCategoryKey = (typeof SHOP_MAIN_CATEGORIES)[number];
export type ShopCategoryFilter = "all" | ShopMainCategoryKey;

export const SHOP_CATEGORY_SHORT: Record<ShopMainCategoryKey, string> = {
  "1": "Cat 1",
  "2": "Cat 2",
  "3": "Cat 3",
  "4": "Cat 4",
};

/** Primary columns shown in the match table (Cat 1–3). */
export const SHOP_TABLE_CATEGORIES = ["1", "2", "3"] as const satisfies readonly ShopMainCategoryKey[];

export type ShopTableCategoryKey = (typeof SHOP_TABLE_CATEGORIES)[number];

export type ShopBestOffer =
  | { kind: "priced"; categoryKey: ShopMainCategoryKey; catLabel: string; price: number }
  | { kind: "unpriced"; categoryKey: ShopMainCategoryKey; catLabel: string }
  | { kind: "none" };

export function computeBestOffer(
  event: ShopMarketEvent,
  categories: readonly ShopMainCategoryKey[] = SHOP_MAIN_CATEGORIES,
): ShopBestOffer {
  let best: { categoryKey: ShopMainCategoryKey; price: number } | null = null;
  let unpriced: ShopMainCategoryKey | null = null;

  for (const cat of categories) {
    const listing = getEventCategoryListing(event, cat);
    if (!listing?.available) continue;
    if (listing.price !== null) {
      if (!best || listing.price < best.price) {
        best = { categoryKey: cat, price: listing.price };
      }
    } else if (!unpriced) {
      unpriced = cat;
    }
  }

  if (best) {
    return {
      kind: "priced",
      categoryKey: best.categoryKey,
      catLabel: SHOP_CATEGORY_SHORT[best.categoryKey],
      price: best.price,
    };
  }
  if (unpriced) {
    return { kind: "unpriced", categoryKey: unpriced, catLabel: SHOP_CATEGORY_SHORT[unpriced] };
  }
  return { kind: "none" };
}

export function getEventCategoryListing(
  event: ShopMarketEvent,
  categoryKey: string,
): ShopMarketListing | undefined {
  return event.listings.find((l) => l.categoryKey === categoryKey);
}

export function eventHasAvailableCategory(
  event: ShopMarketEvent,
  categoryKey: ShopMainCategoryKey,
): boolean {
  return Boolean(getEventCategoryListing(event, categoryKey)?.available);
}

export function countEventsWithAvailableCategory(
  events: ShopMarketEvent[],
  categoryKey: ShopMainCategoryKey,
): number {
  return events.filter((e) => eventHasAvailableCategory(e, categoryKey)).length;
}

export function filterShopEventsByCategory(
  events: ShopMarketEvent[],
  filter: ShopCategoryFilter,
): ShopMarketEvent[] {
  if (filter === "all") return events;
  return events.filter((e) => eventHasAvailableCategory(e, filter));
}

export function sortShopEventsByCategoryPrice(
  events: ShopMarketEvent[],
  categoryKey: ShopMainCategoryKey,
): ShopMarketEvent[] {
  return [...events].sort((a, b) => {
    const pa = getEventCategoryListing(a, categoryKey)?.price ?? Number.POSITIVE_INFINITY;
    const pb = getEventCategoryListing(b, categoryKey)?.price ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.matchNum - b.matchNum;
  });
}

export function filterShopEvents(
  events: ShopMarketEvent[],
  query: string,
): ShopMarketEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter((e) => {
    const idHay = [
      e.externalEventId,
      String(e.matchNum),
      e.catalogue.linkedEventId !== null ? String(e.catalogue.linkedEventId) : "",
    ]
      .join(" ")
      .toLowerCase();
    const nameHay = (e.catalogue.eventName ?? "").toLowerCase();
    return nameHay.includes(q) || idHay.includes(q);
  });
}

export function applyShopListFilters(
  events: ShopMarketEvent[],
  query: string,
  categoryFilter: ShopCategoryFilter,
): ShopMarketEvent[] {
  const searched = filterShopEvents(events, query);
  const byCat = filterShopEventsByCategory(searched, categoryFilter);
  if (categoryFilter === "all") return byCat;
  return sortShopEventsByCategoryPrice(byCat, categoryFilter);
}
