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

const catalogLogSelectFull = {
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
  inventoryRemovedAt: true,
  sbDeletedAt: true,
  sbDeleteError: true,
  sbDeleteHttpStatus: true,
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
  requestFields: unknown;
  requestSummary: unknown;
  responseBody: unknown;
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
