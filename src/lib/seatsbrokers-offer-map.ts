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
 * Re-apply SB catalog mapping on push so ticket_category / ticket_block are never FIFA ids,
 * while preserving client edits to price, quantity, seats, and manually chosen SB blocks.
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

  const fields: Record<string, string> = {
    ...baseline.fields,
    ...clientFields,
    match_id: clientFields.match_id?.trim() || matchId,
    ticket_category: ticketCategory,
    ticket_block: ticketBlock,
  };

  const sbBlockMatched =
    Boolean(ticketBlock) &&
    (baseline.summary.sbBlockMatched || isValidSbTicketBlockValue(ticketBlock, baseline.summary.sbBlockOptions));

  return {
    offerIndex: ticket.offerIndex,
    fields,
    summary: {
      ...baseline.summary,
      offerType: ticket.summary.offerType,
      quantity: ticket.summary.quantity ?? baseline.summary.quantity,
      priceUsd: ticket.summary.priceUsd ?? baseline.summary.priceUsd,
      sbBlockId: ticketBlock,
      sbBlockCode,
      sbBlockMatched,
    },
  };
}
