import type { SeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

export type MappedSeatsBrokersTicket = {
  offerIndex: number;
  fields: Record<string, string>;
  summary: {
    offerType: TransformedSeatOffer["offerType"];
    quantity: number;
    priceUsd: number | null;
    categoryId: string;
    blockId: string;
    row: string;
    seatNumbers: string[];
  };
};

function formatPriceUsd(priceUsd: number | null): string {
  if (priceUsd == null || !Number.isFinite(priceUsd)) return "0";
  return String(Math.round(priceUsd));
}

export function mapOfferToSeatsBrokersCreateTicket(
  offer: TransformedSeatOffer,
  matchId: string,
  config: SeatsBrokersConfig,
  offerIndex: number,
): MappedSeatsBrokersTicket | null {
  if (offer.transformedCount <= 0 || offer.seats.length === 0) return null;

  const first = offer.seats[0]!;
  const seatNumbers = offer.seats.map((s) => s.seatNumber.trim()).filter(Boolean);
  const ticketDetails = seatNumbers.join(",");
  const splitType =
    offer.offerType === "together" ? config.defaultSplitTypeTogether : config.defaultSplitTypeSingle;

  const fields: Record<string, string> = {
    match_id: matchId,
    ticket_type: config.defaultTicketType,
    quantity: String(offer.transformedCount),
    ticket_category: first.categoryId,
    ticket_block: first.blockId,
    ticket_row: first.row || "ALL",
    home_town: config.defaultHomeTown,
    price_type: config.priceType,
    price: formatPriceUsd(offer.priceUsd),
    ticket_details: ticketDetails,
    split_type: splitType,
  };

  return {
    offerIndex,
    fields,
    summary: {
      offerType: offer.offerType,
      quantity: offer.transformedCount,
      priceUsd: offer.priceUsd,
      categoryId: first.categoryId,
      blockId: first.blockId,
      row: first.row,
      seatNumbers,
    },
  };
}

export function mapOffersToSeatsBrokersCreateTickets(
  offers: TransformedSeatOffer[],
  matchId: string,
  config: SeatsBrokersConfig,
): MappedSeatsBrokersTicket[] {
  const out: MappedSeatsBrokersTicket[] = [];
  for (let i = 0; i < offers.length; i++) {
    const mapped = mapOfferToSeatsBrokersCreateTicket(offers[i]!, matchId, config, i);
    if (mapped) out.push(mapped);
  }
  return out;
}
