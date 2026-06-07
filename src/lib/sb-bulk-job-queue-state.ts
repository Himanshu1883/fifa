/** Client-safe bulk job snapshots and queue UI state (no DB / server imports). */

export type SbBulkPushJobSnapshot = {
  id: number;
  eventId: number;
  status: "running" | "complete" | "failed" | "cancelled";
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  lastError: string | null;
  label: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SbBulkDeleteJobSnapshot = {
  id: number;
  eventId: number;
  status: "running" | "complete" | "failed" | "cancelled";
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  lastError: string | null;
  label: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SbBulkJobQueueState = {
  running: boolean;
  cancelled: boolean;
  cancelling: boolean;
  current: number;
  total: number;
  label: string;
  succeeded: number;
  failed: number;
  lastError: string | null;
};

export function bulkPushJobToQueueState(job: SbBulkPushJobSnapshot): SbBulkJobQueueState {
  return {
    running: job.status === "running",
    cancelled: job.status === "cancelled",
    cancelling: job.status === "running" && job.label === "Cancelling…",
    current: job.current,
    total: job.total,
    label: job.label,
    succeeded: job.succeeded,
    failed: job.failed,
    lastError: job.lastError,
  };
}

export function bulkDeleteJobToQueueState(job: SbBulkDeleteJobSnapshot): SbBulkJobQueueState {
  return {
    running: job.status === "running",
    cancelled: job.status === "cancelled",
    cancelling: job.status === "running" && job.label === "Cancelling…",
    current: job.current,
    total: job.total,
    label: job.label,
    succeeded: job.succeeded,
    failed: job.failed,
    lastError: job.lastError,
  };
}
