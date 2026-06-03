import { prisma } from "@/lib/prisma";

const SB_PUSH_CLAIM_MARKER = "__sb_push_claim__";

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

/** Load push logs for UI status; works before or after removal-tracking migration. */
export async function findSbListingPushLogsForStatus(
  eventId: number,
): Promise<SbListingPushLogStatusRow[]> {
  try {
    return await prisma.sbListingPushLog.findMany({
      where: {
        eventId,
        ok: true,
        NOT: { errorMessage: SB_PUSH_CLAIM_MARKER },
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
        NOT: { errorMessage: SB_PUSH_CLAIM_MARKER },
      },
      orderBy: { createdAt: "desc" },
      select: statusSelectBase,
    });
  }
}
