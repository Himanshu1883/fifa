"use client";

export type SbBulkPushQueueState = {
  running: boolean;
  current: number;
  total: number;
  label: string;
  succeeded: number;
  failed: number;
  lastError: string | null;
};

type Props = {
  selectedCount: number;
  pushableCount: number;
  omitBlockSelectedCount?: number;
  queue: SbBulkPushQueueState | null;
  sbConfigured: boolean;
  hasSbEventId: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onPush: () => void;
};

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] disabled:opacity-50";

const btnGhost =
  "rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50";

export function SbBulkPushBar(props: Props) {
  const {
    selectedCount,
    pushableCount,
    omitBlockSelectedCount = 0,
    queue,
    sbConfigured,
    hasSbEventId,
    onSelectAll,
    onClear,
    onPush,
  } = props;

  if (selectedCount === 0 && !queue?.running) return null;

  const running = Boolean(queue?.running);
  const allSelected = pushableCount > 0 && selectedCount >= pushableCount;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4"
      role="region"
      aria-label="Bulk push to SeatsBrokers"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-white/[0.12] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,black_12%)] px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.08] backdrop-blur-md">
        {running && queue ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-zinc-100">
              Pushing to SB… {queue.current} / {queue.total}
            </p>
            <p className="truncate text-xs text-zinc-400">{queue.label}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-[color:var(--ticketing-accent)] transition-[width] duration-300"
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
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">
                {selectedCount} listing{selectedCount === 1 ? "" : "s"} selected
              </p>
              <p className="text-[10px] text-zinc-500">
                Queue pushes one listing at a time to SeatsBrokers
                {omitBlockSelectedCount > 0 ? (
                  <span className="text-amber-200/90">
                    {" "}
                    · {omitBlockSelectedCount} omit ticket_block
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!allSelected ? (
                <button type="button" className={btnGhost} onClick={onSelectAll}>
                  Select all ({pushableCount})
                </button>
              ) : null}
              <button type="button" className={btnGhost} onClick={onClear}>
                Clear
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!sbConfigured || !hasSbEventId || selectedCount === 0}
                title={
                  !hasSbEventId
                    ? "Set SB match id on this event"
                    : !sbConfigured
                      ? "Set SEATS_BROKERS_API_KEY"
                      : undefined
                }
                onClick={onPush}
              >
                Push {selectedCount} to SB
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
