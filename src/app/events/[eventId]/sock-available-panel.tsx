"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatUsd, priceToNumber } from "@/lib/format-usd";

const searchInpClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

const controlClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

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

export type SockAvailableDTO = {
  id: number;
  amount: string | null;
  areaName: string;
  blockName: string;
  contingentId: string;
  row: string;
  seatNumber: string;
  seatId: string;
  resaleMovementId: string;
  categoryName: string;
  categoryId: string;
  areaId: string;
  blockId: string;
  kind: "RESALE" | "LAST_MINUTE";
  createdAt: string;
  updatedAt: string;
};

function norm(s: string): string {
  return String(s ?? "").trim();
}

function formatSockUsd(amount: string | null): string {
  if (!amount) return "—";
  const n = priceToNumber(amount);
  if (!Number.isFinite(n)) return "—";

  // User data uses "amount" in units that should be displayed as USD via /1000.
  // formatUsd expects minor units (cents), so convert: dollars = n/1000 => cents = n/10.
  const cents = n / 10;
  return formatUsd(String(cents));
}

function amountRawToUsdNumber(amount: string | null): number {
  if (!amount) return Number.NaN;
  const n = priceToNumber(amount);
  if (!Number.isFinite(n)) return Number.NaN;
  return n / 1000;
}

function formatTsCompact(ts: string): string {
  // "2026-05-11T18:22:33.123Z" -> "2026-05-11 18:22:33"
  if (!ts) return "—";
  const s = String(ts);
  return s.length >= 19 ? s.slice(0, 19).replace("T", " ") : s;
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        className="stroke-zinc-500"
        strokeWidth="1.4"
      />
      <path d="M10 8.6v5.1" className="stroke-zinc-200" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 6.25h.01" className="stroke-zinc-200" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

type SortKey =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc"
  | "amount_desc"
  | "amount_asc"
  | "area_asc"
  | "category_asc"
  | "block_asc"
  | "row_asc"
  | "seat_asc";

export function SockAvailablePanel(props: { rows: SockAvailableDTO[]; embedInParentCard?: boolean }) {
  const { rows, embedInParentCard = false } = props;
  const smUp = useMediaQuery("(min-width: 640px)");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<SockAvailableDTO | null>(null);

  const [kind, setKind] = useState<"" | "RESALE" | "LAST_MINUTE">("");
  const [area, setArea] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [block, setBlock] = useState<string>("");
  const [row, setRow] = useState<string>("");
  const [seat, setSeat] = useState<string>("");
  const [contingent, setContingent] = useState<string>("");
  const [movement, setMovement] = useState<string>("");
  const [minUsd, setMinUsd] = useState<string>("");
  const [maxUsd, setMaxUsd] = useState<string>("");
  const [createdFrom, setCreatedFrom] = useState<string>("");
  const [createdTo, setCreatedTo] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    if (!openRow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRow(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openRow]);

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.areaName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.categoryName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const blockOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.blockName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kindQ = norm(kind).toLowerCase();
    const areaQ = norm(area).toLowerCase();
    const categoryQ = norm(category).toLowerCase();
    const blockQ = norm(block).toLowerCase();
    const rowQ = norm(row).toLowerCase();
    const seatQ = norm(seat).toLowerCase();
    const contingentQ = norm(contingent).toLowerCase();
    const movementQ = norm(movement).toLowerCase();

    const minN = priceToNumber(minUsd);
    const maxN = priceToNumber(maxUsd);
    const hasMin = Number.isFinite(minN);
    const hasMax = Number.isFinite(maxN);

    const fromMs = createdFrom ? Date.parse(createdFrom) : Number.NaN;
    const toMs = createdTo ? Date.parse(createdTo) : Number.NaN;
    const hasFrom = Number.isFinite(fromMs);
    const hasTo = Number.isFinite(toMs);

    const out = rows.filter((r) => {
      if (kindQ && norm(r.kind).toLowerCase() !== kindQ) return false;
      if (areaQ && norm(r.areaName).toLowerCase() !== areaQ) return false;
      if (categoryQ && norm(r.categoryName).toLowerCase() !== categoryQ) return false;
      if (blockQ && norm(r.blockName).toLowerCase() !== blockQ) return false;

      if (rowQ && !norm(r.row).toLowerCase().includes(rowQ)) return false;
      if (seatQ && !norm(r.seatNumber).toLowerCase().includes(seatQ)) return false;
      if (contingentQ && !norm(r.contingentId).toLowerCase().includes(contingentQ)) return false;
      if (movementQ && !norm(r.resaleMovementId).toLowerCase().includes(movementQ)) return false;

      const usd = amountRawToUsdNumber(r.amount);
      if (hasMin && (!Number.isFinite(usd) || usd < minN)) return false;
      if (hasMax && (!Number.isFinite(usd) || usd > maxN)) return false;

      const createdMs = Date.parse(r.createdAt);
      if (hasFrom && (!Number.isFinite(createdMs) || createdMs < fromMs)) return false;
      if (hasTo && (!Number.isFinite(createdMs) || createdMs > toMs)) return false;

      if (!q) return true;
      const hay = [
        r.amount ?? "",
        r.areaName,
        r.blockName,
        r.contingentId,
        r.row,
        r.seatNumber,
        r.seatId,
        r.resaleMovementId,
        r.categoryName,
        r.categoryId,
        r.areaId,
        r.blockId,
        r.createdAt,
        r.updatedAt,
      ]
        .map((s) => norm(s))
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...out].sort((a, b) => {
      switch (sortKey) {
        case "created_desc":
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case "created_asc":
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        case "updated_desc":
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        case "updated_asc":
          return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
        case "amount_desc":
          return amountRawToUsdNumber(b.amount) - amountRawToUsdNumber(a.amount);
        case "amount_asc":
          return amountRawToUsdNumber(a.amount) - amountRawToUsdNumber(b.amount);
        case "area_asc":
          return norm(a.areaName).localeCompare(norm(b.areaName));
        case "category_asc":
          return norm(a.categoryName).localeCompare(norm(b.categoryName));
        case "block_asc":
          return norm(a.blockName).localeCompare(norm(b.blockName));
        case "row_asc":
          return norm(a.row).localeCompare(norm(b.row), undefined, { numeric: true, sensitivity: "base" });
        case "seat_asc":
          return norm(a.seatNumber).localeCompare(norm(b.seatNumber), undefined, { numeric: true, sensitivity: "base" });
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    kind,
    area,
    block,
    category,
    contingent,
    createdFrom,
    createdTo,
    maxUsd,
    minUsd,
    movement,
    row,
    rows,
    search,
    seat,
    sortKey,
  ]);

  const sectionPad = embedInParentCard ? "px-4 sm:px-7" : "";
  const filtersVisible = smUp || mobileFiltersOpen;
  const hasAnyFilters = Boolean(
    search.trim() ||
      area ||
      category ||
      block ||
      row ||
      seat ||
      contingent ||
      movement ||
      minUsd ||
      maxUsd ||
      createdFrom ||
      createdTo ||
      sortKey !== "created_desc",
  );

  return (
    <section className={`relative flex flex-col gap-3 sm:gap-4 ${sectionPad}`} aria-label="Sock available table">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            sock_available
          </p>
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Sock available rows
          </h2>
        </div>
        <p className="text-[11px] font-medium tabular-nums text-zinc-500">
          <span className="text-zinc-300">{filtered.length.toLocaleString("en-US")}</span>
          <span> shown</span>
          <span className="text-zinc-600"> / </span>
          <span className="text-zinc-400">{rows.length.toLocaleString("en-US")}</span>
          <span> loaded</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-white/[0.12] bg-[#0c1010]/90 px-6 py-10 text-center shadow-inner shadow-black/40 ring-1 ring-white/[0.04]"
          role="status"
        >
          <p className="text-base font-medium text-zinc-100">No sock_available rows</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            When this event has sock availability data, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-900/25 p-3.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col gap-1">
                <label
                  htmlFor="sock-available-search"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                >
                  Search
                </label>
                <input
                  id="sock-available-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Any field…"
                  className={searchInpClass}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Sort
                </label>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={controlClass}>
                  <option value="created_desc">Created (newest)</option>
                  <option value="created_asc">Created (oldest)</option>
                  <option value="updated_desc">Updated (newest)</option>
                  <option value="updated_asc">Updated (oldest)</option>
                  <option value="amount_asc">Amount (low to high)</option>
                  <option value="amount_desc">Amount (high to low)</option>
                  <option value="area_asc">Area (A→Z)</option>
                  <option value="category_asc">Category (A→Z)</option>
                  <option value="block_asc">Block (A→Z)</option>
                  <option value="row_asc">Row (A→Z)</option>
                  <option value="seat_asc">Seat (low to high)</option>
                </select>
              </div>

              {!smUp ? (
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen((v) => !v)}
                  aria-expanded={mobileFiltersOpen}
                  className={
                    hasAnyFilters
                      ? "flex min-h-10 items-center justify-between gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-left text-sm font-semibold text-emerald-50 ring-1 ring-emerald-400/20 outline-none transition-colors hover:border-emerald-400/35 hover:bg-emerald-500/15 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] sm:col-span-2 lg:col-span-4"
                      : "flex min-h-10 items-center justify-between gap-2 rounded-lg border border-white/[0.10] bg-black/30 px-3 py-2 text-left text-sm font-semibold text-zinc-100 ring-1 ring-white/[0.04] outline-none transition-colors hover:border-white/16 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] sm:col-span-2 lg:col-span-4"
                  }
                >
                  <span>Filters</span>
                  <span className="tabular-nums text-zinc-400" aria-hidden>
                    {mobileFiltersOpen ? "▴" : "▾"}
                  </span>
                </button>
              ) : null}
            </div>

            {filtersVisible ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Kind
                    </label>
                    <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={controlClass}>
                      <option value="">All</option>
                      <option value="RESALE">Resale</option>
                      <option value="LAST_MINUTE">Last‑minute</option>
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Area
                    </label>
                    <select value={area} onChange={(e) => setArea(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {areaOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Category
                    </label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {categoryOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Block
                    </label>
                    <select value={block} onChange={(e) => setBlock(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {blockOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Row contains
                    </label>
                    <input
                      value={row}
                      onChange={(e) => setRow(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. Q"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Seat contains
                    </label>
                    <input
                      value={seat}
                      onChange={(e) => setSeat(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 24"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Amount USD min
                    </label>
                    <input
                      inputMode="decimal"
                      value={minUsd}
                      onChange={(e) => setMinUsd(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Amount USD max
                    </label>
                    <input
                      inputMode="decimal"
                      value={maxUsd}
                      onChange={(e) => setMaxUsd(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Advanced
                    </label>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-left text-sm font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]"
                      onClick={() => setShowMoreFilters((v) => !v)}
                      aria-expanded={showMoreFilters}
                    >
                      {showMoreFilters ? "Hide advanced" : "Show advanced"}
                    </button>
                  </div>
                </div>

                {showMoreFilters ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Contingent contains
                      </label>
                      <input
                        value={contingent}
                        onChange={(e) => setContingent(e.target.value)}
                        className={controlClass}
                        placeholder="e.g. 1140…"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Movement contains
                      </label>
                      <input
                        value={movement}
                        onChange={(e) => setMovement(e.target.value)}
                        className={controlClass}
                        placeholder="e.g. 10229…"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Created from
                      </label>
                      <input
                        type="datetime-local"
                        value={createdFrom}
                        onChange={(e) => setCreatedFrom(e.target.value)}
                        className={controlClass}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Created to
                      </label>
                      <input
                        type="datetime-local"
                        value={createdTo}
                        onChange={(e) => setCreatedTo(e.target.value)}
                        className={controlClass}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-xs font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]"
                  onClick={() => {
                    setSearch("");
                    setKind("");
                    setArea("");
                    setCategory("");
                    setBlock("");
                    setRow("");
                    setSeat("");
                    setContingent("");
                    setMovement("");
                    setMinUsd("");
                    setMaxUsd("");
                    setCreatedFrom("");
                    setCreatedTo("");
                    setSortKey("created_desc");
                    setShowMoreFilters(false);
                    if (!smUp) setMobileFiltersOpen(false);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div
              className="rounded-xl border border-white/[0.07] bg-[#0c1010]/80 px-6 py-10 text-center ring-1 ring-white/[0.04]"
              role="status"
            >
              <p className="text-base font-medium text-zinc-100">No matching rows</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                Try a shorter search query.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#080c0b] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]">
              <div className="max-h-[70vh] overflow-auto [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[72rem] border-collapse text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0f1513]/95 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Area
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Category
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Block
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Row
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Seat
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Amount
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Created
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Updated
                      </th>
                      <th scope="col" className="px-4 py-3 pr-5 text-right font-medium text-zinc-400 sm:pr-6">
                        Info
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {filtered.map((r) => (
                      <tr key={r.id} className="text-zinc-200 transition-colors hover:bg-emerald-500/[0.06]">
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.areaName}</td>
                        <td className="px-4 py-3 text-sm text-zinc-200">{r.categoryName}</td>
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.blockName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {r.row}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {r.seatNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-emerald-300">
                          {formatSockUsd(r.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500" title={r.createdAt}>
                          {formatTsCompact(r.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500" title={r.updatedAt}>
                          {formatTsCompact(r.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 pr-5 text-right sm:pr-6">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-white/[0.10] bg-black/25 p-2 text-zinc-200 shadow-inner shadow-black/35 transition-[border-color,background-color,transform] hover:border-white/[0.16] hover:bg-white/[0.04] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]"
                            aria-label={`Row info: ${r.areaName}, ${r.categoryName}, ${r.blockName}, row ${r.row}, seat ${r.seatNumber}`}
                            onClick={() => setOpenRow(r)}
                          >
                            <InfoIcon />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {openRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Sock available row details"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenRow(null);
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.10] bg-[#070a0a] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]">
            <div className="border-b border-white/[0.08] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    sock_available
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold tracking-tight text-white">
                    {openRow.areaName} · {openRow.categoryName} · {openRow.blockName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Row <span className="font-mono text-zinc-300">{openRow.row}</span> · Seat{" "}
                    <span className="font-mono text-zinc-300">{openRow.seatNumber}</span> ·{" "}
                    <span className="font-mono text-emerald-300">{formatSockUsd(openRow.amount)}</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Kind{" "}
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                      {openRow.kind === "LAST_MINUTE" ? "LAST_MINUTE" : "RESALE"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]"
                  onClick={() => setOpenRow(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Contingent ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.contingentId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Seat ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.seatId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Resale movement
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.resaleMovementId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Category ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.categoryId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Area ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.areaId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Block ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openRow.blockId}</p>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500">
                Created{" "}
                <span className="font-mono text-zinc-300" title={openRow.createdAt}>
                  {formatTsCompact(openRow.createdAt)}
                </span>{" "}
                · Updated{" "}
                <span className="font-mono text-zinc-300" title={openRow.updatedAt}>
                  {formatTsCompact(openRow.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

