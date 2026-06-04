/** Raw entry from `GET https://vivalafifa.realb.it/api/latest`. */
export type VivaMarketplaceListingEntry = {
  available: boolean;
  price?: number;
};

/** Full API response shape. */
export type VivaLatestApiResponse = {
  results: Record<string, VivaMarketplaceListingEntry>;
  scannedAt: string;
};

/** Parsed listing slot for one match × category. */
export type ShopMarketListing = {
  marketKey: string;
  categoryKey: string;
  categoryLabel: string;
  available: boolean;
  price: number | null;
};

/** DB / catalogue enrichment for a match. */
export type ShopEventCatalogueMeta = {
  linkedEventId: number | null;
  eventName: string;
  matchLabel: string | null;
  stage: string | null;
  venue: string | null;
  country: string | null;
  eventDate: string | null;
  competition: string | null;
};

/** Normalized event row for UI + sync. */
export type ShopMarketEvent = {
  matchNum: number;
  externalEventId: string;
  catalogue: ShopEventCatalogueMeta;
  listings: ShopMarketListing[];
  availableCount: number;
  listingsCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  currency: string;
  /** FIFA shop checkout URL (same mapping as vivalafifa.realb.it). */
  buyUrl: string | null;
  /** Per-match slice of API results. */
  rawPayload: Record<string, VivaMarketplaceListingEntry>;
};

/** Client-facing API payload. */
export type ShopLatestPayload = {
  scannedAt: string;
  fetchedAt: string;
  events: ShopMarketEvent[];
};

export type ShopFetchError = {
  code: "network" | "parse" | "http";
  message: string;
  status?: number;
};
