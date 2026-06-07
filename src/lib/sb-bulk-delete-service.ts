import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { SbBulkDeleteJobSnapshot } from "@/lib/sb-bulk-job-queue-state";
import { deleteSbListingForEvent } from "@/lib/sb-listing-delete";
import { prisma } from "@/lib/prisma";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export type SbBulkDeleteJobItem = {
  sbTicketId: string;
  logId?: number;
  seatIds?: string[];
  blockName?: string;
  rowLabel?: string;
  seatSpan?: string;
  label?: string;
};

export type { SbBulkDeleteJobSnapshot } from "@/lib/sb-bulk-job-queue-state";
export { bulkDeleteJobToQueueState } from "@/lib/sb-bulk-job-queue-state";

const processingJobIds = new Set<number>();

function parseItems(raw: Prisma.JsonValue): SbBulkDeleteJobItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SbBulkDeleteJobItem => {
    return (
      typeof item === "object" &&
      item != null &&
      typeof (item as SbBulkDeleteJobItem).sbTicketId === "string" &&
      (item as SbBulkDeleteJobItem).sbTicketId.trim().length > 0
    );
  });
}

function toSnapshot(job: {
  id: number;
  eventId: number;
  status: "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  lastError: string | null;
  currentLabel: string | null;
  cancelRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): SbBulkDeleteJobSnapshot {
  const status =
    job.status === "RUNNING"
      ? "running"
      : job.status === "COMPLETE"
        ? "complete"
        : job.status === "CANCELLED"
          ? "cancelled"
          : "failed";
  const label =
    job.currentLabel ??
    (status === "cancelled"
      ? "Cancelled"
      : status === "complete"
        ? "Queue complete"
        : status === "failed"
          ? "Queue failed"
          : job.cancelRequestedAt
            ? "Cancelling…"
            : job.current > 0
              ? "Deleting…"
              : "Starting…");

  return {
    id: job.id,
    eventId: job.eventId,
    status,
    current: job.current,
    total: job.total,
    succeeded: job.succeeded,
    failed: job.failed,
    lastError: job.lastError,
    label,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export async function getBulkDeleteJobSnapshot(jobId: number): Promise<SbBulkDeleteJobSnapshot | null> {
  const job = await prisma.sbBulkDeleteJob.findUnique({ where: { id: jobId } });
  return job ? toSnapshot(job) : null;
}

export async function getActiveBulkDeleteJobForEvent(
  eventId: number,
): Promise<SbBulkDeleteJobSnapshot | null> {
  const job = await prisma.sbBulkDeleteJob.findFirst({
    where: { eventId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  return job ? toSnapshot(job) : null;
}

async function finalizeCancelledBulkDeleteJob(jobId: number): Promise<void> {
  const job = await prisma.sbBulkDeleteJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "RUNNING") return;
  await prisma.sbBulkDeleteJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      currentLabel: "Cancelled",
    },
  });
}

async function isBulkDeleteCancelRequested(jobId: number): Promise<boolean> {
  const job = await prisma.sbBulkDeleteJob.findUnique({
    where: { id: jobId },
    select: { cancelRequestedAt: true, status: true },
  });
  return Boolean(job?.cancelRequestedAt) || job?.status === "CANCELLED";
}

export async function cancelBulkDeleteJob(
  eventId: number,
  jobId: number,
): Promise<
  | { ok: true; job: SbBulkDeleteJobSnapshot }
  | { ok: false; error: string }
> {
  const job = await prisma.sbBulkDeleteJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job not found." };
  if (job.eventId !== eventId) return { ok: false, error: "Job does not belong to this event." };
  if (job.status === "CANCELLED") {
    return { ok: true, job: toSnapshot(job) };
  }
  if (job.status !== "RUNNING") {
    return { ok: false, error: "Job is not running." };
  }

  const updated = await prisma.sbBulkDeleteJob.update({
    where: { id: jobId },
    data: {
      cancelRequestedAt: job.cancelRequestedAt ?? new Date(),
      currentLabel: "Cancelling…",
    },
  });

  return { ok: true, job: toSnapshot(updated) };
}

export async function startBulkDeleteJob(
  eventId: number,
  items: SbBulkDeleteJobItem[],
): Promise<
  | { ok: true; job: SbBulkDeleteJobSnapshot; alreadyRunning?: false }
  | { ok: true; job: SbBulkDeleteJobSnapshot; alreadyRunning: true }
  | { ok: false; error: string }
> {
  if (!getSeatsBrokersConfig()) {
    return { ok: false, error: "SeatsBrokers not configured. Set SEATS_BROKERS_API_KEY in .env.local." };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, sbEventId: true },
  });
  if (!event) return { ok: false, error: "Event not found." };
  if (!event.sbEventId?.trim()) {
    return { ok: false, error: "Event has no SB match id. Add it via Add SB ID first." };
  }

  const normalized = items
    .map((item) => ({
      sbTicketId: item.sbTicketId.trim(),
      logId: item.logId && item.logId > 0 ? item.logId : undefined,
      seatIds: item.seatIds?.map((s) => s.trim()).filter(Boolean),
      blockName: item.blockName ?? "",
      rowLabel: item.rowLabel ?? "",
      seatSpan: item.seatSpan ?? "",
      label: item.label ?? item.sbTicketId,
    }))
    .filter((item) => item.sbTicketId.length > 0);

  if (normalized.length === 0) {
    return { ok: false, error: "No deletable listings selected." };
  }

  const existing = await prisma.sbBulkDeleteJob.findFirst({
    where: { eventId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { ok: true, job: toSnapshot(existing), alreadyRunning: true };
  }

  const job = await prisma.sbBulkDeleteJob.create({
    data: {
      eventId,
      status: "RUNNING",
      items: normalized as unknown as Prisma.InputJsonValue,
      total: normalized.length,
      current: 0,
      currentLabel: "Starting…",
    },
  });

  void drainBulkDeleteJob(job.id).catch((e) => {
    console.error("[sb-bulk-delete] background processing failed", e);
  });

  return { ok: true, job: toSnapshot(job) };
}

/** Process at most one queued listing. Returns true while the job still has work. */
export async function processBulkDeleteJobStep(jobId: number): Promise<boolean> {
  if (processingJobIds.has(jobId)) return false;
  processingJobIds.add(jobId);

  try {
    const job = await prisma.sbBulkDeleteJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "RUNNING") return false;
    if (job.cancelRequestedAt) {
      await finalizeCancelledBulkDeleteJob(jobId);
      return false;
    }

    const items = parseItems(job.items);
    if (items.length === 0) {
      await prisma.sbBulkDeleteJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          lastError: "Bulk delete job has no items.",
          currentLabel: "Queue failed",
        },
      });
      return false;
    }

    const index = job.current;
    if (index >= items.length) {
      await prisma.sbBulkDeleteJob.update({
        where: { id: jobId },
        data: {
          status: job.failed > 0 && job.succeeded === 0 ? "FAILED" : "COMPLETE",
          completedAt: new Date(),
          current: items.length,
          currentLabel: "Queue complete",
        },
      });
      return false;
    }

    const item = items[index]!;
    await prisma.sbBulkDeleteJob.update({
      where: { id: jobId },
      data: {
        current: index + 1,
        currentLabel: item.label || item.sbTicketId,
      },
    });

    let succeeded = job.succeeded;
    let failed = job.failed;
    let lastError = job.lastError;

    if (await isBulkDeleteCancelRequested(jobId)) {
      await finalizeCancelledBulkDeleteJob(jobId);
      return false;
    }

    try {
      const event = await prisma.event.findUnique({
        where: { id: job.eventId },
        select: { sbEventId: true },
      });
      const result = await deleteSbListingForEvent(job.eventId, {
        logId: item.logId,
        sbTicketId: item.sbTicketId,
        matchId: event?.sbEventId?.trim() ?? undefined,
        markInventoryRemoved: true,
        rowMeta: {
          blockName: item.blockName ?? null,
          row: item.rowLabel ?? null,
          seatIds: item.seatIds,
        },
      });
      if (result.ok) {
        succeeded++;
      } else {
        failed++;
        lastError = result.error ?? "Delete failed.";
      }
    } catch (e) {
      failed++;
      lastError = e instanceof Error ? e.message : String(e);
    }

    const finished = index + 1 >= items.length;
    await prisma.sbBulkDeleteJob.update({
      where: { id: jobId },
      data: {
        succeeded,
        failed,
        lastError,
        ...(finished
          ? {
              status: failed > 0 && succeeded === 0 ? "FAILED" : "COMPLETE",
              completedAt: new Date(),
              currentLabel: "Queue complete",
            }
          : {}),
      },
    });

    return !finished;
  } finally {
    processingJobIds.delete(jobId);
  }
}

export async function drainBulkDeleteJob(jobId: number): Promise<void> {
  let idleRetries = 0;
  while (idleRetries < 120) {
    const job = await prisma.sbBulkDeleteJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "RUNNING" || job.current >= job.total) break;

    if (processingJobIds.has(jobId)) {
      idleRetries++;
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    idleRetries = 0;
    const more = await processBulkDeleteJobStep(jobId);
    if (!more) break;
  }
}

/** Advance one step when polled; safe to call repeatedly. */
export async function processBulkDeleteJob(jobId: number): Promise<void> {
  await processBulkDeleteJobStep(jobId);
}

