"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SbCatalogListingDetailsModal,
  SbCatalogListingInfoButton,
} from "@/app/sb-listings/sb-catalog-listing-details-modal";
import type { SbCatalogListing, SbCatalogMatch } from "@/lib/sb-listings-catalog-types";
import { formatMatchDate } from "@/lib/sb-listings-catalog-types";
import type { SbListingUiStatus } from "@/lib/sb-listing-status";

type StatusFilter = "all" | "active" | "deleted" | "other";

const searchClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

function statusMeta(status: SbListingUiStatus): { label: string; badge: string; row: string } {
  switch (status) {
    case "pushed":
      return {
        label: "Active",
        badge:
          "inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100",
        row: "border-white/[0.06] bg-black/20 hover:bg-white/[0.03]",
      };
    case "deleted":
      return {
        label: "Deleted",
        badge:
          "inline-flex rounded-full border border-rose-400/50 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-50",
        row: "border-rose-500/25 bg-rose-950/35 hover:bg-rose-950/45 ring-1 ring-inset ring-rose-500/20",
      };
    case "delete_failed":
      return {
        label: "Delete failed",
        badge:
          "inline-flex rounded-full border border-rose-400/45 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-100",
        row: "border-rose-500/20 bg-rose-950/25 hover:bg-rose-950/35",
      };
    case "removed":
      return {
        label: "Removing…",
        badge:
          "inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100",
        row: "border-amber-500/20 bg-amber-950/20 hover:bg-amber-950/28",
      };
  }
}

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
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function listingMatchesFilter(listing: SbCatalogListing, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return listing.status === "pushed";
  if (filter === "deleted") return listing.status === "deleted";
  return listing.status === "removed" || listing.status === "delete_failed";
}

function matchHaystack(match: SbCatalogMatch): string {
  return [match.eventName, match.venue, match.stage, match.country, match.sbEventId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function listingHaystack(listing: SbCatalogListing): string {
  return [
    listing.sbTicketId,
    listing.blockName,
    listing.row,
    listing.categoryName,
    listing.seatNumbers.join(" "),
    listing.ticketDetails,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatUsd(price: string | null, priceType: string | null): string {
  if (!price) return "—";
  const n = Number(price);
  const cur = priceType?.trim() || "USD";
  if (!Number.isFinite(n)) return `${price} ${cur}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur.length === 3 ? cur : "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scrapePresenceMeta(
  listing: SbCatalogListing,
  lastScrapeAt: string | null,
): { label: string; badge: string; detail: string } {
  switch (listing.status) {
    case "pushed":
      return {
        label: "Present",
        badge:
          "inline-flex rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-100",
        detail: lastScrapeAt
          ? `Last seen ${formatWhen(lastScrapeAt)}`
          : "Still in latest scrape (no scrape timestamp yet)",
      };
    case "removed":
      return {
        label: "Removed from scrape",
        badge:
          "inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100",
        detail: listing.inventoryRemovedAt
          ? `Missing since ${formatWhen(listing.inventoryRemovedAt)}`
          : "No longer in sock_available",
      };
    case "deleted":
      return {
        label: "Deleted on SB",
        badge:
          "inline-flex rounded-full border border-rose-400/50 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-50",
        detail: listing.inventoryRemovedAt
          ? `Removed ${formatWhen(listing.inventoryRemovedAt)}`
          : listing.sbDeletedAt
            ? `Deleted ${formatWhen(listing.sbDeletedAt)}`
            : "Removed from FIFA scrape and deleted on SB",
      };
    case "delete_failed":
      return {
        label: "Delete failed",
        badge:
          "inline-flex rounded-full border border-rose-400/45 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-100",
        detail: listing.inventoryRemovedAt
          ? `Removed ${formatWhen(listing.inventoryRemovedAt)} · SB delete pending`
          : "Removed from FIFA scrape · SB delete failed",
      };
  }
}

export function SbListingsCatalogClient(props: { matches: SbCatalogMatch[]; sbConfigured: boolean }) {
  const { matches: initialMatches, sbConfigured } = props;
  const [matches, setMatches] = useState(initialMatches);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailsListing, setDetailsListing] = useState<{
    listing: SbCatalogListing;
    eventName: string;
  } | null>(null);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/sb-listings-catalog", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        matches?: SbCatalogMatch[];
      };
      if (!res.ok || !json.ok || !json.matches) {
        setLoadError(json.error ?? `Failed to load (${res.status})`);
        return;
      }
      setMatches(json.matches);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const totals = useMemo(() => {
    let active = 0;
    let deleted = 0;
    let listings = 0;
    for (const m of matches) {
      active += m.activeCount;
      deleted += m.deletedCount;
      listings += m.listings.length;
    }
    return { matches: matches.length, listings, active, deleted };
  }, [matches]);

  const q = search.trim().toLowerCase();

  const filteredMatches = useMemo(() => {
    return matches
      .map((match) => {
        const listings = match.listings.filter((l) => {
          if (!listingMatchesFilter(l, statusFilter)) return false;
          if (!q) return true;
          return listingHaystack(l).includes(q) || matchHaystack(match).includes(q);
        });
        if (listings.length === 0) {
          if (q && matchHaystack(match).includes(q)) {
            return { ...match, listings: match.listings.filter((l) => listingMatchesFilter(l, statusFilter)) };
          }
          return null;
        }
        return { ...match, listings };
      })
      .filter((m): m is SbCatalogMatch => m != null && m.listings.length > 0);
  }, [matches, q, statusFilter]);

  const toggleMatch = (eventId: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const expandAll = () => setOpenIds(new Set(filteredMatches.map((m) => m.eventId)));
  const collapseAll = () => setOpenIds(new Set());

  const applyListingDeleteResult = useCallback(
    (
      match: SbCatalogMatch,
      listing: SbCatalogListing,
      json: {
        ok?: boolean;
        error?: string;
        entry?: {
          status: SbListingUiStatus;
          sbDeletedAt?: string | null;
          sbDeleteError?: string | null;
          inventoryRemovedAt?: string | null;
        };
      },
      failed: boolean,
    ) => {
      setMatches((prev) =>
        prev.map((m) => {
          if (m.eventId !== match.eventId) return m;
          const listings = m.listings.map((l) => {
            if (l.logId !== listing.logId) return l;
            if (failed) {
              const err = json.error ?? json.entry?.sbDeleteError ?? "Delete failed";
              return {
                ...l,
                status: (json.entry?.status ?? "delete_failed") as SbListingUiStatus,
                sbDeletedAt: json.entry?.sbDeletedAt ?? null,
                sbDeleteError: json.entry?.sbDeleteError ?? err,
                inventoryRemovedAt:
                  json.entry?.inventoryRemovedAt ?? l.inventoryRemovedAt ?? new Date().toISOString(),
              };
            }
            return {
              ...l,
              status: (json.entry?.status ?? "deleted") as SbListingUiStatus,
              sbDeletedAt: json.entry?.sbDeletedAt ?? new Date().toISOString(),
              sbDeleteError: null,
            };
          });
          return {
            ...m,
            listings,
            activeCount: listings.filter((x) => x.status === "pushed").length,
            deletedCount: listings.filter((x) => x.status === "deleted").length,
            failedCount: listings.filter((x) => x.status === "delete_failed").length,
            pendingCount: listings.filter((x) => x.status === "removed").length,
          };
        }),
      );
    },
    [],
  );

  const handleDelete = useCallback(
    async (match: SbCatalogMatch, listing: SbCatalogListing) => {
      const ticketId = listing.sbTicketId?.trim();
      const canDelete = listing.status === "pushed" || listing.status === "delete_failed";
      if (!ticketId || !canDelete) return;
      const isRetry = listing.status === "delete_failed";
      if (
        !window.confirm(
          isRetry
            ? `Retry deleting SB listing ${ticketId} for ${match.eventName}?\n\nThis calls SeatsBrokers ticket/delete again.`
            : `Delete SB listing ${ticketId} for ${match.eventName}?\n\nThis removes it from SeatsBrokers and marks it deleted here only after SB confirms.`,
        )
      ) {
        return;
      }

      setDeletingId(listing.logId);
      setDeleteError(null);
      try {
        const res = await fetch(`/api/events/${match.eventId}/sb-delete-listing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sbTicketId: ticketId,
            ...(listing.logId > 0 ? { logId: listing.logId } : {}),
            blockName: listing.blockName ?? undefined,
            row: listing.row ?? undefined,
          }),
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          entry?: {
            status: SbListingUiStatus;
            sbDeletedAt?: string | null;
            sbDeleteError?: string | null;
            inventoryRemovedAt?: string | null;
          };
        };
        if (!res.ok || !json.ok) {
          setDeleteError(json.error ?? `Delete failed (${res.status})`);
          applyListingDeleteResult(match, listing, json, true);
          return;
        }

        applyListingDeleteResult(match, listing, json, false);
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingId(null);
      }
    },
    [applyListingDeleteResult],
  );

  const filterChip = (key: StatusFilter, label: string, count?: number) => {
    const active = statusFilter === key;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setStatusFilter(key)}
        className={
          active
            ? "inline-flex min-h-9 items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] px-4 text-sm font-semibold text-zinc-50 shadow-sm shadow-black/30"
            : "inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.10] bg-black/25 px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
        }
      >
        {label}
        {count != null ? (
          <span className="rounded-full bg-black/40 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%)]"
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Link
              href="/"
              className="inline-flex text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
            >
              ← All matches
            </Link>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              SeatsBrokers · Listing registry
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              SB listings by match
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Every listing pushed from this app — active and deleted. Deleted rows stay visible in red
              so nothing is lost from the record.
            </p>
          </div>

          <dl className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              { label: "Matches", value: totals.matches },
              { label: "Listings", value: totals.listings },
              { label: "Active", value: totals.active, accent: "text-emerald-300" },
              { label: "Deleted", value: totals.deleted, accent: "text-rose-300" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-center shadow-inner shadow-black/35 ring-1 ring-white/[0.04]"
              >
                <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{s.label}</dt>
                <dd className={`mt-1 text-xl font-semibold tabular-nums ${s.accent ?? "text-white"}`}>
                  {s.value.toLocaleString("en-US")}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-4 ring-1 ring-white/[0.04] sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <label htmlFor="sb-catalog-search" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Search
            </label>
            <input
              id="sb-catalog-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Match, listing id, block, row…"
              className={searchClass}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filterChip("all", "All", totals.listings)}
            {filterChip("active", "Active", totals.active)}
            {filterChip("deleted", "Deleted", totals.deleted)}
            {filterChip("other", "Other")}
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              disabled={loading}
              onClick={() => void refreshCatalog()}
              className="min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.05] disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={expandAll}
              className="min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.05]"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/[0.05]"
            >
              Collapse all
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100" role="alert">
            {loadError}
          </p>
        ) : null}

        {deleteError ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100" role="alert">
            {deleteError}
          </p>
        ) : null}

        {!sbConfigured ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
            SeatsBrokers API is not configured — you can browse history but delete will not work until{" "}
            <code className="font-mono text-xs">SEATS_BROKERS_API_KEY</code> is set.
          </p>
        ) : null}

        {filteredMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.12] bg-black/20 px-8 py-16 text-center">
            <p className="text-lg font-medium text-zinc-200">
              {loading ? "Loading listings…" : "No listings match your filters"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {loading
                ? "Reading push logs from the database."
                : matches.length === 0
                  ? "No successful SB pushes are in the database yet. Push from a match resale panel, then click Refresh."
                  : "Try clearing search or changing the status filter."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredMatches.map((match) => {
              const open = openIds.has(match.eventId);
              const dateLabel = formatMatchDate(match.eventDate);
              return (
                <section
                  key={match.eventId}
                  className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_90%,transparent)] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]"
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] sm:items-center sm:px-5"
                    aria-expanded={open}
                    onClick={() => toggleMatch(match.eventId)}
                  >
                    <Chevron open={open} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
                        {match.eventName}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        {match.stage ? (
                          <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-0.5 text-zinc-400">
                            {match.stage}
                          </span>
                        ) : null}
                        {match.venue ? (
                          <span className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-0.5 text-zinc-400">
                            {match.venue}
                          </span>
                        ) : null}
                        {dateLabel ? (
                          <span className="font-medium text-zinc-400">{dateLabel}</span>
                        ) : null}
                        {match.sbEventId ? (
                          <span className="font-mono text-[10px] text-zinc-600">SB {match.sbEventId}</span>
                        ) : null}
                        {match.lastScrapeAt ? (
                          <span
                            className="rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-sky-200/90"
                            title={match.lastScrapeAt}
                          >
                            Last scrape {formatWhen(match.lastScrapeAt)}
                          </span>
                        ) : (
                          <span className="rounded-md border border-white/[0.06] bg-black/20 px-2 py-0.5 text-zinc-600">
                            No scrape yet
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {match.activeCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-100">
                          {match.activeCount} active
                        </span>
                      ) : null}
                      {match.deletedCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/12 px-2.5 py-1 text-[11px] font-bold tabular-nums text-rose-100">
                          {match.deletedCount} deleted
                        </span>
                      ) : null}
                      <span className="rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1 font-mono text-xs tabular-nums text-zinc-400">
                        {match.listings.length}
                      </span>
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-white/[0.06]">
                      <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] bg-black/20 px-4 py-2 sm:px-5">
                        <Link
                          href={`/events/${match.eventId}?kind=RESALE&panel=sock`}
                          className="text-xs font-semibold text-[color:var(--ticketing-accent)] hover:brightness-110"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open match resale →
                        </Link>
                      </div>
                      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                        <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-black/30 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                              <th className="px-4 py-3 font-medium">Listing ID</th>
                              <th className="px-4 py-3 font-medium">Category / Block</th>
                              <th className="px-4 py-3 font-medium">Row</th>
                              <th className="px-4 py-3 font-medium">Seats</th>
                              <th className="px-4 py-3 font-medium">Qty</th>
                              <th className="px-4 py-3 font-medium">Price</th>
                              <th className="px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3 font-medium">FIFA scrape</th>
                              <th className="px-4 py-3 font-medium">Timeline</th>
                              <th className="px-4 py-3 text-right font-medium">Actions</th>
                              <th className="w-12 px-2 py-3 text-center font-medium">
                                <span className="sr-only">Details</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {match.listings.map((listing) => {
                              const meta = statusMeta(listing.status);
                              const scrapeMeta = scrapePresenceMeta(listing, match.lastScrapeAt);
                              const isDeleted = listing.status === "deleted";
                              return (
                                <tr
                                  key={listing.logId}
                                  className={`border-b border-white/[0.04] transition-colors ${meta.row}`}
                                >
                                  <td className="whitespace-nowrap px-4 py-3">
                                    <code
                                      className={`font-mono text-sm font-bold tabular-nums ${isDeleted ? "text-rose-300/80 line-through decoration-rose-400/60" : "text-emerald-100"}`}
                                    >
                                      {listing.sbTicketId ?? "—"}
                                    </code>
                                  </td>
                                  <td className={`px-4 py-3 ${isDeleted ? "text-rose-200/50 line-through" : "text-zinc-200"}`}>
                                    <span className="block text-xs text-zinc-500">
                                      {listing.categoryLabel || listing.categoryName || "—"}
                                    </span>
                                    <span className="font-medium">{listing.blockName ?? "—"}</span>
                                  </td>
                                  <td className={`px-4 py-3 font-mono text-xs ${isDeleted ? "text-rose-200/45 line-through" : "text-zinc-300"}`}>
                                    {listing.row ?? "—"}
                                  </td>
                                  <td className={`max-w-[10rem] px-4 py-3 font-mono text-xs ${isDeleted ? "text-rose-200/45 line-through" : "text-zinc-400"}`}>
                                    {listing.seatNumbers.length > 0
                                      ? listing.seatNumbers.join(", ")
                                      : listing.ticketDetails ?? "—"}
                                  </td>
                                  <td className={`px-4 py-3 font-mono tabular-nums ${isDeleted ? "text-rose-200/50" : "text-zinc-300"}`}>
                                    {listing.quantity ?? "—"}
                                  </td>
                                  <td className={`whitespace-nowrap px-4 py-3 font-mono tabular-nums font-semibold ${isDeleted ? "text-rose-200/55 line-through" : "text-[color:var(--ticketing-accent)]"}`}>
                                    {formatUsd(listing.price, listing.priceType)}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3">
                                    <span className={meta.badge}>{meta.label}</span>
                                  </td>
                                  <td className="px-4 py-3 text-[11px] leading-relaxed">
                                    <span className={scrapeMeta.badge}>{scrapeMeta.label}</span>
                                    <div className="mt-1.5 text-zinc-500">{scrapeMeta.detail}</div>
                                    {listing.status === "deleted" && listing.sbDeletedAt ? (
                                      <div className="mt-0.5 text-rose-300/80">
                                        SB deleted {formatWhen(listing.sbDeletedAt)}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
                                    <div>Pushed {formatWhen(listing.pushedAt)}</div>
                                    {listing.inventoryRemovedAt ? (
                                      <div className="text-amber-300/80">
                                        Removed from scrape {formatWhen(listing.inventoryRemovedAt)}
                                      </div>
                                    ) : null}
                                    {listing.sbDeletedAt ? (
                                      <div className={isDeleted ? "text-rose-300/80" : ""}>
                                        Deleted {formatWhen(listing.sbDeletedAt)}
                                      </div>
                                    ) : null}
                                    {listing.sbDeleteError ? (
                                      <div className="text-rose-300/90">{listing.sbDeleteError}</div>
                                    ) : null}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right">
                                    {(listing.status === "pushed" || listing.status === "delete_failed") &&
                                    listing.sbTicketId &&
                                    sbConfigured ? (
                                      <button
                                        type="button"
                                        disabled={deletingId === listing.logId}
                                        onClick={() => void handleDelete(match, listing)}
                                        className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-500/18 disabled:opacity-50"
                                      >
                                        {deletingId === listing.logId
                                          ? "…"
                                          : listing.status === "delete_failed"
                                            ? "Retry"
                                            : "Delete"}
                                      </button>
                                    ) : (
                                      <span className="text-xs text-zinc-600">—</span>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-3 text-center">
                                    <SbCatalogListingInfoButton
                                      onClick={() =>
                                        setDetailsListing({ listing, eventName: match.eventName })
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <SbCatalogListingDetailsModal
        open={detailsListing != null}
        listing={detailsListing?.listing ?? null}
        eventName={detailsListing?.eventName ?? ""}
        onClose={() => setDetailsListing(null)}
      />
    </div>
  );
}
