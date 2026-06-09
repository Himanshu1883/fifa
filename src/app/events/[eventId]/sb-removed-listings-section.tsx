"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SbListingStatusEntry } from "@/lib/sb-listing-status";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusLabel(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") return "Deleted from SB";
  if (entry.status === "delete_failed") return "Delete failed on SB";
  if (entry.status === "removed") return "Removing from SB…";
  return "Removed";
}

function rowShell(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") {
    return "border-l-4 border-rose-400/70 bg-rose-950/35 ring-1 ring-rose-500/25";
  }
  if (entry.status === "delete_failed") {
    return "border-l-4 border-rose-400/70 bg-rose-500/10 ring-1 ring-rose-500/20";
  }
  return "border-l-4 border-amber-400/60 bg-amber-500/8 ring-1 ring-amber-500/15";
}

function badgeClass(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") {
    return "inline-flex rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-50 shadow-sm shadow-black/30";
  }
  if (entry.status === "delete_failed") {
    return "inline-flex rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-50";
  }
  return "inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100";
}

function RemovedListingsBody({ entries }: { entries: SbListingStatusEntry[] }) {
  const deletedCount = entries.filter((e) => e.status === "deleted").length;
  const failedCount = entries.filter((e) => e.status === "delete_failed").length;
  const pendingCount = entries.length - deletedCount - failedCount;

  const sorted = [...entries].sort((a, b) => {
    const order = { deleted: 0, delete_failed: 1, removed: 2, pushed: 3 };
    return order[a.status] - order[b.status];
  });

  return (
    <>
      <div className="border-b border-zinc-500/25 bg-zinc-500/5 px-4 py-3 sm:px-5">
        <p className="text-sm text-zinc-200">
          These were pushed to SeatsBrokers but no longer appear in resale inventory. The app deletes
          them on SB automatically when the next scrape syncs.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {deletedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-rose-100">
              <span className="size-1.5 rounded-full bg-rose-300" aria-hidden />
              {deletedCount} deleted on SB
            </span>
          ) : null}
          {pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden />
              {pendingCount} pending
            </span>
          ) : null}
          {failedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/14 px-2.5 py-0.5 text-[11px] font-semibold text-rose-100">
              {failedCount} delete failed
            </span>
          ) : null}
        </div>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {sorted.map((e) => (
          <li
            key={e.logId}
            className={`flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${rowShell(e)}`}
          >
            <div className={`min-w-0 space-y-0.5 ${e.status === "deleted" ? "opacity-90" : ""}`}>
              <p
                className={`text-sm font-medium ${e.status === "deleted" ? "text-rose-200/80 line-through decoration-rose-400/60" : "text-zinc-100"}`}
              >
                {e.blockName ?? "Block"}{" "}
                {e.row ? (
                  <span className="font-normal text-zinc-500">
                    · row <span className="font-mono text-zinc-400">{e.row}</span>
                  </span>
                ) : null}
              </p>
              {e.seatNumbers.length > 0 ? (
                <p
                  className={`font-mono text-xs ${e.status === "deleted" ? "text-rose-300/55 line-through" : "text-zinc-500"}`}
                >
                  Seats {e.seatNumbers.join(", ")}
                </p>
              ) : null}
              {e.status === "delete_failed" && e.sbDeleteError ? (
                <p className="text-[11px] text-rose-300/90">{e.sbDeleteError}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
              <span className={badgeClass(e)}>{statusLabel(e)}</span>
              {e.sbTicketId ? (
                <code
                  className={`font-mono text-[11px] ${e.status === "deleted" ? "text-rose-300/70" : "text-zinc-400"}`}
                  title="Former SB listing id"
                >
                  SB id {e.sbTicketId}
                </code>
              ) : null}
              {e.sbDeletedAt ? (
                <span className="text-[10px] text-zinc-600">
                  {new Date(e.sbDeletedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SbRemovedListingsSection(props: { eventId: number; removedCount: number }) {
  const { eventId, removedCount } = props;
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<SbListingStatusEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastFetchedCountRef = useRef(0);

  const loadRemoved = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/sb-listing-status?removedOnly=1`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; removed?: SbListingStatusEntry[]; error?: string };
      if (res.ok && json.ok !== false) {
        setEntries(json.removed ?? []);
        setLoaded(true);
        lastFetchedCountRef.current = json.removed?.length ?? 0;
      } else {
        setLoadError(json.error ?? "Could not load removed listings.");
      }
    } catch {
      setLoadError("Could not load removed listings.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const handleToggle = useCallback(() => {
    setExpanded((open) => {
      const next = !open;
      if (next && !loaded && !loading) void loadRemoved();
      return next;
    });
  }, [loadRemoved, loaded, loading]);

  useEffect(() => {
    if (!expanded || !loaded || removedCount === lastFetchedCountRef.current) return;
    void loadRemoved();
  }, [expanded, loaded, loadRemoved, removedCount]);

  if (removedCount <= 0) return null;

  return (
    <div
      className="overflow-hidden rounded-xl border border-zinc-500/30 bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,#3f3f46_12%)] shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65)] ring-1 ring-zinc-500/20"
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:px-5"
      >
        <Chevron open={expanded} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Gone from latest scrape
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-100">
            {removedCount} listing{removedCount === 1 ? "" : "s"} no longer in resale inventory
          </p>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full border border-zinc-500/35 bg-zinc-500/15 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200">
          {removedCount}
        </span>
      </button>

      {expanded ? (
        <div id={panelId} role="region" aria-label="Listings removed from latest scrape">
          {loading ? (
            <div
              className="flex items-center justify-center gap-2 border-t border-zinc-500/25 px-4 py-10 text-sm text-zinc-400"
              role="status"
            >
              <span
                className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300"
                aria-hidden
              />
              Loading removed listings…
            </div>
          ) : loadError ? (
            <div className="border-t border-zinc-500/25 px-4 py-6 text-center sm:px-5">
              <p className="text-sm text-rose-200/90">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadRemoved()}
                className="mt-3 min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.04]"
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <p className="border-t border-zinc-500/25 px-4 py-8 text-center text-sm text-zinc-500 sm:px-5" role="status">
              No removed listings found.
            </p>
          ) : (
            <RemovedListingsBody entries={entries} />
          )}
        </div>
      ) : null}
    </div>
  );
}
