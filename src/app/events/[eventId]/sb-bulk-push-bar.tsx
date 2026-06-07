"use client";

import { createPortal } from "react-dom";

import { type SbCategoryNum } from "@/lib/sb-category";
import { SB_TICKET_TYPES, sbTicketTypeLabel } from "@/lib/sb-ticket-types";

const BULK_SELECT_CATEGORY_NUMS = [1, 2, 3, 4] as const satisfies readonly SbCategoryNum[];

export type SbBulkPushQueueState = {
  running: boolean;
  cancelled?: boolean;
  cancelling?: boolean;
  current: number;
  total: number;
  label: string;
  succeeded: number;
  failed: number;
  lastError: string | null;
};

const selectCompact =
  "rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

const inputCompact =
  "w-10 rounded border border-white/12 bg-black/25 px-1 py-0.5 text-center text-sm font-medium tabular-nums text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

function clampPushableSelectCount(n: number, pushableCount: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.floor(n)), Math.min(pushableCount, 999));
}

type Props = {
  selectedCount: number;
  pushableCount: number;
  selectedPushCount: number;
  deletableCount: number;
  selectedDeletableCount: number;
  omitBlockSelectedCount?: number;
  batchSelectSize: number;
  batchSelectSizes: readonly number[];
  onBatchSelectSizeChange: (size: number) => void;
  pushQueue: SbBulkPushQueueState | null;
  deleteQueue: SbBulkPushQueueState | null;
  sbConfigured: boolean;
  hasSbEventId: boolean;
  onSelectAllPushable: () => void;
  pushableSelectCount: number;
  onPushableSelectCountChange: (count: number) => void;
  onSelectNPushable: (count: number) => void;
  bulkSelectCategoryNums: ReadonlySet<SbCategoryNum>;
  onBulkSelectCategoryToggle: (num: SbCategoryNum) => void;
  onSelectNPushableByCategory: (count: number, categories: readonly SbCategoryNum[]) => void;
  onSelectAllDeletable: () => void;
  onClear: () => void;
  onPush: () => void;
  onDelete: () => void;
  onCancelPush?: () => void;
  onCancelDelete?: () => void;
  ticketTypeId: string;
  onTicketTypeChange: (typeId: string) => void;
};

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] disabled:opacity-50";

const btnDanger =
  "rounded-lg border border-rose-400/45 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 shadow-sm shadow-black/35 transition-[filter,background-color] hover:bg-rose-500/22 hover:brightness-[1.04] disabled:opacity-50";

const btnGhost =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50";

function QueueProgress(props: {
  mode: "push" | "delete";
  queue: SbBulkPushQueueState;
  onCancel?: () => void;
}) {
  const { mode, queue, onCancel } = props;
  const running = queue.running;
  const cancelled = Boolean(queue.cancelled);
  const cancelling = Boolean(queue.cancelling);
  const verb = mode === "push" ? "Push" : "Delete";
  const skipped = Math.max(0, queue.total - queue.current);

  const barColor = cancelled
    ? "bg-amber-400"
    : mode === "delete"
      ? "bg-rose-400"
      : "bg-[color:var(--ticketing-accent)]";

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-zinc-100">
          {cancelled
            ? `${verb} cancelled · ${queue.succeeded} succeeded · ${queue.failed} failed`
            : running
              ? `${verb === "Push" ? "Pushing" : "Deleting"} from SB… ${queue.current} / ${queue.total}`
              : `${verb} complete · ${queue.succeeded} succeeded · ${queue.failed} failed`}
        </p>
        {running && onCancel ? (
          <button
            type="button"
            className={`${btnGhost} shrink-0 px-2.5 py-1 text-xs disabled:opacity-50`}
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        ) : null}
      </div>
      <p className="truncate text-xs text-zinc-400">{queue.label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
          style={{ width: `${Math.round((queue.current / Math.max(queue.total, 1)) * 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-500">
        {queue.succeeded} succeeded · {queue.failed} failed
        {cancelled && skipped > 0 ? <span className="ml-1 text-amber-200/90">· {skipped} skipped</span> : null}
        {queue.lastError ? (
          <span className="ml-1 text-rose-300/90" title={queue.lastError}>
            · {queue.lastError}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function SbBulkPushBar(props: Props) {
  const {
    selectedCount,
    pushableCount,
    selectedPushCount,
    deletableCount,
    selectedDeletableCount,
    omitBlockSelectedCount = 0,
    batchSelectSize,
    batchSelectSizes,
    onBatchSelectSizeChange,
    pushQueue,
    deleteQueue,
    sbConfigured,
    hasSbEventId,
    onSelectAllPushable,
    pushableSelectCount,
    onPushableSelectCountChange,
    onSelectNPushable,
    bulkSelectCategoryNums,
    onBulkSelectCategoryToggle,
    onSelectNPushableByCategory,
    onSelectAllDeletable,
    onClear,
    onPush,
    onDelete,
    onCancelPush,
    onCancelDelete,
    ticketTypeId,
    onTicketTypeChange,
  } = props;

  const pushRunning = Boolean(pushQueue?.running);
  const deleteRunning = Boolean(deleteQueue?.running);
  const pushCancelled = Boolean(pushQueue?.cancelled);
  const deleteCancelled = Boolean(deleteQueue?.cancelled);
  const pushProgress =
    pushQueue &&
    (pushRunning || pushCancelled || (!deleteRunning && !deleteCancelled && pushQueue.total > 0));
  const deleteProgress =
    deleteQueue &&
    (deleteRunning || deleteCancelled || (!pushRunning && !pushCancelled && deleteQueue.total > 0));

  if (selectedCount === 0 && pushableCount === 0 && !pushProgress && !deleteProgress) return null;

  const allPushableSelected = pushableCount > 0 && selectedPushCount >= pushableCount;
  const allDeletableSelected = deletableCount > 0 && selectedDeletableCount >= deletableCount;
  const showActionTools = !pushRunning && !deleteRunning;
  const showSelectionSummary = selectedCount > 0 && showActionTools;
  const showPushableTools = pushableCount > 0 && showActionTools;
  const bulkCategorySelectCount = clampPushableSelectCount(pushableSelectCount, pushableCount);
  const bulkCategoryNums = BULK_SELECT_CATEGORY_NUMS.filter((num) => bulkSelectCategoryNums.has(num));

  const bar = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4"
      role="region"
      aria-label="Bulk SB actions"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,black_12%)] px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08] backdrop-blur-md">
        {pushProgress && pushQueue ? (
          <QueueProgress mode="push" queue={pushQueue} onCancel={onCancelPush} />
        ) : null}
        {deleteProgress && deleteQueue ? (
          <QueueProgress mode="delete" queue={deleteQueue} onCancel={onCancelDelete} />
        ) : null}

        {showActionTools && (showSelectionSummary || showPushableTools) ? (
          <div className="flex flex-col gap-2.5">
            {showSelectionSummary ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">
                  {selectedCount} listing{selectedCount === 1 ? "" : "s"} selected
                </p>
                <p className="text-[10px] text-zinc-500">
                  {selectedPushCount > 0 && selectedDeletableCount > 0
                    ? `${selectedPushCount} pushable · ${selectedDeletableCount} on SB`
                    : selectedPushCount > 0
                      ? "Queue pushes one listing at a time to SeatsBrokers"
                      : selectedDeletableCount > 0
                        ? "Queue deletes one listing at a time from SeatsBrokers"
                        : "Select pushable or on-SB listings"}
                  {omitBlockSelectedCount > 0 ? (
                    <span className="text-amber-200/90">
                      {" "}
                      · {omitBlockSelectedCount} omit ticket_block
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            {showActionTools && (showPushableTools || selectedPushCount > 0) ? (
              <label className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-zinc-500">
                <span className="whitespace-nowrap">
                  Ticket type: {sbTicketTypeLabel(ticketTypeId)} ({ticketTypeId})
                </span>
                <select
                  value={ticketTypeId}
                  onChange={(e) => onTicketTypeChange(e.target.value)}
                  className={selectCompact}
                  title="ticket_type sent on SB ticket/create"
                  aria-label="Ticket type for bulk push"
                >
                  {SB_TICKET_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.id})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {showPushableTools ? (
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex flex-wrap items-center rounded-xl bg-black/35 p-1 ring-1 ring-white/[0.10] shadow-inner shadow-black/35"
                  role="group"
                  aria-label="Bulk select by plain category"
                >
                  {BULK_SELECT_CATEGORY_NUMS.map((num) => {
                    const active = bulkSelectCategoryNums.has(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => onBulkSelectCategoryToggle(num)}
                        className={
                          active
                            ? "min-h-7 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2 text-[11px] font-semibold tabular-nums text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                            : "min-h-7 rounded-lg px-2 text-[11px] font-semibold tabular-nums text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                        }
                        aria-pressed={active}
                        aria-label={`Bulk select category ${num}${active ? " selected" : ""}`}
                        title="Plain Category only — not front row or wheelchair"
                      >
                        Cat {num}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={`${btnGhost} inline-flex items-center gap-1.5 disabled:opacity-40`}
                  disabled={bulkCategoryNums.length === 0}
                  onClick={() => onSelectNPushableByCategory(pushableSelectCount, bulkCategoryNums)}
                  title={
                    bulkCategoryNums.length === 0
                      ? "Select one or more categories first"
                      : `Select up to ${bulkCategorySelectCount} plain pushable listing${bulkCategorySelectCount === 1 ? "" : "s"} per selected category (${bulkCategoryNums.map((n) => `Cat ${n}`).join(", ")}) — excludes front row and wheelchair`
                  }
                >
                  Select
                  <input
                    type="number"
                    min={1}
                    max={Math.min(pushableCount, 999)}
                    value={pushableSelectCount}
                    onChange={(e) =>
                      onPushableSelectCountChange(
                        clampPushableSelectCount(Number(e.target.value), pushableCount),
                      )
                    }
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && bulkCategoryNums.length > 0) {
                        e.preventDefault();
                        onSelectNPushableByCategory(pushableSelectCount, bulkCategoryNums);
                      }
                    }}
                    className={inputCompact}
                    aria-label="Number of pushable listings to select per category"
                  />
                  by category
                </button>
                <span className="text-[10px] text-zinc-500" title="Count applies separately to each selected category">
                  {bulkCategorySelectCount} per cat · plain only
                </span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {showSelectionSummary ? (
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500">
                  <span className="whitespace-nowrap">Batch</span>
                  <select
                    value={batchSelectSize}
                    onChange={(e) => onBatchSelectSizeChange(Number(e.target.value))}
                    className={selectCompact}
                    title="Number of rows to select per checkbox click"
                    aria-label="Batch select size"
                  >
                    {batchSelectSizes.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!allPushableSelected && showPushableTools ? (
                <>
                  <button
                    type="button"
                    className={`${btnGhost} inline-flex items-center gap-1.5`}
                    onClick={() => onSelectNPushable(pushableSelectCount)}
                    title={`Select first ${bulkCategorySelectCount} pushable listing${pushableSelectCount === 1 ? "" : "s"}`}
                  >
                    Select
                    <input
                      type="number"
                      min={1}
                      max={Math.min(pushableCount, 999)}
                      value={pushableSelectCount}
                      onChange={(e) =>
                        onPushableSelectCountChange(
                          clampPushableSelectCount(Number(e.target.value), pushableCount),
                        )
                      }
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onSelectNPushable(pushableSelectCount);
                        }
                      }}
                      className={inputCompact}
                      aria-label="Number of pushable listings to select"
                    />
                    pushable
                  </button>
                  {pushableCount > pushableSelectCount ? (
                    <button type="button" className={btnGhost} onClick={onSelectAllPushable}>
                      All ({pushableCount})
                    </button>
                  ) : null}
                </>
              ) : null}
              {showSelectionSummary && !allDeletableSelected && deletableCount > 0 ? (
                <button type="button" className={btnGhost} onClick={onSelectAllDeletable}>
                  Select on SB ({deletableCount})
                </button>
              ) : null}
              {showSelectionSummary ? (
                <button type="button" className={btnGhost} onClick={onClear}>
                  Clear
                </button>
              ) : null}
              {showSelectionSummary && selectedPushCount > 0 ? (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={!sbConfigured || !hasSbEventId}
                  title={
                    !hasSbEventId
                      ? "Set SB match id on this event"
                      : !sbConfigured
                        ? "Set SEATS_BROKERS_API_KEY"
                        : undefined
                  }
                  onClick={onPush}
                >
                  Push {selectedPushCount} to SB
                </button>
              ) : null}
              {showSelectionSummary && selectedDeletableCount > 0 ? (
                <button
                  type="button"
                  className={btnDanger}
                  disabled={!sbConfigured || !hasSbEventId}
                  title={
                    !hasSbEventId
                      ? "Set SB match id on this event"
                      : !sbConfigured
                        ? "Set SEATS_BROKERS_API_KEY"
                        : undefined
                  }
                  onClick={onDelete}
                >
                  Delete {selectedDeletableCount} from SB
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(bar, document.body);
}
