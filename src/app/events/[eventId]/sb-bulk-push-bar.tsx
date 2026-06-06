"use client";

import { createPortal } from "react-dom";

export type SbBulkPushQueueState = {
  running: boolean;
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
  onSelectAllDeletable: () => void;
  onClear: () => void;
  onPush: () => void;
  onDelete: () => void;
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
}) {
  const { mode, queue } = props;
  const running = queue.running;
  const verb = mode === "push" ? "Push" : "Delete";

  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-zinc-100">
        {running
          ? `${verb === "Push" ? "Pushing" : "Deleting"} from SB… ${queue.current} / ${queue.total}`
          : `${verb} complete · ${queue.succeeded} succeeded · ${queue.failed} failed`}
      </p>
      <p className="truncate text-xs text-zinc-400">{queue.label}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            mode === "delete" ? "bg-rose-400" : "bg-[color:var(--ticketing-accent)]"
          }`}
          style={{ width: `${Math.round((queue.current / Math.max(queue.total, 1)) * 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-500">
        {queue.succeeded} succeeded · {queue.failed} failed
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
    onSelectAllDeletable,
    onClear,
    onPush,
    onDelete,
  } = props;

  const pushRunning = Boolean(pushQueue?.running);
  const deleteRunning = Boolean(deleteQueue?.running);
  const pushProgress = pushQueue && (pushRunning || (!deleteRunning && pushQueue.total > 0));
  const deleteProgress = deleteQueue && (deleteRunning || (!pushRunning && deleteQueue.total > 0));

  if (selectedCount === 0 && !pushProgress && !deleteProgress) return null;

  const allPushableSelected = pushableCount > 0 && selectedPushCount >= pushableCount;
  const allDeletableSelected = deletableCount > 0 && selectedDeletableCount >= deletableCount;
  const showSelection = selectedCount > 0 && !pushRunning && !deleteRunning;

  const bar = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4"
      role="region"
      aria-label="Bulk SB actions"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,black_12%)] px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08] backdrop-blur-md">
        {pushProgress && pushQueue ? <QueueProgress mode="push" queue={pushQueue} /> : null}
        {deleteProgress && deleteQueue ? <QueueProgress mode="delete" queue={deleteQueue} /> : null}

        {showSelection ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
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
              {!allPushableSelected && pushableCount > 0 ? (
                <>
                  <button
                    type="button"
                    className={`${btnGhost} inline-flex items-center gap-1.5`}
                    onClick={() => onSelectNPushable(pushableSelectCount)}
                    title={`Select first ${clampPushableSelectCount(pushableSelectCount, pushableCount)} pushable listing${pushableSelectCount === 1 ? "" : "s"}`}
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
              {!allDeletableSelected && deletableCount > 0 ? (
                <button type="button" className={btnGhost} onClick={onSelectAllDeletable}>
                  Select on SB ({deletableCount})
                </button>
              ) : null}
              <button type="button" className={btnGhost} onClick={onClear}>
                Clear
              </button>
              {selectedPushCount > 0 ? (
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
              {selectedDeletableCount > 0 ? (
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
