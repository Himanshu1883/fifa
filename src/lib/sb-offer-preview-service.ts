import {
  loadTransformedSeatOffersForEvent,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { resolveOfferForSeatIds } from "@/lib/sb-offer-match";
import {
  describeQuantityRule,
  SB_PUSH_TRANSFORM_RULES_DOC,
} from "@/lib/sb-push-transform-rules";
import { getPushedListingDedupeKeys } from "@/lib/seatsbrokers-push-service";
import {
  dedupeKeysFromPushLog,
  listingDedupeKeysForMappedTicket,
  listingFingerprintForOffer,
} from "@/lib/sb-listing-fingerprint";
import { computeDateToShip } from "@/lib/sb-date-to-ship";
import { loadSbMatchCatalogForOffers } from "@/lib/seatsbrokers-catalog";
import { configWithTicketType, getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import {
  enrichMappedTicketForPush,
  mapOffersToSeatsBrokersCreateTickets,
  type MappedSeatsBrokersTicket,
} from "@/lib/seatsbrokers-offer-map";
import { prisma } from "@/lib/prisma";

export type SbOfferPreviewResult =
  | {
      ok: true;
      eventId: number;
      eventName: string;
      matchId: string;
      markupPercent: number;
      eventDate: string | null;
      dateToShip: string | null;
      offerIndex: number;
      matchKind: "exact" | "bundled" | "quantity_reduced";
      clickedSeatCount: number;
      clickedSeatIds: string[];
      offer: {
        offerType: string;
        kind: string;
        originalCount: number;
        transformedCount: number;
        priceUsd: number | null;
        sourceGroupCount: number;
        seats: Array<{
          seatId: string;
          seatNumber: string;
          row: string;
          blockName: string;
          categoryName: string;
        }>;
      };
      quantityRule: string;
      ticket: MappedSeatsBrokersTicket;
      rules: typeof SB_PUSH_TRANSFORM_RULES_DOC;
      warnings: string[];
      alreadyPushed: boolean;
      existingSbTicketId: string | null;
      bundledOfferNote: string | null;
    }
  | { ok: false; error: string };

export async function loadSbOfferPreviewForSeatIds(
  eventId: number,
  seatIds: string[],
  options?: { ticketType?: string | null },
): Promise<SbOfferPreviewResult> {
  const configBase = getSeatsBrokersConfig();
  if (!configBase) {
    return { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY." };
  }

  const config = configWithTicketType(configBase, options?.ticketType ?? null);

  const loaded = await loadTransformedSeatOffersForEvent(eventId, {
    kind: SEATS_BROKERS_PUSH_INVENTORY_KIND,
    markupPercent: "persisted",
  });
  if (!loaded) return { ok: false, error: "Event not found." };

  const matchId = loaded.event.sbEventId?.trim();
  if (!matchId) {
    return { ok: false, error: "Event has no SB match id. Add it via Add SB ID first." };
  }

  const offers = loaded.transform.offers.filter((o) => o.kind === SEATS_BROKERS_PUSH_INVENTORY_KIND);
  const resolved = resolveOfferForSeatIds(seatIds, offers);
  if (!resolved) {
    return {
      ok: false,
      error:
        "No SB offer matches these seats. Common causes: different prices in the same row (split buckets), or quantity rules removed this bucket (e.g. mapped to 0).",
    };
  }

  const { offerIndex, matchKind, clickedSeatIds } = resolved;
  const offer = offers[offerIndex]!;
  const dateToShip = computeDateToShip(loaded.event.eventDate);
  const catalog = await loadSbMatchCatalogForOffers(matchId, offers, config);
  const mapped = mapOffersToSeatsBrokersCreateTickets(offers, matchId, config, dateToShip, catalog);
  const rawTicket = mapped.find((m) => m.offerIndex === offerIndex);
  if (!rawTicket) {
    return { ok: false, error: "Cannot map this offer to SeatsBrokers (block/category/price)." };
  }

  const ticket =
    enrichMappedTicketForPush(rawTicket, offers, matchId, config, dateToShip, catalog) ?? rawTicket;

  const warnings: string[] = [];
  const price = ticket.summary.priceUsd;
  if (price == null || !Number.isFinite(price) || price <= 0) {
    warnings.push("Price is missing or zero — SB may reject the listing.");
  }
  if (!String(ticket.fields.ticket_category ?? "").trim()) {
    warnings.push("SB ticket_category is not mapped for this FIFA category.");
  }
  if (!ticket.summary.sbBlockMatched || !String(ticket.fields.ticket_block ?? "").trim()) {
    warnings.push(
      `SB ticket_block not auto-matched for FIFA block "${ticket.summary.blockName}".`,
    );
  }
  if (!String(ticket.fields.date_to_ship ?? "").trim()) {
    warnings.push("date_to_ship is missing — set the event date on this match.");
  }

  const dedupeKeys = listingDedupeKeysForMappedTicket(offer, ticket);
  const existingKeys = await getPushedListingDedupeKeys(eventId);
  const alreadyPushed = dedupeKeys.some((k) => existingKeys.has(k));

  let existingSbTicketId: string | null = null;
  if (alreadyPushed) {
    const fp = listingFingerprintForOffer(offer);
    const log = await prisma.sbListingPushLog.findFirst({
      where: { eventId, listingFingerprint: fp, ok: true, sbTicketId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { sbTicketId: true, listingFingerprint: true, requestSummary: true },
    });
    if (log?.sbTicketId) existingSbTicketId = log.sbTicketId;
    else {
      const logs = await prisma.sbListingPushLog.findMany({
        where: { eventId, ok: true, sbTicketId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { sbTicketId: true, listingFingerprint: true, requestSummary: true },
      });
      for (const row of logs) {
        const keys = dedupeKeysFromPushLog(row.listingFingerprint, row.requestSummary);
        if (dedupeKeys.some((k) => keys.includes(k))) {
          existingSbTicketId = row.sbTicketId;
          break;
        }
      }
    }
    warnings.push(
      existingSbTicketId
        ? `Already on SB (listing id ${existingSbTicketId}).`
        : "These seats were already pushed to SB.",
    );
  }

  let bundledOfferNote: string | null = null;
  if (matchKind === "quantity_reduced") {
    bundledOfferNote = `Quantity rule for ${offer.offerType} (${offer.originalCount} seats in bucket): SB listing quantity is ${offer.transformedCount}, so only ${offer.seats.length} seat(s) are sent in ticket_details — not all ${clickedSeatIds.length} seats on this row.`;
    warnings.push(bundledOfferNote);
  } else if (matchKind === "bundled") {
    bundledOfferNote = `You clicked ${clickedSeatIds.length} seat(s), but SB push uses the full aggregated offer (${offer.seats.length} seat(s) in payload, quantity ${offer.transformedCount}). Same block + same price are merged across rows/groups.`;
    warnings.push(bundledOfferNote);
  }

  return {
    ok: true,
    eventId: loaded.event.id,
    eventName: loaded.event.name,
    matchId,
    markupPercent: loaded.markupPercent,
    eventDate: loaded.event.eventDate?.toISOString().slice(0, 10) ?? null,
    dateToShip,
    offerIndex,
    matchKind,
    clickedSeatCount: clickedSeatIds.length,
    clickedSeatIds,
    offer: {
      offerType: offer.offerType,
      kind: offer.kind,
      originalCount: offer.originalCount,
      transformedCount: offer.transformedCount,
      priceUsd: offer.priceUsd,
      sourceGroupCount: offer.sourceGroupCount,
      seats: offer.seats.map((s) => ({
        seatId: s.seatId,
        seatNumber: s.seatNumber,
        row: s.row,
        blockName: s.blockName,
        categoryName: s.categoryName,
      })),
    },
    quantityRule: describeQuantityRule(offer.offerType, offer.originalCount, offer.transformedCount),
    ticket,
    rules: SB_PUSH_TRANSFORM_RULES_DOC,
    warnings,
    alreadyPushed,
    existingSbTicketId,
    bundledOfferNote,
  };
}
