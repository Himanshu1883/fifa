import { Prisma } from "@/generated/prisma/client";
import {
  loadTransformedSeatOffersForEvent,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { prisma } from "@/lib/prisma";
import {
  getSbAutoPushEnabled,
  getSbAutoPushTicketType,
  isEventRegisteredForSbAutoPush,
  listRegisteredSbAutoPushEventIds,
  registerEventForSbAutoPush,
  touchEventLastAutoPush,
} from "@/lib/sb-auto-push-settings";
import {
  dedupeKeysFromPushLog,
  listingDedupeKeysForMappedTicket,
  listingFingerprintForMappedTicket,
} from "@/lib/sb-listing-fingerprint";
import { sbPushLogExcludingClaimWhere } from "@/lib/sb-listing-push-log-query";
import { computeDateToShip } from "@/lib/sb-date-to-ship";
import { loadSbMatchCatalogForOffers } from "@/lib/seatsbrokers-catalog";
import { sbCreateTicket } from "@/lib/seatsbrokers-client";
import {
  configWithTicketType,
  getSeatsBrokersConfig,
  type SeatsBrokersConfig,
} from "@/lib/seatsbrokers-config";
import {
  enrichMappedTicketForPush,
  fieldsForSbTicketCreate,
  isLikelyFifaSnowflakeId,
  mapOffersToSeatsBrokersCreateTickets,
  toSbTicketPreviewPayload,
  type SbTicketPreviewPayload,
  type MappedSeatsBrokersTicket,
} from "@/lib/seatsbrokers-offer-map";
import { extractSbTicketId } from "@/lib/sb-ticket-id";
import type { TransformedSeatOffer } from "@/lib/seat-offers-transform";

export type SbPushTicketResult = {
  offerIndex: number;
  ok: boolean;
  skipped?: boolean;
  status?: number;
  fields?: Record<string, string>;
  summary: MappedSeatsBrokersTicket["summary"];
  response?: unknown;
  error?: string;
  listingFingerprint: string;
  sbTicketId?: string | null;
  logId?: number;
};

export type ExecuteSbPushOptions = {
  eventId: number;
  matchId: string;
  offers: TransformedSeatOffer[];
  tickets: MappedSeatsBrokersTicket[];
  config: SeatsBrokersConfig;
  dateToShip: string | null;
  catalog: Awaited<ReturnType<typeof loadSbMatchCatalogForOffers>>;
  trigger: "MANUAL" | "AUTO";
};

function sourceSeatsForPush(
  offer: TransformedSeatOffer | undefined,
  explicitIds?: string[],
): { sourceSeatIds?: string[]; sourceSeatNumbers?: string[] } {
  const fromUi = explicitIds?.map((s) => s.trim()).filter(Boolean);
  const ids =
    fromUi?.length
      ? [...fromUi].sort()
      : (offer?.allSeatIds?.map((s) => s.trim()).filter(Boolean) ?? []);
  const numbers = offer?.allSeatNumbers?.map((s) => s.trim()).filter(Boolean) ?? [];
  return {
    ...(ids.length > 0 ? { sourceSeatIds: [...ids].sort() } : {}),
    ...(numbers.length > 0 ? { sourceSeatNumbers: [...numbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) } : {}),
  };
}

/** In-flight push claim marker (row has ok=true until API completes or claim expires). */
const SB_PUSH_CLAIM_MARKER = "__sb_push_claim__";

const STALE_CLAIM_MS = 10 * 60 * 1000;

function isPrismaUniqueConstraintError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}

async function expireStalePushClaims(eventId: number): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS);
  await prisma.sbListingPushLog.updateMany({
    where: {
      eventId,
      ok: true,
      errorMessage: SB_PUSH_CLAIM_MARKER,
      sbTicketId: null,
      createdAt: { lt: cutoff },
    },
    data: {
      ok: false,
      errorMessage: "Stale push claim expired (push did not finish).",
    },
  });
}

/** All dedupe keys for listings already created on SB for this event. */
export async function getPushedListingDedupeKeys(eventId: number): Promise<Set<string>> {
  await expireStalePushClaims(eventId);

  const rows = await prisma.sbListingPushLog.findMany({
    where: { eventId, ok: true, ...sbPushLogExcludingClaimWhere() },
    select: { listingFingerprint: true, requestSummary: true },
  });

  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of dedupeKeysFromPushLog(row.listingFingerprint, row.requestSummary)) {
      keys.add(k);
    }
  }
  return keys;
}

/** Latest SB ticket_id for a listing that was already created (or blocked by in-flight claim). */
export async function findExistingSbTicketIdForKeys(
  eventId: number,
  dedupeKeys: string[],
  listingFingerprint?: string | null,
): Promise<string | null> {
  if (listingFingerprint) {
    const direct = await prisma.sbListingPushLog.findFirst({
      where: {
        eventId,
        listingFingerprint,
        ok: true,
        sbTicketId: { not: null },
        ...sbPushLogExcludingClaimWhere(),
      },
      orderBy: { createdAt: "desc" },
      select: { sbTicketId: true },
    });
    if (direct?.sbTicketId) return direct.sbTicketId;
  }

  const logs = await prisma.sbListingPushLog.findMany({
    where: {
      eventId,
      ok: true,
      sbTicketId: { not: null },
      ...sbPushLogExcludingClaimWhere(),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { sbTicketId: true, listingFingerprint: true, requestSummary: true },
  });

  for (const row of logs) {
    const keys = dedupeKeysFromPushLog(row.listingFingerprint, row.requestSummary);
    if (dedupeKeys.some((k) => keys.includes(k)) && row.sbTicketId) return row.sbTicketId;
  }

  return null;
}

/** Whether this offer is already on SB and the listing id when known. */
export async function resolveAlreadyPushedOnSb(
  eventId: number,
  dedupeKeys: string[],
  listingFingerprint: string,
): Promise<{ alreadyPushed: boolean; existingSbTicketId: string | null }> {
  const existingKeys = await getPushedListingDedupeKeys(eventId);
  const keyHit = dedupeKeys.some((k) => existingKeys.has(k));

  const fpRow = await prisma.sbListingPushLog.findFirst({
    where: { eventId, listingFingerprint, ok: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!keyHit && !fpRow) {
    return { alreadyPushed: false, existingSbTicketId: null };
  }

  const existingSbTicketId = await findExistingSbTicketIdForKeys(
    eventId,
    dedupeKeys,
    listingFingerprint,
  );
  return { alreadyPushed: true, existingSbTicketId };
}

/** @deprecated Use getPushedListingDedupeKeys */
export async function getSuccessfulListingFingerprints(eventId: number): Promise<Set<string>> {
  return getPushedListingDedupeKeys(eventId);
}

function isAlreadyPushed(keys: Set<string>, dedupeKeys: string[]): boolean {
  return dedupeKeys.some((k) => keys.has(k));
}

async function writePushLog(input: {
  eventId: number;
  matchId: string;
  offerIndex: number;
  listingFingerprint: string;
  trigger: "MANUAL" | "AUTO";
  ok: boolean;
  httpStatus?: number;
  sbTicketId?: string | null;
  fields: Record<string, string>;
  summary: MappedSeatsBrokersTicket["summary"];
  response?: unknown;
  error?: string;
}): Promise<number> {
  const row = await prisma.sbListingPushLog.create({
    data: {
      eventId: input.eventId,
      matchId: input.matchId,
      offerIndex: input.offerIndex,
      listingFingerprint: input.listingFingerprint,
      trigger: input.trigger,
      ok: input.ok,
      httpStatus: input.httpStatus ?? null,
      sbTicketId: input.sbTicketId ?? null,
      requestFields: input.fields as Prisma.InputJsonValue,
      requestSummary: input.summary as Prisma.InputJsonValue,
      responseBody:
        input.response === undefined
          ? undefined
          : (input.response as Prisma.InputJsonValue),
      errorMessage: input.error ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

/** Reserve this listing before calling SB so parallel pushes cannot duplicate it. */
async function tryClaimPushSlot(input: {
  eventId: number;
  matchId: string;
  offerIndex: number;
  listingFingerprint: string;
  trigger: "MANUAL" | "AUTO";
  fields: Record<string, string>;
  summary: MappedSeatsBrokersTicket["summary"];
}): Promise<{ logId: number } | null> {
  try {
    const row = await prisma.sbListingPushLog.create({
      data: {
        eventId: input.eventId,
        matchId: input.matchId,
        offerIndex: input.offerIndex,
        listingFingerprint: input.listingFingerprint,
        trigger: input.trigger,
        ok: true,
        requestFields: input.fields as Prisma.InputJsonValue,
        requestSummary: input.summary as Prisma.InputJsonValue,
        errorMessage: SB_PUSH_CLAIM_MARKER,
      },
      select: { id: true },
    });
    return { logId: row.id };
  } catch (e) {
    if (isPrismaUniqueConstraintError(e)) return null;
    throw e;
  }
}

async function finalizeClaimedPushLog(
  logId: number,
  input: {
    ok: boolean;
    httpStatus?: number;
    sbTicketId?: string | null;
    fields: Record<string, string>;
    summary: MappedSeatsBrokersTicket["summary"];
    response?: unknown;
    error?: string;
  },
): Promise<void> {
  await prisma.sbListingPushLog.update({
    where: { id: logId },
    data: {
      ok: input.ok,
      httpStatus: input.httpStatus ?? null,
      sbTicketId: input.sbTicketId ?? null,
      requestFields: input.fields as Prisma.InputJsonValue,
      requestSummary: input.summary as Prisma.InputJsonValue,
      responseBody:
        input.response === undefined
          ? undefined
          : (input.response as Prisma.InputJsonValue),
      errorMessage: input.ok ? null : (input.error ?? "Push failed."),
    },
    // Avoid RETURNING removal-tracking columns when migration is not applied yet.
    select: { id: true },
  });
}

export async function executeSbTicketPush(
  options: ExecuteSbPushOptions,
): Promise<{ created: number; failed: number; skipped: number; results: SbPushTicketResult[] }> {
  const {
    eventId,
    matchId,
    offers,
    tickets,
    config,
    dateToShip,
    catalog,
    trigger,
  } = options;

  const existing = await getPushedListingDedupeKeys(eventId);

  const results: SbPushTicketResult[] = [];
  let created = 0;
  let failed = 0;
  let skipped = 0;
  const seenInBatch = new Set<string>();

  for (const raw of tickets) {
    const enriched = enrichMappedTicketForPush(raw, offers, matchId, config, dateToShip, catalog);
    if (!enriched) continue;

    const offer = offers[enriched.offerIndex];
    const sourceSeats = sourceSeatsForPush(offer);
    const summary =
      sourceSeats.sourceSeatIds?.length || sourceSeats.sourceSeatNumbers?.length
        ? { ...enriched.summary, ...sourceSeats }
        : enriched.summary;
    const fingerprint = listingFingerprintForMappedTicket(offer, { ...enriched, summary });
    const dedupeKeys = listingDedupeKeysForMappedTicket(offer, { ...enriched, summary });

    if (isAlreadyPushed(existing, dedupeKeys) || dedupeKeys.some((k) => seenInBatch.has(k))) {
      skipped++;
      const duplicateOnSb = isAlreadyPushed(existing, dedupeKeys);
      const existingSbTicketId = duplicateOnSb
        ? await findExistingSbTicketIdForKeys(eventId, dedupeKeys, fingerprint)
        : null;
      results.push({
        offerIndex: enriched.offerIndex,
        ok: false,
        skipped: true,
        summary,
        listingFingerprint: fingerprint,
        sbTicketId: existingSbTicketId,
        error: duplicateOnSb
          ? "Already pushed to SeatsBrokers (duplicate listing)."
          : "Duplicate listing in this push batch.",
      });
      continue;
    }
    for (const k of dedupeKeys) seenInBatch.add(k);

    const fields: Record<string, string> = fieldsForSbTicketCreate({
      ...enriched.fields,
      match_id: enriched.fields.match_id?.trim() || matchId,
    });
    const category = fields.ticket_category?.trim() ?? "";

    if (!category || isLikelyFifaSnowflakeId(category)) {
      failed++;
      const error = category
        ? `ticket_category "${category}" is not a valid SeatsBrokers category id.`
        : "No SeatsBrokers ticket_category mapped for this offer.";
      const logId = await writePushLog({
        eventId,
        matchId,
        offerIndex: enriched.offerIndex,
        listingFingerprint: fingerprint,
        trigger,
        ok: false,
        fields,
        summary,
        error,
      });
      results.push({
        offerIndex: enriched.offerIndex,
        ok: false,
        fields,
        summary,
        error,
        listingFingerprint: fingerprint,
        logId,
      });
      continue;
    }

    const claim = await tryClaimPushSlot({
      eventId,
      matchId,
      offerIndex: enriched.offerIndex,
      listingFingerprint: fingerprint,
      trigger,
      fields,
      summary,
    });

    if (!claim) {
      skipped++;
      for (const k of dedupeKeys) existing.add(k);
      const existingSbTicketId = await findExistingSbTicketIdForKeys(eventId, dedupeKeys, fingerprint);
      results.push({
        offerIndex: enriched.offerIndex,
        ok: false,
        skipped: true,
        summary,
        listingFingerprint: fingerprint,
        sbTicketId: existingSbTicketId,
        error: "Already pushed to SeatsBrokers (duplicate listing).",
      });
      continue;
    }

    const res = await sbCreateTicket(fields, config);
    const sbTicketId = res.ok ? extractSbTicketId(res.data) : null;
    await finalizeClaimedPushLog(claim.logId, {
      ok: res.ok,
      httpStatus: res.status,
      sbTicketId,
      fields,
      summary,
      response: res.ok ? res.data : res.raw,
      error: res.ok ? undefined : res.error,
    });

    if (res.ok) {
      created++;
      for (const k of dedupeKeys) existing.add(k);
      results.push({
        offerIndex: enriched.offerIndex,
        ok: true,
        status: res.status,
        fields,
        summary,
        response: res.data,
        listingFingerprint: fingerprint,
        sbTicketId,
        logId: claim.logId,
      });
    } else {
      failed++;
      results.push({
        offerIndex: enriched.offerIndex,
        ok: false,
        status: res.status,
        fields,
        summary,
        error: res.error,
        response: res.raw,
        listingFingerprint: fingerprint,
        logId: claim.logId,
      });
    }
  }

  if (trigger === "MANUAL" && created > 0) {
    await registerEventForSbAutoPush(eventId);
  }

  return { created, failed, skipped, results };
}

export type PushSingleSbOfferResult =
  | {
      ok: true;
      sbTicketId: string | null;
      logId?: number;
      offerIndex: number;
      httpStatus?: number;
      listingFingerprint: string;
      fields?: Record<string, string>;
      summary: SbTicketPreviewPayload["summary"];
      response?: unknown;
    }
  | {
      ok: false;
      error: string;
      offerIndex?: number;
      skipped?: boolean;
      existingSbTicketId?: string | null;
      httpStatus?: number;
      listingFingerprint?: string;
      response?: unknown;
    };

/** Push one transformed offer by index (per-row UI). */
export async function pushSingleSbOfferForEvent(
  eventId: number,
  offerIndex: number,
  options?: { ticketType?: string | null; sourceSeatIds?: string[] },
): Promise<PushSingleSbOfferResult> {
  const configBase = getSeatsBrokersConfig();
  if (!configBase) {
    return { ok: false, error: "SeatsBrokers not configured." };
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
  const selectedOffer = offers[offerIndex];
  if (!selectedOffer) {
    return { ok: false, error: `Offer index ${offerIndex} is out of range.`, offerIndex };
  }

  const dateToShip = computeDateToShip(loaded.event.eventDate);
  const catalog = await loadSbMatchCatalogForOffers(matchId, offers, config);
  const mapped = mapOffersToSeatsBrokersCreateTickets(offers, matchId, config, dateToShip, catalog);
  const rawTicket = mapped.find((m) => m.offerIndex === offerIndex);
  if (!rawTicket) {
    return { ok: false, error: "This listing cannot be mapped for SeatsBrokers push.", offerIndex };
  }

  const sourceSeats = sourceSeatsForPush(selectedOffer, options?.sourceSeatIds);
  const ticket: typeof rawTicket = {
    ...rawTicket,
    summary: {
      ...rawTicket.summary,
      ...sourceSeats,
    },
  };

  const { created, failed, skipped, results } = await executeSbTicketPush({
    eventId,
    matchId,
    offers,
    tickets: [ticket],
    config,
    dateToShip,
    catalog,
    trigger: "MANUAL",
  });

  const row = results[0];
  if (!row) {
    return { ok: false, error: "Push did not run.", offerIndex };
  }
  if (row.skipped) {
    return {
      ok: false,
      error: row.error ?? "Already pushed to SeatsBrokers.",
      offerIndex,
      skipped: true,
      listingFingerprint: row.listingFingerprint,
      existingSbTicketId: row.sbTicketId ?? null,
    };
  }
  if (row.ok) {
    const preview = toSbTicketPreviewPayload({
      offerIndex: row.offerIndex,
      fields: row.fields ?? {},
      summary: row.summary,
    });
    return {
      ok: true,
      sbTicketId: row.sbTicketId ?? null,
      logId: row.logId,
      offerIndex,
      httpStatus: row.status,
      listingFingerprint: row.listingFingerprint,
      fields: preview.fields,
      summary: preview.summary,
      response: row.response,
    };
  }

  return {
    ok: false,
    error: row.error ?? `Push failed (${failed} failed, ${skipped} skipped, ${created} created).`,
    offerIndex,
    httpStatus: row.status,
    listingFingerprint: row.listingFingerprint,
    response: row.response,
  };
}

export type SbAutoPushRunResult = {
  ran: boolean;
  skippedReason?: string;
  created?: number;
  failed?: number;
  skipped?: number;
  attempted?: number;
};

/** Push new RESALE listings for an event (auto-push). */
export async function runSbAutoPushForEvent(eventId: number): Promise<SbAutoPushRunResult> {
  const enabled = await getSbAutoPushEnabled();
  if (!enabled) {
    return { ran: false, skippedReason: "auto_push_disabled" };
  }

  const registered = await isEventRegisteredForSbAutoPush(eventId);
  if (!registered) {
    return { ran: false, skippedReason: "event_never_pushed_manually" };
  }

  const configBase = getSeatsBrokersConfig();
  if (!configBase) {
    return { ran: false, skippedReason: "sb_not_configured" };
  }

  const ticketType = await getSbAutoPushTicketType();
  const config = configWithTicketType(configBase, ticketType);

  const loaded = await loadTransformedSeatOffersForEvent(eventId, {
    kind: SEATS_BROKERS_PUSH_INVENTORY_KIND,
    markupPercent: "persisted",
  });
  if (!loaded) {
    return { ran: false, skippedReason: "event_not_found" };
  }

  const matchId = loaded.event.sbEventId?.trim();
  if (!matchId) {
    return { ran: false, skippedReason: "no_sb_match_id" };
  }

  const offers = loaded.transform.offers.filter((o) => o.kind === SEATS_BROKERS_PUSH_INVENTORY_KIND);
  const dateToShip = computeDateToShip(loaded.event.eventDate);
  const catalog = await loadSbMatchCatalogForOffers(matchId, offers, config);
  const allMapped = mapOffersToSeatsBrokersCreateTickets(offers, matchId, config, dateToShip, catalog);

  const existing = await getPushedListingDedupeKeys(eventId);
  const toPush = allMapped.filter((m) => {
    const offer = offers[m.offerIndex];
    const dedupeKeys = listingDedupeKeysForMappedTicket(offer, m);
    return !isAlreadyPushed(existing, dedupeKeys);
  });

  if (toPush.length === 0) {
    return { ran: true, created: 0, failed: 0, attempted: 0 };
  }

  const { created, failed, skipped } = await executeSbTicketPush({
    eventId,
    matchId,
    offers,
    tickets: toPush,
    config,
    dateToShip,
    catalog,
    trigger: "AUTO",
  });

  if (created > 0) {
    await touchEventLastAutoPush(eventId);
  }

  return { ran: true, created, failed, skipped, attempted: toPush.length };
}

export type SbAutoPushBatchRunResult = {
  events: Array<{ eventId: number } & SbAutoPushRunResult>;
};

/** Run auto-push for every event registered after a prior manual push. */
export async function runSbAutoPushForAllRegisteredEvents(): Promise<SbAutoPushBatchRunResult> {
  const eventIds = await listRegisteredSbAutoPushEventIds();
  const events: SbAutoPushBatchRunResult["events"] = [];
  for (const eventId of eventIds) {
    events.push({ eventId, ...(await runSbAutoPushForEvent(eventId)) });
  }
  return { events };
}
