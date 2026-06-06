import type { SbListingUiStatus } from "@/lib/sb-listing-status";

export type SbCatalogListing = {
  logId: number;
  sbTicketId: string | null;
  status: SbListingUiStatus;
  trigger: string;
  matchId: string;
  pushedAt: string;
  inventoryRemovedAt: string | null;
  sbDeletedAt: string | null;
  sbDeleteError: string | null;
  quantity: string | null;
  price: string | null;
  priceType: string | null;
  ticketCategory: string | null;
  ticketDetails: string | null;
  ticketType: string | null;
  blockName: string | null;
  row: string | null;
  categoryName: string | null;
  categoryLabel: string | null;
  seatNumbers: string[];
  offerType: string | null;
  /** Config base URL used for SB API calls (trailing slash). */
  sbApiBaseUrl: string | null;
  /** POST path for the push that created this listing. */
  pushEndpoint: string;
  /** Full POST URL for push (base + pushEndpoint). */
  pushApiUrl: string | null;
  /** POST path for inventory removal on SB, when a delete was attempted. */
  deleteEndpoint: string | null;
  /** Full POST URL for delete, when a delete was attempted. */
  deleteApiUrl: string | null;
  /** Push log: POST ticket/create payload sent to SeatsBrokers. */
  requestFields: Record<string, string>;
  requestSummary: Record<string, unknown>;
  responseBody: unknown;
  httpStatus: number | null;
  errorMessage: string | null;
  offerIndex: number | null;
  listingFingerprint: string;
  sbDeleteHttpStatus: number | null;
};

export type SbCatalogMatch = {
  eventId: number;
  eventName: string;
  sbEventId: string | null;
  eventDate: string | null;
  venue: string | null;
  stage: string | null;
  country: string | null;
  sortOrder: number;
  /** Latest RESALE sock_available webhook scrape for this match (ISO). */
  lastScrapeAt: string | null;
  /** Listings auto-deleted on SB during the latest scrape reconcile (not manual). */
  lastScrapeDeletedCount: number;
  activeCount: number;
  deletedCount: number;
  failedCount: number;
  pendingCount: number;
  listings: SbCatalogListing[];
};

export function formatMatchDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
