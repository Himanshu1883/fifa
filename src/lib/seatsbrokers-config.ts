import { DEFAULT_SB_TICKET_TYPE_ID, parseSbTicketTypeId } from "@/lib/sb-ticket-types";

export type SeatsBrokersConfig = {
  baseUrl: string;
  apiKey: string;
  /** SB `tournament_id` for POST /events (e.g. 64 = Football World Cup 2026). */
  defaultTournamentId: string;
  defaultTicketType: string;
  defaultSplitTypeTogether: string;
  defaultSplitTypeSingle: string;
  defaultHomeTown: string;
  priceType: string;
};

const DEFAULT_BASE = "https://sandbox-sellerapi.seatsbrokers.com/api/";

export function getSeatsBrokersConfig(): SeatsBrokersConfig | null {
  const apiKey = process.env.SEATS_BROKERS_API_KEY?.trim();
  if (!apiKey) return null;

  let baseUrl = (process.env.SEATS_BROKERS_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/?$/, "/");

  return {
    baseUrl,
    apiKey,
    defaultTournamentId: process.env.SEATS_BROKERS_DEFAULT_TOURNAMENT_ID?.trim() || "64",
    defaultTicketType: process.env.SEATS_BROKERS_DEFAULT_TICKET_TYPE?.trim() || "3",
    defaultSplitTypeTogether: process.env.SEATS_BROKERS_SPLIT_TYPE_TOGETHER?.trim() || "5",
    defaultSplitTypeSingle: process.env.SEATS_BROKERS_SPLIT_TYPE_SINGLE?.trim() || "2",
    defaultHomeTown: process.env.SEATS_BROKERS_DEFAULT_HOME_TOWN?.trim() || "1",
    priceType: process.env.SEATS_BROKERS_PRICE_TYPE?.trim() || "USD",
  };
}

export function configWithTicketType(
  config: SeatsBrokersConfig,
  ticketTypeId?: string | null,
): SeatsBrokersConfig {
  const ticketType = parseSbTicketTypeId(ticketTypeId ?? config.defaultTicketType);
  if (ticketType === config.defaultTicketType) return config;
  return { ...config, defaultTicketType: ticketType };
}

export function requireSeatsBrokersConfig(): SeatsBrokersConfig {
  const config = getSeatsBrokersConfig();
  if (!config) {
    throw new Error(
      "SeatsBrokers is not configured. Set SEATS_BROKERS_API_KEY in .env.local (see .env.example).",
    );
  }
  return config;
}
