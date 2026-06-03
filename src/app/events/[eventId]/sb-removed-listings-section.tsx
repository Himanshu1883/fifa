"use client";

import type { SbListingStatusEntry } from "@/lib/sb-listing-status";

function statusLabel(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") return "Deleted from SB";
  if (entry.status === "delete_failed") return "Delete failed on SB";
  if (entry.status === "removed") return "Removing from SB…";
  return "Removed";
}

function rowShell(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") {
    return "border-l-4 border-zinc-400/70 bg-zinc-500/10 ring-1 ring-zinc-500/25";
  }
  if (entry.status === "delete_failed") {
    return "border-l-4 border-rose-400/70 bg-rose-500/10 ring-1 ring-rose-500/20";
  }
  return "border-l-4 border-amber-400/60 bg-amber-500/8 ring-1 ring-amber-500/15";
}

function badgeClass(entry: SbListingStatusEntry): string {
  if (entry.status === "deleted") {
    return "inline-flex rounded-full border border-zinc-400/50 bg-zinc-600/35 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-100 shadow-sm shadow-black/30";
  }
  if (entry.status === "delete_failed") {
    return "inline-flex rounded-full border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-50";
  }
  return "inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100";
}

export function SbRemovedListingsSection(props: { entries: SbListingStatusEntry[] }) {
  const { entries } = props;
  if (entries.length === 0) return null;

  const deletedCount = entries.filter((e) => e.status === "deleted").length;
  const failedCount = entries.filter((e) => e.status === "delete_failed").length;
  const pendingCount = entries.length - deletedCount - failedCount;

  const sorted = [...entries].sort((a, b) => {
    const order = { deleted: 0, delete_failed: 1, removed: 2, pushed: 3 };
    return order[a.status] - order[b.status];
  });

  return (
    <div
      className="overflow-hidden rounded-xl border border-zinc-500/30 bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,#3f3f46_12%)] shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65)] ring-1 ring-zinc-500/20"
      role="region"
      aria-label="Listings removed from latest scrape"
    >
      <div className="border-b border-zinc-500/25 bg-zinc-500/10 px-4 py-3.5 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Gone from latest scrape
        </p>
        <p className="mt-1.5 text-sm text-zinc-200">
          These were pushed to SeatsBrokers but no longer appear in resale inventory. The app deletes
          them on SB automatically when the next scrape syncs.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {deletedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-400/40 bg-zinc-600/30 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-100">
              <span className="size-1.5 rounded-full bg-zinc-300" aria-hidden />
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
            <div className={`min-w-0 space-y-0.5 ${e.status === "deleted" ? "opacity-80" : ""}`}>
              <p
                className={`text-sm font-medium ${e.status === "deleted" ? "text-zinc-400 line-through decoration-zinc-500" : "text-zinc-100"}`}
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
                  className={`font-mono text-xs ${e.status === "deleted" ? "text-zinc-600 line-through" : "text-zinc-500"}`}
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
                  className={`font-mono text-[11px] ${e.status === "deleted" ? "text-zinc-500" : "text-zinc-400"}`}
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
    </div>
  );
}
