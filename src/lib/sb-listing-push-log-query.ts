import { prisma } from "@/lib/prisma";

const SB_PUSH_CLAIM_MARKER = "__sb_push_claim__";

/**
 * Prisma `NOT: { errorMessage: X }` excludes NULL in PostgreSQL, which drops every
 * successful push (error_message is null after finalize). Always OR in null.
 */
export function sbPushLogExcludingClaimWhere() {
  return {
    OR: [
      { errorMessage: null },
      { errorMessage: { not: SB_PUSH_CLAIM_MARKER } },
    ],
  };
}

/** Push logs that still occupy a live SB listing slot (excludes deleted-on-SB rows). */
export function sbPushLogActiveOnSbWhere() {
  return { sbDeletedAt: null };
}

/** True when DB is missing sb_listing_push_logs removal-tracking columns (migration not applied). */
export function isSbListingRemovalMigrationMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("inventory_removed_at") ||
    msg.includes("sb_deleted_at") ||
    msg.includes("sb_delete_http_status") ||
    msg.includes("sb_delete_error")
  );
}

const statusSelectBase = {
  id: true,
  sbTicketId: true,
  listingFingerprint: true,
  requestSummary: true,
  createdAt: true,
} as const;

const statusSelectWithRemoval = {
  ...statusSelectBase,
  inventoryRemovedAt: true,
  sbDeletedAt: true,
  sbDeleteError: true,
} as const;

export type SbListingPushLogStatusRow = {
  id: number;
  sbTicketId: string | null;
  listingFingerprint: string;
  requestSummary: unknown;
  createdAt: Date;
  inventoryRemovedAt?: Date | null;
  sbDeletedAt?: Date | null;
  sbDeleteError?: string | null;
};

/** Accordion table: skip large JSON blobs (loaded on demand for detail modal). */
const catalogLogSelectTable = {
  id: true,
  eventId: true,
  matchId: true,
  trigger: true,
  sbTicketId: true,
  requestSummary: true,
  httpStatus: true,
  errorMessage: true,
  offerIndex: true,
  listingFingerprint: true,
  createdAt: true,
  inventoryRemovedAt: true,
  sbDeletedAt: true,
  sbDeleteError: true,
  sbDeleteHttpStatus: true,
} as const;

const catalogLogSelectFull = {
  ...catalogLogSelectTable,
  requestFields: true,
  responseBody: true,
} as const;

const catalogLogSelectBase = {
  id: true,
  eventId: true,
  matchId: true,
  trigger: true,
  sbTicketId: true,
  requestFields: true,
  requestSummary: true,
  responseBody: true,
  httpStatus: true,
  errorMessage: true,
  offerIndex: true,
  listingFingerprint: true,
  createdAt: true,
} as const;

export type SbListingPushLogCatalogRow = {
  id: number;
  eventId: number;
  matchId: string;
  trigger: string;
  sbTicketId: string | null;
  requestFields?: unknown;
  requestSummary: unknown;
  responseBody?: unknown;
  httpStatus: number | null;
  errorMessage: string | null;
  offerIndex: number | null;
  listingFingerprint: string;
  createdAt: Date;
  inventoryRemovedAt?: Date | null;
  sbDeletedAt?: Date | null;
  sbDeleteError?: string | null;
  sbDeleteHttpStatus?: number | null;
};

/** Successful push logs for one event (catalog detail / lazy accordion). */
export async function findSbListingPushLogsForCatalogByEvent(
  eventId: number,
): Promise<SbListingPushLogCatalogRow[]> {
  const where = {
    eventId,
    ok: true,
    ...sbPushLogExcludingClaimWhere(),
  };

  try {
    return await prisma.sbListingPushLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: catalogLogSelectTable,
    });
  } catch (e) {
    if (!isSbListingRemovalMigrationMissingError(e)) throw e;
    const { inventoryRemovedAt: _i, sbDeletedAt: _s, sbDeleteError: _e, sbDeleteHttpStatus: _h, ...base } =
      catalogLogSelectTable;
    return await prisma.sbListingPushLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: base,
    });
  }
}

/** Full push log payload for the catalog detail modal. */
export async function findSbListingPushLogDetailById(
  logId: number,
): Promise<SbListingPushLogCatalogRow | null> {
  const where = {
    id: logId,
    ok: true,
    ...sbPushLogExcludingClaimWhere(),
  };

  try {
    return await prisma.sbListingPushLog.findFirst({
      where,
      select: catalogLogSelectFull,
    });
  } catch (e) {
    if (!isSbListingRemovalMigrationMissingError(e)) throw e;
    return await prisma.sbListingPushLog.findFirst({
      where,
      select: catalogLogSelectBase,
    });
  }
}

/** All successful SB push logs (every event) for the global listings catalog. */
export async function findAllSbListingPushLogsForCatalog(): Promise<SbListingPushLogCatalogRow[]> {
  const where = {
    ok: true,
    ...sbPushLogExcludingClaimWhere(),
  };

  try {
    return await prisma.sbListingPushLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: catalogLogSelectFull,
    });
  } catch (e) {
    if (!isSbListingRemovalMigrationMissingError(e)) throw e;
    return await prisma.sbListingPushLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: catalogLogSelectBase,
    });
  }
}

/** Load push logs for UI status; works before or after removal-tracking migration. */
export async function findSbListingPushLogsForStatus(
  eventId: number,
): Promise<SbListingPushLogStatusRow[]> {
  try {
    return await prisma.sbListingPushLog.findMany({
      where: {
        eventId,
        ok: true,
        ...sbPushLogExcludingClaimWhere(),
      },
      orderBy: { createdAt: "desc" },
      select: statusSelectWithRemoval,
    });
  } catch (e) {
    if (!isSbListingRemovalMigrationMissingError(e)) throw e;
    return await prisma.sbListingPushLog.findMany({
      where: {
        eventId,
        ok: true,
        ...sbPushLogExcludingClaimWhere(),
      },
      orderBy: { createdAt: "desc" },
      select: statusSelectBase,
    });
  }
}
