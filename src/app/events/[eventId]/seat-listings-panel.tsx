"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  groupConsecutiveSeatListings,
  parseSeatIntStrict,
} from "@/lib/group-consecutive-seats";
import { formatUsd, formatUsdRangeFromAmounts, priceToNumber } from "@/lib/format-usd";

const SEAT_LISTINGS_DISPLAY_LIMIT = 500;

const searchInpClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

const selectClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type SeatListingDTO = {
  id: number;
  seatCategoryId: string;
  seatCategoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
  rowLabel: string;
  seatNumber: string;
  /** Minor units (cents) as string from DB Decimal */
  amount: string;
  areaId: string;
  areaName: string;
  contingentId: string;
};

type SeatListingCategoryGroup = {
  seatCategoryId: string;
  seatCategoryName: string;
  rows: SeatListingDTO[];
  /** One entry per table row; entries with length > 1 are consecutive-seat merges. */
  displayRows: SeatListingDTO[][];
};

type SortKey = "match" | "price" | "seats";
type SortDir = "asc" | "desc";

function normId(s: string): string {
  return String(s).trim();
}

/** When sync/webhook left human-readable names blank, still show stable IDs in the UI. */
function seatCategoryDisplayName(name: string, id: string): string {
  const n = String(name).trim();
  const i = normId(id);
  return n || i || "—";
}

function categoryBlockDisplayName(name: string, id: string): string {
  const n = String(name).trim();
  const i = normId(id);
  return n || i || "—";
}

function SeatCategorySectionHeading(props: { seatCategoryName: string; seatCategoryId: string }) {
  const title = seatCategoryDisplayName(props.seatCategoryName, props.seatCategoryId);
  const id = normId(props.seatCategoryId);
  const showIdLine = Boolean(id && title !== id);
  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Price category
        </p>
        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h3>
        {showIdLine ? (
          <p className="font-mono text-xs text-zinc-500">
            ID · {props.seatCategoryId}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function compareCatalogueId(a: string, b: string): number {
  try {
    const ba = BigInt(a.replace(/\D/g, "") || "0");
    const bb = BigInt(b.replace(/\D/g, "") || "0");
    if (ba !== bb) return ba < bb ? -1 : 1;
  } catch {
    /* fall through */
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Ticketing CTA using `--ticketing-accent` / `--ticketing-accent-dim` from globals.css */
const addToBasketBtnClass =
  "inline-flex max-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-1.5 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-950/35 transition-[filter,box-shadow] hover:brightness-[1.07] active:brightness-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c0b]";

/**
 * Placeholder only — no checkout flow yet. Click is harmless (toast + console.info).
 */
function AddToBasketButton(props: {
  ariaLabel: string;
  onPlaceholderClick: (detail: string) => void;
}) {
  const { ariaLabel, onPlaceholderClick } = props;
  return (
    <button
      type="button"
      className={addToBasketBtnClass}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        onPlaceholderClick(ariaLabel);
      }}
    >
      Add to basket
    </button>
  );
}

function applyDir(cmp: number, dir: SortDir): number {
  return dir === "asc" ? cmp : -cmp;
}

function compareMatchListing(a: SeatListingDTO, b: SeatListingDTO, dir: SortDir): number {
  const cat = compareCatalogueId(normId(a.seatCategoryId), normId(b.seatCategoryId));
  if (cat !== 0) return applyDir(cat, dir);
  const blockName = a.categoryBlockName.localeCompare(b.categoryBlockName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (blockName !== 0) return applyDir(blockName, dir);
  const blockId = normId(a.categoryBlockId).localeCompare(normId(b.categoryBlockId));
  if (blockId !== 0) return applyDir(blockId, dir);
  const row = a.rowLabel.localeCompare(b.rowLabel, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (row !== 0) return applyDir(row, dir);
  const seat = a.seatNumber.localeCompare(b.seatNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return applyDir(seat, dir);
}

function comparePriceListing(a: SeatListingDTO, b: SeatListingDTO, dir: SortDir): number {
  const pa = priceToNumber(a.amount);
  const pb = priceToNumber(b.amount);
  const aOk = Number.isFinite(pa);
  const bOk = Number.isFinite(pb);
  if (!aOk && !bOk) return compareMatchListing(a, b, "asc");
  if (!aOk) return applyDir(1, dir);
  if (!bOk) return applyDir(-1, dir);
  if (pa !== pb) return applyDir(pa < pb ? -1 : 1, dir);
  return compareMatchListing(a, b, "asc");
}

function compareSeatListing(a: SeatListingDTO, b: SeatListingDTO, dir: SortDir): number {
  const row = a.rowLabel.localeCompare(b.rowLabel, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (row !== 0) return applyDir(row, dir);
  const seat = a.seatNumber.localeCompare(b.seatNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (seat !== 0) return applyDir(seat, dir);
  const blockName = a.categoryBlockName.localeCompare(b.categoryBlockName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (blockName !== 0) return applyDir(blockName, dir);
  return compareCatalogueId(normId(a.seatCategoryId), normId(b.seatCategoryId));
}

function sortRows(rows: SeatListingDTO[], sortKey: SortKey, sortDir: SortDir): void {
  rows.sort((a, b) => {
    if (sortKey === "price") return comparePriceListing(a, b, sortDir);
    if (sortKey === "seats") return compareSeatListing(a, b, sortDir);
    return compareMatchListing(a, b, sortDir);
  });
}

function groupByCategory(listings: SeatListingDTO[]): SeatListingCategoryGroup[] {
  const m = new Map<string, SeatListingCategoryGroup>();
  for (const listing of listings) {
    const key = normId(listing.seatCategoryId);
    let g = m.get(key);
    if (!g) {
      g = {
        seatCategoryId: listing.seatCategoryId,
        seatCategoryName: listing.seatCategoryName,
        rows: [],
        displayRows: [],
      };
      m.set(key, g);
    }
    g.rows.push(listing);
  }
  return Array.from(m.values()).sort((a, b) =>
    compareCatalogueId(a.seatCategoryId, b.seatCategoryId),
  );
}

function minPriceInGroup(g: SeatListingCategoryGroup): number {
  let min = Number.POSITIVE_INFINITY;
  for (const r of g.rows) {
    const p = priceToNumber(r.amount);
    if (Number.isFinite(p) && p < min) min = p;
  }
  return Number.isFinite(min) ? min : Number.NaN;
}

function minPriceInListings(listings: SeatListingDTO[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const r of listings) {
    const p = priceToNumber(r.amount);
    if (Number.isFinite(p) && p < min) min = p;
  }
  return Number.isFinite(min) ? min : Number.NaN;
}

function representativeForSort(listings: SeatListingDTO[]): SeatListingDTO {
  return [...listings].sort((a, b) => compareMatchListing(a, b, "asc"))[0];
}

function sortDisplayRows(rows: SeatListingDTO[][], sortKey: SortKey, sortDir: SortDir): void {
  rows.sort((a, b) => {
    if (sortKey === "price") {
      const pa = minPriceInListings(a);
      const pb = minPriceInListings(b);
      const aOk = Number.isFinite(pa);
      const bOk = Number.isFinite(pb);
      if (!aOk && !bOk)
        return compareMatchListing(representativeForSort(a), representativeForSort(b), "asc");
      if (!aOk) return applyDir(1, sortDir);
      if (!bOk) return applyDir(-1, sortDir);
      if (pa !== pb) return applyDir(pa < pb ? -1 : 1, sortDir);
      return compareMatchListing(representativeForSort(a), representativeForSort(b), "asc");
    }
    const ra = representativeForSort(a);
    const rb = representativeForSort(b);
    if (sortKey === "seats") return compareSeatListing(ra, rb, sortDir);
    return compareMatchListing(ra, rb, sortDir);
  });
}

type PillOption = { key: string; label: string };

const pillBase =
  "inline-flex min-h-9 max-w-max items-center rounded-full border px-2.5 py-1.5 text-left text-xs font-semibold transition-[background-color,border-color,box-shadow,color] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] sm:text-sm";

function FilterPillRow(props: {
  label: string;
  options: PillOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  fieldId: string;
}) {
  const { label, options, value, onChange, fieldId } = props;
  if (options.length === 0) return null;
  const allLabel = `All ${label.toLowerCase()}`;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend id={`${fieldId}-legend`} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </legend>
      <div
        className="-mx-1 flex max-w-full flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          aria-label={allLabel}
          className={
            value === null
              ? `${pillBase} shrink-0 border-emerald-400/50 bg-emerald-500/[0.22] text-emerald-50 shadow-sm shadow-emerald-950/25`
              : `${pillBase} shrink-0 border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:border-white/18 hover:bg-white/[0.07] hover:text-zinc-200`
          }
        >
          All
        </button>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(value === o.key ? null : o.key)}
            aria-pressed={value === o.key}
            aria-label={`Filter by ${o.label}`}
            className={
              value === o.key
                ? `${pillBase} shrink-0 border-emerald-400/50 bg-emerald-500/[0.22] text-emerald-50 shadow-sm shadow-emerald-950/25`
                : `${pillBase} shrink-0 border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:border-white/18 hover:bg-white/[0.07] hover:text-zinc-200`
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SortToggle(props: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
}) {
  const { sortKey, sortDir, onSortChange } = props;

  const cycle = (key: SortKey) => {
    if (sortKey === key) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, "asc");
    }
  };

  const btn = (key: SortKey, label: string) => {
    const active = sortKey === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => cycle(key)}
        className={
          active
            ? "relative inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-50 shadow-sm shadow-emerald-950/20 outline-none focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] sm:px-2.5 sm:text-sm"
            : "inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] sm:px-2.5 sm:text-sm"
        }
        aria-pressed={active}
        aria-label={
          active
            ? `${label}, sorted ${sortDir === "asc" ? "ascending" : "descending"}. Click to toggle order.`
            : `Sort by ${label}`
        }
      >
        {active ? (
          <span
            className="absolute inset-0 rounded-md bg-emerald-500/22 ring-1 ring-emerald-400/35"
            aria-hidden
          />
        ) : null}
        <span className="relative z-[1]">{label}</span>
        {active ? (
          <span
            className="relative z-[1] font-mono text-[10px] tabular-nums text-emerald-200/95 sm:text-xs"
            aria-hidden
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Sort by
      </legend>
      <div
        className="flex w-full min-w-0 rounded-lg bg-black/40 p-0.5 ring-1 ring-white/[0.08]"
        role="group"
        aria-label="Sort listings"
      >
        {btn("match", "Match")}
        {btn("price", "Price")}
        {btn("seats", "Seats")}
      </div>
    </fieldset>
  );
}

export function SeatListingsPanel(props: {
  listings: SeatListingDTO[];
  truncated: boolean;
  totalCount: number;
  /** When true, panel sits inside the event detail card — tighter horizontal padding, no duplicate page heading. */
  embedInParentCard?: boolean;
}) {
  const { listings, truncated, totalCount, embedInParentCard = false } = props;

  const mdUp = useMediaQuery("(min-width: 768px)");
  const [mobileMoreFiltersOpen, setMobileMoreFiltersOpen] = useState(false);

  const basketToastClearRef = useRef<number | null>(null);
  const [basketToastMessage, setBasketToastMessage] = useState<string | null>(null);

  const notifyBasketPlaceholder = (detail: string) => {
    console.info("[seat-listings] Add to basket (placeholder — checkout not wired)", detail);
    setBasketToastMessage("Basket checkout is coming soon.");
    if (basketToastClearRef.current !== null) window.clearTimeout(basketToastClearRef.current);
    basketToastClearRef.current = window.setTimeout(() => {
      setBasketToastMessage(null);
      basketToastClearRef.current = null;
    }, 2400);
  };

  useEffect(() => {
    return () => {
      if (basketToastClearRef.current !== null) window.clearTimeout(basketToastClearRef.current);
    };
  }, []);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [contingentFilter, setContingentFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("match");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of listings) {
      const id = normId(r.seatCategoryId);
      if (!id) continue;
      if (!m.has(id)) m.set(id, r.seatCategoryName.trim() || id);
    }
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => compareCatalogueId(a.key, b.key));
  }, [listings]);

  const areaOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of listings) {
      const id = normId(r.areaId);
      const name = r.areaName.trim();
      if (!id || !name) continue;
      if (!m.has(id)) m.set(id, name);
    }
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [listings]);

  const contingentOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of listings) {
      const id = normId(r.contingentId);
      if (!id) continue;
      if (!m.has(id)) m.set(id, id);
    }
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
  }, [listings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((r) => {
      if (categoryFilter && normId(r.seatCategoryId) !== categoryFilter) return false;
      if (areaFilter && normId(r.areaId) !== areaFilter) return false;
      if (contingentFilter && normId(r.contingentId) !== contingentFilter) return false;
      if (!q) return true;
      const hay = [
        r.seatCategoryName,
        r.categoryBlockName,
        r.rowLabel,
        r.seatNumber,
        r.areaName,
        r.contingentId,
        r.categoryBlockId,
        r.seatCategoryId,
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [listings, search, categoryFilter, areaFilter, contingentFilter]);

  // Filter → per-category row sort → merge consecutive seats (see group-consecutive-seats.ts) →
  // re-sort display rows to preserve active ordering (price uses min listing price per merged row).
  const groups = useMemo(() => {
    const g = groupByCategory(filtered);
    for (const block of g) {
      sortRows(block.rows, sortKey, sortDir);
      const displayRows = groupConsecutiveSeatListings(block.rows);
      sortDisplayRows(displayRows, sortKey, sortDir);
      block.displayRows = displayRows;
    }
    if (sortKey === "price") {
      g.sort((a, b) => {
        const ma = minPriceInGroup(a);
        const mb = minPriceInGroup(b);
        const aOk = Number.isFinite(ma);
        const bOk = Number.isFinite(mb);
        if (!aOk && !bOk) return compareCatalogueId(a.seatCategoryId, b.seatCategoryId);
        if (!aOk) return sortDir === "asc" ? 1 : -1;
        if (!bOk) return sortDir === "asc" ? -1 : 1;
        if (ma !== mb) return sortDir === "asc" ? (ma < mb ? -1 : 1) : ma < mb ? 1 : -1;
        return compareCatalogueId(a.seatCategoryId, b.seatCategoryId);
      });
    }
    return g;
  }, [filtered, sortKey, sortDir]);

  const rowCount = groups.reduce((n, g) => n + g.displayRows.length, 0);

  const showAreaPills = areaOptions.length > 1;
  const showContingentPills = contingentOptions.length > 1;
  const hasSecondaryFilters = showAreaPills || showContingentPills;
  const secondaryFiltersVisible = mdUp || mobileMoreFiltersOpen;

  const sectionPad = embedInParentCard
    ? "px-4 sm:px-7"
    : "";

  return (
    <section
      className={`relative flex flex-col gap-3 sm:gap-4 ${sectionPad}`}
      aria-label="Seat listings filters and tables"
    >
      <h2 id="seat-listings-heading" className="sr-only">
        Seat listings
      </h2>

      <div className="flex flex-col gap-3">
        {listings.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-white/[0.12] bg-[#0c1010]/90 px-6 py-14 text-center shadow-inner shadow-black/40 ring-1 ring-white/[0.04]"
            role="status"
          >
            <p className="text-base font-medium text-zinc-100">No seat listings yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
              When inventory syncs for this event, seats will show up here with block, row, seat, and
              price.
            </p>
          </div>
        ) : (
          <>
            <div
              className={
                embedInParentCard
                  ? "flex flex-col gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 p-3 ring-1 ring-white/[0.04] sm:p-3.5"
                  : "flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-900/25 p-3.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-4"
              }
            >
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12 md:items-end md:gap-x-2.5 md:gap-y-2">
                <div className="flex min-w-0 flex-col gap-1 md:col-span-5">
                  <label htmlFor="seat-search" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Search listings
                  </label>
                  <input
                    id="seat-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Block, row, seat, category…"
                    className={searchInpClass}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </div>

                <div className="min-w-0 md:col-span-4">
                  <SortToggle
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={(k, d) => {
                      setSortKey(k);
                      setSortDir(d);
                    }}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1 md:col-span-3">
                  <label
                    htmlFor="price-category-select"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >
                    Category
                  </label>
                  <select
                    id="price-category-select"
                    value={categoryFilter ?? ""}
                    onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
                    className={selectClass}
                    aria-describedby="seat-category-hint"
                  >
                    <option value="">All categories</option>
                    {categoryOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p id="seat-category-hint" className="sr-only">
                    Narrows the table to one catalogue price category when chosen.
                  </p>
                </div>
              </div>

              {hasSecondaryFilters ? (
                <div className="border-t border-white/[0.06] pt-2.5">
                  {!mdUp ? (
                    <button
                      type="button"
                      onClick={() => setMobileMoreFiltersOpen((v) => !v)}
                      aria-expanded={mobileMoreFiltersOpen}
                      className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-left text-sm font-semibold text-zinc-100 ring-1 ring-white/[0.04] outline-none transition-colors hover:border-white/16 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]"
                    >
                      <span>More filters · stage & contingent</span>
                      <span className="tabular-nums text-zinc-400" aria-hidden>
                        {mobileMoreFiltersOpen ? "▴" : "▾"}
                      </span>
                    </button>
                  ) : null}

                  {secondaryFiltersVisible ? (
                    <div className="mt-1.5 flex flex-col gap-2 md:mt-2">
                      {showAreaPills ? (
                        <FilterPillRow
                          fieldId="filter-area"
                          label="Stage (area)"
                          options={areaOptions}
                          value={areaFilter}
                          onChange={setAreaFilter}
                        />
                      ) : null}

                      {showContingentPills ? (
                        <FilterPillRow
                          fieldId="filter-contingent"
                          label="Contingent"
                          options={contingentOptions}
                          value={contingentFilter}
                          onChange={setContingentFilter}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="text-[11px] leading-snug text-zinc-500">
                <span className="tabular-nums text-zinc-400">{rowCount.toLocaleString("en-US")}</span>
                <span> matching </span>
                <span className="tabular-nums text-zinc-400">
                  {listings.length.toLocaleString("en-US")}
                </span>
                <span> loaded{truncated ? " (partial DB load — see below)" : ""}.</span>
              </p>
            </div>

            {rowCount === 0 ? (
              <div
                className="rounded-xl border border-white/[0.07] bg-[#0c1010]/80 px-6 py-11 text-center ring-1 ring-white/[0.04]"
                role="status"
              >
                <p className="text-base font-medium text-zinc-100">No matching listings</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                  Try clearing filters or using a shorter search. Pills toggle off when selected again.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map((group) => (
                  <div key={normId(group.seatCategoryId)} className="flex flex-col gap-4">
                    <SeatCategorySectionHeading
                      seatCategoryName={group.seatCategoryName}
                      seatCategoryId={group.seatCategoryId}
                    />
                    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#080c0b] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]">
                      <div className="overflow-x-auto scroll-pl-4 scroll-pr-4 [-webkit-overflow-scrolling:touch]">
                        <table className="w-full min-w-[38rem] border-collapse text-sm">
                          <thead>
                            <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0f1513]/95 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                              <th scope="col" className="px-4 py-3 pl-5 font-medium text-zinc-400 sm:pl-6">
                                Block
                              </th>
                              <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                                Row
                              </th>
                              <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                                Seat
                              </th>
                              <th
                                scope="col"
                                className="px-4 py-3 pr-4 text-right font-medium text-emerald-200/90"
                              >
                                Price
                              </th>
                              <th scope="col" className="px-4 py-3 pr-5 font-medium text-zinc-400 sm:pr-6">
                                Basket
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {group.displayRows.map((listings) => {
                              if (listings.length === 1) {
                                const listing = listings[0];
                                const blockPrimary = categoryBlockDisplayName(
                                  listing.categoryBlockName,
                                  listing.categoryBlockId,
                                );
                                const showBlockId =
                                  Boolean(normId(listing.categoryBlockId)) &&
                                  blockPrimary !== normId(listing.categoryBlockId);
                                const basketAria = `Add to basket: ${blockPrimary}, row ${listing.rowLabel}, seat ${listing.seatNumber}, ${formatUsd(listing.amount)}`;
                                return (
                                  <tr
                                    key={listing.id}
                                    className="text-zinc-200 transition-colors hover:bg-emerald-500/[0.06]"
                                  >
                                    <td className="max-w-[12rem] px-4 py-3 pl-5 align-top sm:max-w-none sm:pl-6">
                                      <div className="font-medium leading-snug text-zinc-50">
                                        {blockPrimary}
                                      </div>
                                      {showBlockId ? (
                                        <div className="mt-1 font-mono text-[11px] leading-snug text-zinc-500">
                                          {listing.categoryBlockId}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                                      {listing.rowLabel}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                                      {listing.seatNumber}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 pr-4 text-right text-sm font-semibold tabular-nums text-emerald-300">
                                      {formatUsd(listing.amount)}
                                    </td>
                                    <td className="px-4 py-3 pr-5 align-middle sm:pr-6">
                                      <AddToBasketButton
                                        ariaLabel={basketAria}
                                        onPlaceholderClick={notifyBasketPlaceholder}
                                      />
                                    </td>
                                  </tr>
                                );
                              }
                              const first = listings[0];
                              const blockPrimary = categoryBlockDisplayName(
                                first.categoryBlockName,
                                first.categoryBlockId,
                              );
                              const showBlockId =
                                Boolean(normId(first.categoryBlockId)) &&
                                blockPrimary !== normId(first.categoryBlockId);
                              const lo = parseSeatIntStrict(first.seatNumber)!;
                              const hi = parseSeatIntStrict(listings[listings.length - 1].seatNumber)!;
                              const seatSpan = lo === hi ? String(lo) : `${lo}-${hi}`;
                              const n = listings.length;
                              const rowKey = listings.map((l) => l.id).join("-");
                              const mergedPriceLabel = formatUsdRangeFromAmounts(
                                listings.map((l) => l.amount),
                              );
                              const basketAria = `Add to basket: ${blockPrimary}, row ${first.rowLabel}, seats ${seatSpan} (${n} together), ${mergedPriceLabel}`;
                              return (
                                <tr
                                  key={rowKey}
                                  className="text-zinc-200 transition-colors hover:bg-emerald-500/[0.06]"
                                >
                                  <td className="max-w-[12rem] px-4 py-3 pl-5 align-top sm:max-w-none sm:pl-6">
                                    <div className="font-medium leading-snug text-zinc-50">
                                      {blockPrimary}
                                    </div>
                                    {showBlockId ? (
                                      <div className="mt-1 font-mono text-[11px] leading-snug text-zinc-500">
                                        {first.categoryBlockId}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                                    {first.rowLabel}
                                  </td>
                                  <td className="px-4 py-3 align-middle font-mono text-xs tabular-nums text-zinc-400">
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                                      <span className="whitespace-nowrap">{seatSpan}</span>
                                      <span className="inline-flex w-fit shrink-0 font-sans">
                                        <span
                                          className="rounded-full bg-rose-500/14 px-2 py-0.5 text-[11px] font-semibold tracking-tight text-rose-100 ring-1 ring-rose-400/35"
                                          title={`${n} consecutive seats sold together`}
                                        >
                                          ({n} Together)
                                        </span>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 pr-4 text-right text-sm font-semibold tabular-nums text-emerald-300">
                                    {formatUsdRangeFromAmounts(listings.map((l) => l.amount))}
                                  </td>
                                  <td className="px-4 py-3 pr-5 align-middle sm:pr-6">
                                    <AddToBasketButton
                                      ariaLabel={basketAria}
                                      onPlaceholderClick={notifyBasketPlaceholder}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs">
                  Same-row consecutive seats collapse to one listing;{' '}
                  <span className="text-zinc-400">&quot;N Together&quot;</span> labels multi-seat spans.
                </p>
              </div>
            )}

            {truncated && rowCount > 0 ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95 ring-1 ring-amber-400/20">
                <p className="font-semibold text-amber-50">Partial load</p>
                <p className="mt-1 text-amber-100/85">
                  Only the first {SEAT_LISTINGS_DISPLAY_LIMIT.toLocaleString("en-US")} of{" "}
                  <span className="tabular-nums font-medium">{totalCount.toLocaleString("en-US")}</span>{" "}
                  database listings are loaded. Filters apply to this slice only.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {basketToastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_42%,transparent)] bg-[#0f1513]/95 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 shadow-lg shadow-black/50 ring-1 ring-white/[0.06] backdrop-blur-md"
        >
          {basketToastMessage}
        </div>
      ) : null}
    </section>
  );
}
