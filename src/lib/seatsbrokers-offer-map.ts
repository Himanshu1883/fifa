import { sockAmountToUsd } from "@/lib/format-usd";
import {
  formatFaceValueForSb,
  resolveFaceValueUsdForSb,
  type SbFaceValueLookup,
} from "@/lib/sb-face-value";
import type { SbCategoryNum } from "@/lib/sb-category";
import {
  isValidSbTicketBlockValue,
  resolveSbBlockFromCatalog,
  resolveSbCategoryFromCatalog,
  resolveSbTicketBlockRowId,
  sbBlockCodeForRowId,
  type SbBlockOption,
  type SbMatchCatalog,
} from "@/lib/seatsbrokers-catalog";
import type { SeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import type { SeatOfferType, TransformedSeatOffer } from "@/lib/seat-offers-transform";

/** SB split_type: single seats → 5; pairs / together buckets → 2. */
export function resolveSbSplitTypeForOffer(offerType: SeatOfferType): string {
  return offerType === "single" ? "5" : "2";
}

export type MappedSeatsBrokersTicket = {
  offerIndex: number;
  fields: Record<string, string>;
  summary: {
    offerType: TransformedSeatOffer["offerType"];
    quantity: number;
    priceUsd: number | null;
    fifaCategoryId: string;
    sbCategoryId: string;
    categoryName: string;
    categoryNum: SbCategoryNum | null;
    categoryLabel: string;
    fifaBlockId: string;
    /** SB ticket_block value (internal row id, e.g. 1060776). */
    sbBlockId: string;
    /** Section code shown on SB after create (e.g. 111c). */
    sbBlockCode: string;
    blockName: string;
    sbBlockMatched: boolean;
    sbBlockOptions: SbBlockOption[];
    row: string;
    seatNumbers: string[];
    /** FIFA seat ids — used for dedupe; optional on older preview payloads. */
    seatIds?: string[];
    /** All seats on the UI row when push used quantity reduction (e.g. 9–12 → qty 1). */
    sourceSeatIds?: string[];
    /** Seat numbers on that UI row (e.g. 9,10,11,12) for table lookup. */
    sourceSeatNumbers?: string[];
    /** Face value USD from shop/catalogue lookup, or listing price when lookup missed. */
    faceValueUsd?: number | null;
    /** True when face_value was set from listing price because lookup missed. */
    faceValueDefaultedToPrice?: boolean;
  };
};

function resolveOfferPriceUsd(offer: TransformedSeatOffer): number | null {
  if (offer.priceUsd != null && Number.isFinite(offer.priceUsd) && offer.priceUsd > 0) {
    return offer.priceUsd;
  }
  return sockAmountToUsd(offer.priceRaw);
}

/** Whole-dollar price sent to SB ticket/create (SB rejects 0). */
function formatPriceUsdForSb(priceUsd: number | null): string {
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return "0";
  return String(Math.max(1, Math.round(priceUsd)));
}

export function mapOfferToSeatsBrokersCreateTicket(
  offer: TransformedSeatOffer,
  matchId: string,
  config: SeatsBrokersConfig,
  offerIndex: number,
  dateToShip: string | null = null,
  catalog: SbMatchCatalog | null = null,
  faceValueLookup: SbFaceValueLookup | null = null,
): MappedSeatsBrokersTicket | null {
  if (offer.transformedCount <= 0 || offer.seats.length === 0) return null;

  const first = offer.seats[0]!;
  const priceUsd = resolveOfferPriceUsd(offer);
  const { faceValueUsd, defaultedToListingPrice } = resolveFaceValueUsdForSb(
    faceValueLookup,
    first.categoryId,
    first.blockId,
    first.categoryName,
    first.blockName,
    priceUsd,
  );
  const faceValueField = formatFaceValueForSb(faceValueUsd);
  const seatNumbers = offer.seats.map((s) => s.seatNumber.trim()).filter(Boolean);
  const splitType = resolveSbSplitTypeForOffer(offer.offerType);
  const { sbCategoryId, categoryNum, categoryLabel } = resolveSbCategoryFromCatalog(
    catalog,
    first.categoryName,
    first.categoryId,
  );
  const { sbBlockRowId, sbBlockCode, matched: sbBlockMatched, sbBlockOptions } = resolveSbBlockFromCatalog(
    catalog,
    sbCategoryId,
    first.blockName,
    first.blockId,
  );

  const fields: Record<string, string> = {
    match_id: matchId,
    ticket_type: config.defaultTicketType,
    quantity: String(offer.transformedCount),
    ticket_category: sbCategoryId,
    home_town: config.defaultHomeTown,
    price_type: config.priceType,
    price: formatPriceUsdForSb(priceUsd),
    split_type: splitType,
    ...(sbBlockRowId ? { ticket_block: sbBlockRowId } : {}),
  };
  if (dateToShip) fields.date_to_ship = dateToShip;
  if (priceUsd != null && Number.isFinite(priceUsd) && priceUsd > 0) {
    fields.face_value = faceValueField ?? formatPriceUsdForSb(priceUsd);
  }

  return {
    offerIndex,
    fields,
    summary: {
      offerType: offer.offerType,
      quantity: offer.transformedCount,
      priceUsd: resolveOfferPriceUsd(offer),
      fifaCategoryId: first.categoryId,
      sbCategoryId,
      categoryName: first.categoryName,
      categoryNum,
      categoryLabel,
      fifaBlockId: first.blockId,
      sbBlockId: sbBlockRowId,
      sbBlockCode,
      blockName: first.blockName,
      sbBlockMatched,
      sbBlockOptions,
      row: first.row,
      seatNumbers,
      seatIds: offer.seats.map((s) => s.seatId.trim()).filter(Boolean),
      faceValueUsd,
      faceValueDefaultedToPrice: defaultedToListingPrice,
    },
  };
}

export function mapOffersToSeatsBrokersCreateTickets(
  offers: TransformedSeatOffer[],
  matchId: string,
  config: SeatsBrokersConfig,
  dateToShip: string | null = null,
  catalog: SbMatchCatalog | null = null,
  faceValueLookup: SbFaceValueLookup | null = null,
): MappedSeatsBrokersTicket[] {
  const out: MappedSeatsBrokersTicket[] = [];
  for (let i = 0; i < offers.length; i++) {
    const mapped = mapOfferToSeatsBrokersCreateTicket(
      offers[i]!,
      matchId,
      config,
      i,
      dateToShip,
      catalog,
      faceValueLookup,
    );
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Long numeric ids are FIFA/SockAvailable; SB block_id values are short section codes. */
export function isLikelyFifaSnowflakeId(value: string): boolean {
  return /^\d{12,}$/.test(value.trim());
}

/** SB ticket/create fields we intentionally omit (row/seat numbers stay in summary only). */
const SB_CREATE_OMITTED_FIELD_KEYS = new Set(["ticket_row", "ticket_details"]);

/** Strip omitted fields before POST ticket/create. */
export function fieldsForSbTicketCreate(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SB_CREATE_OMITTED_FIELD_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Preview / API responses: only fields actually POSTed to SB. */
export type SbTicketPreviewPayload = {
  offerIndex: number;
  fields: Record<string, string>;
  summary: {
    offerType: MappedSeatsBrokersTicket["summary"]["offerType"];
    quantity: number;
    priceUsd: number | null;
    categoryName: string;
    categoryNum: MappedSeatsBrokersTicket["summary"]["categoryNum"];
    categoryLabel: string;
    sbCategoryId: string;
  };
};

export function toSbTicketPreviewPayload(ticket: MappedSeatsBrokersTicket): SbTicketPreviewPayload {
  const { summary } = ticket;
  return {
    offerIndex: ticket.offerIndex,
    fields: fieldsForSbTicketCreate(ticket.fields),
    summary: {
      offerType: summary.offerType,
      quantity: summary.quantity,
      priceUsd: summary.priceUsd,
      categoryName: summary.categoryName,
      categoryNum: summary.categoryNum,
      categoryLabel: summary.categoryLabel,
      sbCategoryId: summary.sbCategoryId,
    },
  };
}


/**
 * Re-apply SB catalog mapping on push so ticket_category is never a FIFA id.
 * Row/block/ticket_details are not sent on ticket/create.
 * Quantity always comes from current inventory — stale preview
 * payloads cannot re-push an old seat after offers refresh.
 */
export function enrichMappedTicketForPush(
  ticket: MappedSeatsBrokersTicket,
  offers: TransformedSeatOffer[],
  matchId: string,
  config: SeatsBrokersConfig,
  dateToShip: string | null,
  catalog: SbMatchCatalog | null,
  faceValueLookup: SbFaceValueLookup | null = null,
): MappedSeatsBrokersTicket | null {
  const offer = offers[ticket.offerIndex];
  if (!offer) return null;

  const baseline = mapOfferToSeatsBrokersCreateTicket(
    offer,
    matchId,
    config,
    ticket.offerIndex,
    dateToShip,
    catalog,
    faceValueLookup,
  );
  if (!baseline) return null;

  const clientFields = ticket.fields;
  const clientBlock = (clientFields.ticket_block ?? "").trim();
  const clientCategory = (clientFields.ticket_category ?? "").trim();

  const useClientBlock =
    clientBlock.length > 0 &&
    !isLikelyFifaSnowflakeId(clientBlock) &&
    isValidSbTicketBlockValue(clientBlock, baseline.summary.sbBlockOptions);

  const useClientCategory =
    clientCategory.length > 0 &&
    !isLikelyFifaSnowflakeId(clientCategory) &&
    (catalog?.categories.some((c) => c.id === clientCategory) ?? false);

  const ticketBlock = useClientBlock
    ? resolveSbTicketBlockRowId(clientBlock, baseline.summary.sbBlockOptions, baseline.summary.sbBlockId)
    : baseline.summary.sbBlockId;
  const ticketCategory = useClientCategory ? clientCategory : baseline.fields.ticket_category;
  const sbBlockCode = sbBlockCodeForRowId(ticketBlock, baseline.summary.sbBlockOptions);

  const clientPrice = clientFields.price?.trim();
  const clientFaceValue = clientFields.face_value?.trim();
  const clientTicketType = clientFields.ticket_type?.trim();
  const clientDateToShip = clientFields.date_to_ship?.trim();

  const fields: Record<string, string> = {
    ...fieldsForSbTicketCreate(baseline.fields),
    match_id: matchId,
    ticket_category: ticketCategory,
    split_type: resolveSbSplitTypeForOffer(offer.offerType),
    ...(ticketBlock ? { ticket_block: ticketBlock } : {}),
    ...(clientPrice ? { price: clientPrice } : {}),
    ...(clientFaceValue ? { face_value: clientFaceValue } : {}),
    ...(clientTicketType ? { ticket_type: clientTicketType } : {}),
    ...(clientDateToShip ? { date_to_ship: clientDateToShip } : {}),
  };
  if (!fields.face_value?.trim()) {
    if (baseline.fields.face_value) {
      fields.face_value = baseline.fields.face_value;
    } else {
      const priceStr = fields.price?.trim() ?? "";
      if (priceStr && priceStr !== "0") fields.face_value = priceStr;
    }
  }

  const sbBlockMatched =
    Boolean(ticketBlock) &&
    (baseline.summary.sbBlockMatched || isValidSbTicketBlockValue(ticketBlock, baseline.summary.sbBlockOptions));

  const clientPriceUsd = ticket.summary.priceUsd;
  const priceUsd =
    clientPriceUsd != null && Number.isFinite(clientPriceUsd) && clientPriceUsd > 0
      ? clientPriceUsd
      : baseline.summary.priceUsd;

  return {
    offerIndex: ticket.offerIndex,
    fields,
    summary: {
      ...baseline.summary,
      priceUsd,
      sbBlockId: ticketBlock,
      sbBlockCode,
      sbBlockMatched,
    },
  };
}
