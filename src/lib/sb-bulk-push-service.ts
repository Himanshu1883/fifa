import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { SbBulkPushJobSnapshot } from "@/lib/sb-bulk-job-queue-state";
import { resolveOfferForSeatIds } from "@/lib/sb-offer-match";
import {
  loadTransformedSeatOffersForEvent,
  SEATS_BROKERS_PUSH_INVENTORY_KIND,
} from "@/lib/event-seat-offers-service";
import { prisma } from "@/lib/prisma";
import { isSbRateLimitError } from "@/lib/seatsbrokers-errors";
import { pushSingleSbOfferForEvent } from "@/lib/seatsbrokers-push-service";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";
import { DEFAULT_SB_TICKET_TYPE_ID, parseSbTicketTypeId } from "@/lib/sb-ticket-types";

const THROTTLE_RETRY_WAIT_MS = 30_000;
const MAX_THROTTLE_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SbBulkPushJobItem = {
  seatIds: string[];
  omitTicketBlock?: boolean;
  ticketType?: string;
  blockName?: string;
  rowLabel?: string;
  seatSpan?: string;
  label?: string;
};

export type { SbBulkPushJobSnapshot } from "@/lib/sb-bulk-job-queue-state";
export { bulkPushJobToQueueState } from "@/lib/sb-bulk-job-queue-state";

const processingJobIds = new Set<number>();

function parseItems(raw: Prisma.JsonValue): SbBulkPushJobItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SbBulkPushJobItem => {
    return (
      typeof item === "object" &&
      item != null &&
      Array.isArray((item as SbBulkPushJobItem).seatIds) &&
      (item as SbBulkPushJobItem).seatIds.length > 0
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
}): SbBulkPushJobSnapshot {
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
              ? "Pushing…"
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

function isDuplicateOk(result: {
  skipped?: boolean;
  existingSbTicketId?: string | null;
  sbTicketId?: string | null;
}): boolean {
  return Boolean(result.skipped && (result.existingSbTicketId ?? result.sbTicketId));
}

export async function getBulkPushJobSnapshot(jobId: number): Promise<SbBulkPushJobSnapshot | null> {
  const job = await prisma.sbBulkPushJob.findUnique({ where: { id: jobId } });
  return job ? toSnapshot(job) : null;
}

export async function getActiveBulkPushJobForEvent(eventId: number): Promise<SbBulkPushJobSnapshot | null> {
  const job = await prisma.sbBulkPushJob.findFirst({
    where: { eventId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  return job ? toSnapshot(job) : null;
}

async function finalizeCancelledBulkPushJob(jobId: number): Promise<void> {
  const job = await prisma.sbBulkPushJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "RUNNING") return;
  await prisma.sbBulkPushJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      currentLabel: "Cancelled",
    },
  });
}

async function isBulkPushCancelRequested(jobId: number): Promise<boolean> {
  const job = await prisma.sbBulkPushJob.findUnique({
    where: { id: jobId },
    select: { cancelRequestedAt: true, status: true },
  });
  return Boolean(job?.cancelRequestedAt) || job?.status === "CANCELLED";
}

export async function cancelBulkPushJob(
  eventId: number,
  jobId: number,
): Promise<
  | { ok: true; job: SbBulkPushJobSnapshot }
  | { ok: false; error: string }
> {
  const job = await prisma.sbBulkPushJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job not found." };
  if (job.eventId !== eventId) return { ok: false, error: "Job does not belong to this event." };
  if (job.status === "CANCELLED") {
    return { ok: true, job: toSnapshot(job) };
  }
  if (job.status !== "RUNNING") {
    return { ok: false, error: "Job is not running." };
  }

  const updated = await prisma.sbBulkPushJob.update({
    where: { id: jobId },
    data: {
      cancelRequestedAt: job.cancelRequestedAt ?? new Date(),
      currentLabel: "Cancelling…",
    },
  });

  return { ok: true, job: toSnapshot(updated) };
}

export async function startBulkPushJob(
  eventId: number,
  items: SbBulkPushJobItem[],
  ticketType?: string | null,
): Promise<
  | { ok: true; job: SbBulkPushJobSnapshot; alreadyRunning?: false }
  | { ok: true; job: SbBulkPushJobSnapshot; alreadyRunning: true }
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

  const resolvedTicketType = parseSbTicketTypeId(ticketType ?? DEFAULT_SB_TICKET_TYPE_ID);

  const normalized = items
    .map((item) => ({
      seatIds: item.seatIds.map((s) => s.trim()).filter(Boolean),
      omitTicketBlock: Boolean(item.omitTicketBlock),
      ticketType: parseSbTicketTypeId(item.ticketType ?? resolvedTicketType),
      blockName: item.blockName ?? "",
      rowLabel: item.rowLabel ?? "",
      seatSpan: item.seatSpan ?? "",
      label: item.label ?? item.seatIds.join(", "),
    }))
    .filter((item) => item.seatIds.length > 0);

  if (normalized.length === 0) {
    return { ok: false, error: "No pushable listings selected." };
  }

  const existing = await prisma.sbBulkPushJob.findFirst({
    where: { eventId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { ok: true, job: toSnapshot(existing), alreadyRunning: true };
  }

  const job = await prisma.sbBulkPushJob.create({
    data: {
      eventId,
      status: "RUNNING",
      items: normalized as unknown as Prisma.InputJsonValue,
      total: normalized.length,
      current: 0,
      currentLabel: "Starting…",
    },
  });

  void drainBulkPushJob(job.id).catch((e) => {
    console.error("[sb-bulk-push] background processing failed", e);
  });

  return { ok: true, job: toSnapshot(job) };
}

/** Process at most one queued listing. Returns true while the job still has work. */
export async function processBulkPushJobStep(jobId: number): Promise<boolean> {
  if (processingJobIds.has(jobId)) return false;
  processingJobIds.add(jobId);

  try {
    const job = await prisma.sbBulkPushJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "RUNNING") return false;
    if (job.cancelRequestedAt) {
      await finalizeCancelledBulkPushJob(jobId);
      return false;
    }

    const items = parseItems(job.items);
    if (items.length === 0) {
      await prisma.sbBulkPushJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          lastError: "Bulk push job has no items.",
          currentLabel: "Queue failed",
        },
      });
      return false;
    }

    const index = job.current;
    if (index >= items.length) {
      await prisma.sbBulkPushJob.update({
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
    await prisma.sbBulkPushJob.update({
      where: { id: jobId },
      data: {
        current: index + 1,
        currentLabel: item.label || `${item.blockName} · R${item.rowLabel} · ${item.seatSpan}`,
      },
    });

    let succeeded = job.succeeded;
    let failed = job.failed;
    let lastError = job.lastError;

    let itemDone = false;
    let throttleRetries = 0;

    while (!itemDone) {
      if (await isBulkPushCancelRequested(jobId)) {
        await finalizeCancelledBulkPushJob(jobId);
        return false;
      }

      try {
        const loaded = await loadTransformedSeatOffersForEvent(job.eventId, {
          kind: SEATS_BROKERS_PUSH_INVENTORY_KIND,
          markupPercent: "persisted",
        });
        if (!loaded) {
          failed++;
          lastError = "Event not found.";
          itemDone = true;
        } else {
          const offers = loaded.transform.offers.filter((o) => o.kind === SEATS_BROKERS_PUSH_INVENTORY_KIND);
          const resolved = resolveOfferForSeatIds(item.seatIds, offers);
          if (!resolved) {
            failed++;
            lastError = "No matching offer for these seats.";
            itemDone = true;
          } else {
            const result = await pushSingleSbOfferForEvent(job.eventId, resolved.offerIndex, {
              sourceSeatIds: item.seatIds,
              omitTicketBlock: item.omitTicketBlock,
              ticketType: item.ticketType,
            });
            if (result.ok || isDuplicateOk(result)) {
              succeeded++;
              lastError = null;
              itemDone = true;
            } else if (
              isSbRateLimitError(result.error, result.httpStatus) &&
              throttleRetries < MAX_THROTTLE_RETRIES
            ) {
              throttleRetries++;
              lastError = "Rate limited — retrying in 30s…";
              await prisma.sbBulkPushJob.update({
                where: { id: jobId },
                data: { lastError },
              });
              await sleep(THROTTLE_RETRY_WAIT_MS);
              if (await isBulkPushCancelRequested(jobId)) {
                await finalizeCancelledBulkPushJob(jobId);
                return false;
              }
            } else {
              failed++;
              lastError = result.error ?? "Push failed.";
              itemDone = true;
            }
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (isSbRateLimitError(message) && throttleRetries < MAX_THROTTLE_RETRIES) {
          throttleRetries++;
          lastError = "Rate limited — retrying in 30s…";
          await prisma.sbBulkPushJob.update({
            where: { id: jobId },
            data: { lastError },
          });
          await sleep(THROTTLE_RETRY_WAIT_MS);
          if (await isBulkPushCancelRequested(jobId)) {
            await finalizeCancelledBulkPushJob(jobId);
            return false;
          }
        } else {
          failed++;
          lastError = message;
          itemDone = true;
        }
      }
    }

    const finished = index + 1 >= items.length;
    await prisma.sbBulkPushJob.update({
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

export async function drainBulkPushJob(jobId: number): Promise<void> {
  let idleRetries = 0;
  while (idleRetries < 120) {
    const job = await prisma.sbBulkPushJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "RUNNING" || job.current >= job.total) break;

    if (processingJobIds.has(jobId)) {
      idleRetries++;
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    idleRetries = 0;
    const more = await processBulkPushJobStep(jobId);
    if (!more) break;
  }
}

/** Advance one step when polled; safe to call repeatedly. */
export async function processBulkPushJob(jobId: number): Promise<void> {
  await processBulkPushJobStep(jobId);
}

