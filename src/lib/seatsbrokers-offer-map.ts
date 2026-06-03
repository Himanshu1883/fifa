import { sockAmountToUsd } from "@/lib/format-usd";
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
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

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
): MappedSeatsBrokersTicket | null {
  if (offer.transformedCount <= 0 || offer.seats.length === 0) return null;

  const first = offer.seats[0]!;
  const seatNumbers = offer.seats.map((s) => s.seatNumber.trim()).filter(Boolean);
  const ticketDetails = seatNumbers.join(",");
  const splitType =
    offer.offerType === "together" ? config.defaultSplitTypeTogether : config.defaultSplitTypeSingle;
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
    ticket_block: sbBlockRowId,
    ticket_row: first.row || "ALL",
    home_town: config.defaultHomeTown,
    price_type: config.priceType,
    price: formatPriceUsdForSb(resolveOfferPriceUsd(offer)),
    ticket_details: ticketDetails,
    split_type: splitType,
  };
  if (dateToShip) fields.date_to_ship = dateToShip;

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
    },
  };
}

export function mapOffersToSeatsBrokersCreateTickets(
  offers: TransformedSeatOffer[],
  matchId: string,
  config: SeatsBrokersConfig,
  dateToShip: string | null = null,
  catalog: SbMatchCatalog | null = null,
): MappedSeatsBrokersTicket[] {
  const out: MappedSeatsBrokersTicket[] = [];
  for (let i = 0; i < offers.length; i++) {
    const mapped = mapOfferToSeatsBrokersCreateTicket(offers[i]!, matchId, config, i, dateToShip, catalog);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Long numeric ids are FIFA/SockAvailable; SB block_id values are short section codes. */
export function isLikelyFifaSnowflakeId(value: string): boolean {
  return /^\d{12,}$/.test(value.trim());
}


/**
 * Re-apply SB catalog mapping on push so ticket_category / ticket_block are never FIFA ids.
 * Seat fields (row, ticket_details, quantity) always come from current inventory — stale preview
 * payloads cannot re-push an old seat after offers refresh.
 */
export function enrichMappedTicketForPush(
  ticket: MappedSeatsBrokersTicket,
  offers: TransformedSeatOffer[],
  matchId: string,
  config: SeatsBrokersConfig,
  dateToShip: string | null,
  catalog: SbMatchCatalog | null,
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
    ? resolveSbTicketBlockRowId(clientBlock, baseline.summary.sbBlockOptions, baseline.fields.ticket_block)
    : baseline.fields.ticket_block;
  const ticketCategory = useClientCategory ? clientCategory : baseline.fields.ticket_category;
  const sbBlockCode = sbBlockCodeForRowId(ticketBlock, baseline.summary.sbBlockOptions);

  const clientPrice = clientFields.price?.trim();
  const clientTicketType = clientFields.ticket_type?.trim();
  const clientSplitType = clientFields.split_type?.trim();
  const clientDateToShip = clientFields.date_to_ship?.trim();

  const fields: Record<string, string> = {
    ...baseline.fields,
    match_id: matchId,
    ticket_category: ticketCategory,
    ticket_block: ticketBlock,
    ...(clientPrice ? { price: clientPrice } : {}),
    ...(clientTicketType ? { ticket_type: clientTicketType } : {}),
    ...(clientSplitType ? { split_type: clientSplitType } : {}),
    ...(clientDateToShip ? { date_to_ship: clientDateToShip } : {}),
  };

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
