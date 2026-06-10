"use client";

import { formatRelativeSeconds } from "@/app/shop/shop-utils";
import { SHOP_MATCH_COUNT } from "@/lib/shop-match-grid";

type Props = {
  scannedAt: string | null;
  isLive: boolean;
  eventCount: number;
  availableListings: number;
  matchesWithStock: number;
  nowMs: number;
};

function formatSyncClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ShopHeader({
  scannedAt,
  isLive,
  eventCount,
  availableListings,
  matchesWithStock,
  nowMs,
}: Props) {
  return (
    <header className="flex min-h-[3rem] flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] px-2 py-1.5 sm:px-3">
      <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">SHOP</h1>
      <span className="hidden text-zinc-600 sm:inline" aria-hidden>
        |
      </span>
      <span
        className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${
          isLive ? "text-[color:var(--ticketing-accent)]" : "text-zinc-500"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isLive ? "animate-pulse bg-[color:var(--ticketing-accent)]" : "bg-zinc-600"}`}
          aria-hidden
        />
        {isLive ? "Live" : "Offline"}
      </span>
      <span className="text-[11px] text-zinc-500">
        Updated{" "}
        <span className="font-medium text-zinc-300">{formatRelativeSeconds(scannedAt, nowMs)}</span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
        <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-0.5 text-zinc-300">
          <span className="font-semibold text-white">{SHOP_MATCH_COUNT}</span> Matches
        </span>
        <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-0.5 text-zinc-300">
          <span className="font-semibold text-white">{matchesWithStock.toLocaleString("en-US")}</span> In stock
        </span>
        <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-0.5 text-zinc-300">
          <span className="font-semibold text-white">{eventCount.toLocaleString("en-US")}</span> Listed
        </span>
        <span className="rounded-md border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-2 py-0.5">
          <span className="font-semibold text-[color:var(--ticketing-accent)]">
            {availableListings.toLocaleString("en-US")}
          </span>{" "}
          <span className="text-zinc-400">Available</span>
        </span>
        <span className="hidden text-zinc-600 sm:inline" title={scannedAt ?? undefined}>
          Sync {formatSyncClock(scannedAt)}
        </span>
      </span>
    </header>
  );
}
