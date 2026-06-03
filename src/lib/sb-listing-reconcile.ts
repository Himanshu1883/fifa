import {
  loadTransformedSeatOffersForEvent,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { isSbListingRemovalMigrationMissingError } from "@/lib/sb-listing-push-log-query";
import { prisma } from "@/lib/prisma";
import {
  dedupeKeysFromPushLog,
  listingFingerprintForOffer,
} from "@/lib/sb-listing-fingerprint";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";
import { sbDeleteTicket } from "@/lib/seatsbrokers-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

const SB_PUSH_CLAIM_MARKER = "__sb_push_claim__";

export type SbListingReconcileResult = {
  ran: boolean;
  skippedReason?: string;
  currentOfferCount: number;
  markedRemoved: number;
  deletedFromSb: number;
  deleteFailed: number;
};

function buildActiveFingerprintSet(offers: TransformedSeatOffer[]): Set<string> {
  const keys = new Set<string>();
  for (const offer of offers) {
    if (offer.kind !== SEATS_BROKERS_PUSH_INVENTORY_KIND) continue;
    keys.add(listingFingerprintForOffer(offer));
    const seatIds = offer.seats.map((s) => s.seatId.trim()).filter(Boolean).sort();
    if (seatIds.length > 0) {
      keys.add(`${SEATS_BROKERS_PUSH_INVENTORY_KIND}|single|${seatIds.join(",")}`);
      keys.add(`${SEATS_BROKERS_PUSH_INVENTORY_KIND}|together|${seatIds.join(",")}`);
    }
  }
  return keys;
}

function logStillInInventory(logFingerprint: string, requestSummary: unknown, active: Set<string>): boolean {
  for (const key of dedupeKeysFromPushLog(logFingerprint, requestSummary)) {
    if (active.has(key)) return true;
  }
  return false;
}

/**
 * After a RESALE sock_available sync: mark pushed listings that vanished from inventory
 * and delete them on SeatsBrokers.
 */
export async function reconcileSbListingsAfterSockSync(eventId: number): Promise<SbListingReconcileResult> {
  const empty = {
    currentOfferCount: 0,
    markedRemoved: 0,
    deletedFromSb: 0,
    deleteFailed: 0,
  } as const;

  const config = getSeatsBrokersConfig();
  if (!config) {
    return { ran: false, skippedReason: "sb_not_configured", ...empty };
  }

  const loaded = await loadTransformedSeatOffersForEvent(eventId, {
    kind: SEATS_BROKERS_PUSH_INVENTORY_KIND,
    markupPercent: "persisted",
  });
  if (!loaded) {
    return { ran: false, skippedReason: "event_not_found", currentOfferCount: 0, markedRemoved: 0, deletedFromSb: 0, deleteFailed: 0 };
  }

  const matchId = loaded.event.sbEventId?.trim();
  if (!matchId) {
    return { ran: false, skippedReason: "no_sb_match_id", currentOfferCount: 0, markedRemoved: 0, deletedFromSb: 0, deleteFailed: 0 };
  }

  const resaleOffers = loaded.transform.offers.filter((o) => o.kind === SEATS_BROKERS_PUSH_INVENTORY_KIND);
  const activeFingerprints = buildActiveFingerprintSet(resaleOffers);

  let pushedLogs: Array<{
    id: number;
    matchId: string;
    sbTicketId: string | null;
    listingFingerprint: string;
    requestSummary: unknown;
    inventoryRemovedAt: Date | null;
  }>;

  try {
    pushedLogs = await prisma.sbListingPushLog.findMany({
      where: {
        eventId,
        ok: true,
        sbTicketId: { not: null },
        NOT: { errorMessage: SB_PUSH_CLAIM_MARKER },
        sbDeletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        matchId: true,
        sbTicketId: true,
        listingFingerprint: true,
        requestSummary: true,
        inventoryRemovedAt: true,
      },
    });
  } catch (e) {
    if (isSbListingRemovalMigrationMissingError(e)) {
      return { ran: false, skippedReason: "migration_pending", ...empty };
    }
    throw e;
  }

  let markedRemoved = 0;
  let deletedFromSb = 0;
  let deleteFailed = 0;
  const now = new Date();

  for (const log of pushedLogs) {
    const stillThere = logStillInInventory(log.listingFingerprint, log.requestSummary, activeFingerprints);
    if (stillThere) {
      if (log.inventoryRemovedAt) {
        await prisma.sbListingPushLog.update({
          where: { id: log.id },
          data: { inventoryRemovedAt: null, sbDeleteError: null, sbDeleteHttpStatus: null },
          select: { id: true },
        });
      }
      continue;
    }

    if (!log.inventoryRemovedAt) {
      await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: { inventoryRemovedAt: now },
      });
      markedRemoved++;
    }

    const ticketId = log.sbTicketId?.trim();
    if (!ticketId) continue;

    const deleteRes = await sbDeleteTicket(ticketId, log.matchId || matchId, config);
    if (deleteRes.ok) {
      await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: {
          sbDeletedAt: now,
          sbDeleteHttpStatus: deleteRes.status,
          sbDeleteError: null,
        },
        select: { id: true },
      });
      deletedFromSb++;
    } else {
      await prisma.sbListingPushLog.update({
        where: { id: log.id },
        data: {
          sbDeleteHttpStatus: deleteRes.status || null,
          sbDeleteError: deleteRes.error.slice(0, 2000),
        },
        select: { id: true },
      });
      deleteFailed++;
    }
  }

  return {
    ran: true,
    currentOfferCount: resaleOffers.length,
    markedRemoved,
    deletedFromSb,
    deleteFailed,
  };
}
