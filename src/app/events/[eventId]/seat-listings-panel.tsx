"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  groupConsecutiveSeatListings,
  parseSeatIntStrict,
} from "@/lib/group-consecutive-seats";
import { formatUsd, formatUsdRangeFromAmounts, priceToNumber } from "@/lib/format-usd";

const searchInpClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const selectClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 transition-[border-color,box-shadow] focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

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

export type EventCategoryDTO = {
  categoryId: string;
  categoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
};

type SeatListingBlockGroup = {
  categoryBlockId: string;
  categoryBlockName: string;
  /** One entry per table row; entries with length > 1 are consecutive-seat merges. */
  displayRows: SeatListingDTO[][];
};

type SeatListingCatalogueCategorySection = {
  categoryKey: string;
  displayCategoryId: string;
  displayCategoryName: string;
  blocks: SeatListingBlockGroup[];
};

type CatalogueBlockMeta = {
  categoryBlockId: string;
  categoryBlockName: string;
};

type CatalogueCategoryMeta = {
  categoryKey: string;
  displayCategoryId: string;
  displayCategoryName: string;
  blocks: CatalogueBlockMeta[];
};

type RenderSectionItem =
  | { type: "listing"; section: SeatListingCatalogueCategorySection }
  | { type: "empty"; meta: CatalogueCategoryMeta };

type SortKey = "match" | "price" | "seats";
type SortDir = "asc" | "desc";

function normId(s: string): string {
  return String(s).trim();
}

function normCategoryId(s: string): string {
  const t = String(s).trim();
  if (!t) return "";
  if (/^\d+$/.test(t)) {
    try {
      return BigInt(t).toString();
    } catch {
      /* fall through */
    }
  }
  return t;
}

/** When sync/webhook left human-readable names blank, still show stable IDs in the UI. */
function seatCategoryDisplayName(name: string, id: string): string {
  const n = String(name).trim();
  const i = normCategoryId(id);
  return n || i || "—";
}

function categoryBlockDisplayName(name: string, id: string): string {
  const n = String(name).trim();
  const i = normId(id);
  return n || i || "—";
}

function CatalogueCategorySectionHeading(props: { displayCategoryName: string; displayCategoryId: string }) {
  const title = seatCategoryDisplayName(props.displayCategoryName, props.displayCategoryId);
  const id = normId(props.displayCategoryId);
  const showIdLine = Boolean(id && title !== id);
  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.06] pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Category
        </p>
        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h3>
        {showIdLine ? (
          <p className="font-mono text-xs text-zinc-500">
            ID · {props.displayCategoryId}
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
  "inline-flex max-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter,box-shadow] hover:brightness-[1.07] active:brightness-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

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

function seatsTogetherOk(filter: string, n: number): boolean {
  if (!filter) return true;
  if (filter === "6+") return n >= 6;
  const exact = Number.parseInt(filter, 10);
  if (!Number.isFinite(exact)) return true;
  return n === exact;
}

function compareMatchListing(a: SeatListingDTO, b: SeatListingDTO, dir: SortDir): number {
  const cat = compareCatalogueId(normCategoryId(a.seatCategoryId), normCategoryId(b.seatCategoryId));
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
  return compareCatalogueId(normCategoryId(a.seatCategoryId), normCategoryId(b.seatCategoryId));
}

function sortRows(rows: SeatListingDTO[], sortKey: SortKey, sortDir: SortDir): void {
  rows.sort((a, b) => {
    if (sortKey === "price") return comparePriceListing(a, b, sortDir);
    if (sortKey === "seats") return compareSeatListing(a, b, sortDir);
    return compareMatchListing(a, b, sortDir);
  });
}

type CatalogueCategoryName = { displayCategoryId: string; displayCategoryName: string };

function indexCatalogueCategoryNames(eventCategories: EventCategoryDTO[]): Map<string, CatalogueCategoryName> {
  const m = new Map<string, CatalogueCategoryName>();
  for (const c of eventCategories) {
    const k = normCategoryId(c.categoryId);
    const name = String(c.categoryName).trim();
    if (!k || !name) continue;
    if (!m.has(k)) {
      m.set(k, { displayCategoryId: c.categoryId, displayCategoryName: name });
    }
  }
  return m;
}

function compareCategoryKey(a: string, b: string): number {
  const aCat = /^\d+$/.test(a);
  const bCat = /^\d+$/.test(b);
  if (aCat && bCat) return compareCatalogueId(a, b);
  if (aCat !== bCat) return aCat ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function resolveListingDisplayCategory(
  listing: SeatListingDTO,
  catalogueById: Map<string, CatalogueCategoryName>,
): { categoryKey: string; displayCategoryId: string; displayCategoryName: string } {
  const rawId = String(listing.seatCategoryId).trim();
  const key = normCategoryId(rawId);
  if (key) {
    const catalogue = catalogueById.get(key);
    return {
      categoryKey: key,
      displayCategoryId: rawId,
      displayCategoryName: catalogue?.displayCategoryName ?? listing.seatCategoryName,
    };
  }
  const title = seatCategoryDisplayName(listing.seatCategoryName, listing.seatCategoryId);
  return {
    categoryKey: `uncategorized:${normId(listing.categoryBlockId)}:${title}`,
    displayCategoryId: rawId,
    displayCategoryName: listing.seatCategoryName,
  };
}

function compareBlocksInCategory(a: SeatListingBlockGroup, b: SeatListingBlockGroup): number {
  const nameCmp = a.categoryBlockName.localeCompare(b.categoryBlockName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return normId(a.categoryBlockId).localeCompare(normId(b.categoryBlockId));
}

function compareBlocksInCategoryMeta(a: CatalogueBlockMeta, b: CatalogueBlockMeta): number {
  const nameCmp = a.categoryBlockName.localeCompare(b.categoryBlockName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return normId(a.categoryBlockId).localeCompare(normId(b.categoryBlockId));
}

function buildCatalogueCategoryMeta(eventCategories: EventCategoryDTO[]): CatalogueCategoryMeta[] {
  const catMap = new Map<
    string,
    {
      displayCategoryId: string;
      displayCategoryName: string;
      blocks: Map<string, CatalogueBlockMeta>;
    }
  >();

  for (const row of eventCategories) {
    const key = normCategoryId(row.categoryId);
    if (!key) continue;
    const displayCategoryId = String(row.categoryId).trim();
    const displayCategoryName = String(row.categoryName).trim();
    const blockKey = normId(row.categoryBlockId);

    let bucket = catMap.get(key);
    if (!bucket) {
      bucket = {
        displayCategoryId,
        displayCategoryName,
        blocks: new Map(),
      };
      catMap.set(key, bucket);
    } else {
      // Preserve the first non-empty category name we see.
      if (!bucket.displayCategoryName && displayCategoryName) {
        bucket.displayCategoryName = displayCategoryName;
        bucket.displayCategoryId = displayCategoryId;
      }
    }

    if (!blockKey) continue;
    if (!bucket.blocks.has(blockKey)) {
      bucket.blocks.set(blockKey, {
        categoryBlockId: row.categoryBlockId,
        categoryBlockName: row.categoryBlockName,
      });
    }
  }

  return Array.from(catMap.entries())
    .sort(([a], [b]) => compareCategoryKey(a, b))
    .map(([categoryKey, bucket]) => ({
      categoryKey,
      displayCategoryId: bucket.displayCategoryId,
      displayCategoryName: bucket.displayCategoryName,
      blocks: Array.from(bucket.blocks.values()).sort(compareBlocksInCategoryMeta),
    }));
}

function EmptyCatalogueCategorySection(props: { meta: CatalogueCategoryMeta }) {
  const { meta } = props;
  const blocks = meta.blocks;
  const MAX_BLOCKS = 10;
  const shown = blocks.slice(0, MAX_BLOCKS);
  const remaining = Math.max(0, blocks.length - shown.length);

  return (
    <div className="flex flex-col gap-4">
      <CatalogueCategorySectionHeading
        displayCategoryName={meta.displayCategoryName}
        displayCategoryId={meta.displayCategoryId}
      />
      <div className="rounded-xl border border-white/[0.07] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,transparent)] px-5 py-4 ring-1 ring-white/[0.04]">
        <p className="text-sm font-medium text-zinc-100">No seat listings yet</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          This category exists in the catalogue, but there are no synced seat-listing rows for it.
        </p>
        {blocks.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Blocks in catalogue · <span className="tabular-nums text-zinc-400">{blocks.length}</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {shown.map((b) => (
                <li
                  key={normId(b.categoryBlockId)}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs shadow-sm shadow-black/35 ring-1 ring-white/[0.03]"
                >
                  <span className="min-w-0 truncate font-medium text-zinc-200">
                    {categoryBlockDisplayName(b.categoryBlockName, b.categoryBlockId)}
                  </span>
                  <code className="shrink-0 font-mono text-[10px] text-zinc-500">{b.categoryBlockId}</code>
                </li>
              ))}
            </ul>
            {remaining > 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                … plus <span className="tabular-nums text-zinc-400">{remaining}</span> more block
                {remaining === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">No blocks catalogued under this category.</p>
        )}
      </div>
    </div>
  );
}

function groupListingsByCatalogueCategoryAndBlock(
  listings: SeatListingDTO[],
  eventCategories: EventCategoryDTO[],
  sortKey: SortKey,
  sortDir: SortDir,
): SeatListingCatalogueCategorySection[] {
  const catalogueById = indexCatalogueCategoryNames(eventCategories);

  /** categoryKey → section meta + listings */
  const catMap = new Map<
    string,
    {
      displayCategoryId: string;
      displayCategoryName: string;
      rows: SeatListingDTO[];
    }
  >();

  for (const listing of listings) {
    const resolved = resolveListingDisplayCategory(listing, catalogueById);
    let bucket = catMap.get(resolved.categoryKey);
    if (!bucket) {
      bucket = {
        displayCategoryId: resolved.displayCategoryId,
        displayCategoryName: resolved.displayCategoryName,
        rows: [],
      };
      catMap.set(resolved.categoryKey, bucket);
    }
    bucket.rows.push(listing);
  }

  const sections: SeatListingCatalogueCategorySection[] = [];

  const sortedCatKeys = Array.from(catMap.keys()).sort(compareCategoryKey);

  for (const categoryKey of sortedCatKeys) {
    const bucket = catMap.get(categoryKey)!;

    /** blockKey (id) → block group raw rows */
    const blockBuckets = new Map<
      string,
      { categoryBlockId: string; categoryBlockName: string; rows: SeatListingDTO[] }
    >();
    for (const r of bucket.rows) {
      const bk = normId(r.categoryBlockId);
      let bg = blockBuckets.get(bk);
      if (!bg) {
        bg = {
          categoryBlockId: r.categoryBlockId,
          categoryBlockName: r.categoryBlockName,
          rows: [],
        };
        blockBuckets.set(bk, bg);
      }
      bg.rows.push(r);
    }

    const blocks: SeatListingBlockGroup[] = Array.from(blockBuckets.values())
      .map((bg) => {
        sortRows(bg.rows, sortKey, sortDir);
        const displayRows = groupConsecutiveSeatListings(bg.rows);
        sortDisplayRows(displayRows, sortKey, sortDir);
        return {
          categoryBlockId: bg.categoryBlockId,
          categoryBlockName: bg.categoryBlockName,
          displayRows,
        };
      })
      .sort(compareBlocksInCategory);

    sections.push({
      categoryKey,
      displayCategoryId: bucket.displayCategoryId,
      displayCategoryName: bucket.displayCategoryName,
      blocks,
    });
  }

  if (sortKey === "price") {
    sections.sort((a, b) => {
      const ma = minPriceInCategorySection(a);
      const mb = minPriceInCategorySection(b);
      const aOk = Number.isFinite(ma);
      const bOk = Number.isFinite(mb);
      if (!aOk && !bOk) return compareCategoryKey(a.categoryKey, b.categoryKey);
      if (!aOk) return sortDir === "asc" ? 1 : -1;
      if (!bOk) return sortDir === "asc" ? -1 : 1;
      if (ma !== mb) return sortDir === "asc" ? (ma < mb ? -1 : 1) : ma < mb ? 1 : -1;
      return compareCategoryKey(a.categoryKey, b.categoryKey);
    });
  }

  return sections;
}

function minPriceInCategorySection(s: SeatListingCatalogueCategorySection): number {
  let min = Number.POSITIVE_INFINITY;
  for (const b of s.blocks) {
    for (const row of b.displayRows) {
      for (const r of row) {
        const p = priceToNumber(r.amount);
        if (Number.isFinite(p) && p < min) min = p;
      }
    }
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
  "inline-flex min-h-9 max-w-max items-center rounded-full border px-2.5 py-1.5 text-left text-xs font-semibold transition-[background-color,border-color,box-shadow,color] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:text-sm";

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
              ? `${pillBase} shrink-0 border-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] text-zinc-50 shadow-sm shadow-black/25`
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
                ? `${pillBase} shrink-0 border-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] text-zinc-50 shadow-sm shadow-black/25`
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
            ? "relative inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-zinc-50 shadow-sm shadow-black/20 outline-none focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:px-2.5 sm:text-sm"
            : "inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:px-2.5 sm:text-sm"
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
            className="absolute inset-0 rounded-md bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)]"
            aria-hidden
          />
        ) : null}
        <span className="relative z-[1]">{label}</span>
        {active ? (
          <span
            className="relative z-[1] font-mono text-[10px] tabular-nums text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_18%)] sm:text-xs"
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
  eventCategories: EventCategoryDTO[];
  truncated: boolean;
  totalCount: number;
  /** When true, panel sits inside the event detail card — tighter horizontal padding, no duplicate page heading. */
  embedInParentCard?: boolean;
}) {
  const { listings, eventCategories, truncated, totalCount, embedInParentCard = false } = props;

  const mdUp = useMediaQuery("(min-width: 768px)");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [includeEmptyCatalogueCategories, setIncludeEmptyCatalogueCategories] = useState(false);

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
  const [togetherFilter, setTogetherFilter] = useState<"" | "1" | "2" | "3" | "4" | "5" | "6+">("");
  const [sortKey, setSortKey] = useState<SortKey>("match");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const catalogueCategoryNames = useMemo(
    () => indexCatalogueCategoryNames(eventCategories),
    [eventCategories],
  );

  const catalogueCategories = useMemo(
    () => buildCatalogueCategoryMeta(eventCategories),
    [eventCategories],
  );

  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalogueCategories) {
      const id = normCategoryId(c.displayCategoryId);
      if (!id) continue;
      if (!m.has(id)) {
        const label = seatCategoryDisplayName(c.displayCategoryName, c.displayCategoryId);
        m.set(id, label);
      }
    }
    for (const r of listings) {
      const id = normCategoryId(r.seatCategoryId);
      if (!id) continue;
      if (!m.has(id)) {
        const catalogueName = catalogueCategoryNames.get(id)?.displayCategoryName;
        m.set(id, catalogueName?.trim() || r.seatCategoryName.trim() || id);
      }
    }
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => compareCatalogueId(a.key, b.key));
  }, [listings, catalogueCategoryNames, catalogueCategories]);

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
      if (categoryFilter && normCategoryId(r.seatCategoryId) !== categoryFilter) return false;
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

  // Filter → resolve catalogue category + block → per-block sort → merge consecutive seats (block+row) →
  // re-sort display rows; category order follows match (category key) or min price when sorting by price.
  const sections = useMemo(
    () => groupListingsByCatalogueCategoryAndBlock(filtered, eventCategories, sortKey, sortDir),
    [filtered, eventCategories, sortKey, sortDir],
  );

  const togetherOk = (n: number) => seatsTogetherOk(togetherFilter, n);

  const allowEmptyCatalogueCategories =
    includeEmptyCatalogueCategories &&
    !search.trim() &&
    !areaFilter &&
    !contingentFilter &&
    !togetherFilter;

  const renderItems = useMemo((): RenderSectionItem[] => {
    const items: RenderSectionItem[] = [];
    const sectionByKey = new Map<string, SeatListingCatalogueCategorySection>();
    for (const s of sections) sectionByKey.set(s.categoryKey, s);

    const catalogueKeySet = new Set(catalogueCategories.map((c) => c.categoryKey));

    if (!allowEmptyCatalogueCategories) {
      return sections.map((section) => ({ type: "listing", section }));
    }

    if (sortKey === "price") {
      // Price sort depends on listings only; append empty catalogue categories after listing categories.
      for (const section of sections) {
        items.push({ type: "listing", section });
      }
      for (const meta of catalogueCategories) {
        if (categoryFilter && meta.categoryKey !== categoryFilter) continue;
        if (sectionByKey.has(meta.categoryKey)) continue;
        items.push({ type: "empty", meta });
      }
      return items;
    }

    for (const meta of catalogueCategories) {
      if (categoryFilter && meta.categoryKey !== categoryFilter) continue;
      const section = sectionByKey.get(meta.categoryKey);
      if (section) items.push({ type: "listing", section });
      else items.push({ type: "empty", meta });
    }

    // Any listing sections that don't map cleanly onto catalogue categories (e.g. uncategorized buckets).
    for (const section of sections) {
      if (categoryFilter && section.categoryKey !== categoryFilter) continue;
      if (!catalogueKeySet.has(section.categoryKey)) {
        items.push({ type: "listing", section });
      }
    }

    return items;
  }, [
    sections,
    catalogueCategories,
    allowEmptyCatalogueCategories,
    sortKey,
    categoryFilter,
  ]);

  const rowCount = renderItems.reduce((n, item) => {
    if (item.type !== "listing") return n;
    return n + item.section.blocks.reduce((nb, b) => nb + b.displayRows.filter((r) => togetherOk(r.length)).length, 0);
  }, 0);

  const showAreaPills = areaOptions.length > 1;
  const showContingentPills = contingentOptions.length > 1;
  const hasSecondaryFilters = showAreaPills || showContingentPills;
  const canShowMoreFilters = hasSecondaryFilters || catalogueCategories.length > 0;

  const hasAnyFilters = Boolean(
    search.trim() ||
      categoryFilter ||
      areaFilter ||
      contingentFilter ||
      togetherFilter ||
      sortKey !== "match" ||
      sortDir !== "asc" ||
      includeEmptyCatalogueCategories,
  );

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
        {listings.length === 0 && (!allowEmptyCatalogueCategories || catalogueCategories.length === 0) ? (
          <div
            className="rounded-xl border border-dashed border-white/[0.12] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_90%,transparent)] px-6 py-14 text-center shadow-inner shadow-black/40 ring-1 ring-white/[0.04]"
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
                  ? "flex flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-black/20 p-3 ring-1 ring-white/[0.04] sm:p-3.5"
                  : "flex flex-col gap-2.5 rounded-2xl border border-white/[0.07] bg-zinc-900/25 p-3.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-4"
              }
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label
                      htmlFor="seat-search"
                      className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                    >
                      Search
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

                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-2.5">
                    <div className="min-w-0 md:w-[18.5rem]">
                      <SortToggle
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSortChange={(k, d) => {
                          setSortKey(k);
                          setSortDir(d);
                        }}
                      />
                    </div>

                    {mdUp ? (
                      <>
                        <div className="flex min-w-[12rem] flex-col gap-1">
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

                        <div className="flex min-w-[10rem] flex-col gap-1">
                          <label
                            htmlFor="together-select"
                            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                          >
                            Together
                          </label>
                          <select
                            id="together-select"
                            value={togetherFilter}
                            onChange={(e) =>
                              setTogetherFilter((e.target.value as typeof togetherFilter) || "")
                            }
                            className={selectClass}
                          >
                            <option value="">All</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6+">6+</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMobileFiltersOpen(true)}
                        className={
                          hasAnyFilters
                            ? "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-left text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                            : "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/[0.10] bg-black/30 px-3 py-2 text-left text-sm font-semibold text-zinc-100 ring-1 ring-white/[0.04] outline-none transition-colors hover:border-white/16 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                        }
                        aria-label="Open filters"
                      >
                        <span>Filters</span>
                        <span className="tabular-nums text-zinc-400" aria-hidden>
                          ▸
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <p className="text-[11px] leading-snug text-zinc-500 sm:text-xs">
                    <span className="tabular-nums text-zinc-300">{rowCount.toLocaleString("en-US")}</span>
                    <span> rows · </span>
                    <span className="tabular-nums text-zinc-400">{filtered.length.toLocaleString("en-US")}</span>
                    <span> listings</span>
                    {mdUp ? (
                      <>
                        <span className="text-zinc-700"> · </span>
                        <span className="tabular-nums text-zinc-500">
                          {listings.length.toLocaleString("en-US")}
                        </span>
                        <span> loaded</span>
                        {truncated && totalCount > listings.length ? (
                          <span>
                            {" "}
                            (DB{" "}
                            <span className="tabular-nums text-zinc-500">
                              {totalCount.toLocaleString("en-US")}
                            </span>
                            )
                          </span>
                        ) : null}
                      </>
                    ) : null}
                    <span>.</span>
                  </p>

                  <div className="flex items-center gap-2">
                    {mdUp && canShowMoreFilters ? (
                      <button
                        type="button"
                        className={
                          moreFiltersOpen
                            ? "min-h-9 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] outline-none transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                            : "min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-xs font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                        }
                        onClick={() => setMoreFiltersOpen((v) => !v)}
                        aria-expanded={moreFiltersOpen}
                        aria-label="Toggle advanced filters"
                      >
                        {moreFiltersOpen ? "Hide" : "More"}
                      </button>
                    ) : null}

                    {mdUp && hasAnyFilters ? (
                      <button
                        type="button"
                        className="min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-xs font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                        onClick={() => {
                          setSearch("");
                          setCategoryFilter(null);
                          setAreaFilter(null);
                          setContingentFilter(null);
                          setTogetherFilter("");
                          setSortKey("match");
                          setSortDir("asc");
                          setIncludeEmptyCatalogueCategories(false);
                          setMoreFiltersOpen(false);
                        }}
                        aria-label="Clear all filters"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {mdUp && moreFiltersOpen ? (
                  <div className="space-y-2 border-t border-white/[0.06] pt-2">
                    {catalogueCategories.length > 0 ? (
                      <label className="inline-flex items-start gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-white/[0.18] bg-black/30 text-[color:var(--ticketing-accent)]"
                          checked={includeEmptyCatalogueCategories}
                          onChange={(e) => setIncludeEmptyCatalogueCategories(e.target.checked)}
                          aria-describedby="include-empty-catalogue-hint"
                        />
                        <span className="leading-snug">
                          Include empty catalogue categories
                          <span id="include-empty-catalogue-hint" className="block text-[11px] text-zinc-500">
                            Shows catalogue categories even when they have 0 listings. Hidden while searching or filtering.
                          </span>
                        </span>
                      </label>
                    ) : null}

                    {hasSecondaryFilters ? (
                      <div className="flex flex-col gap-2">
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
              </div>
            </div>

            {!mdUp && mobileFiltersOpen ? (
              <div
                className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Seat listings filters"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setMobileFiltersOpen(false);
                }}
              >
                <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Filters
                      </p>
                      <p className="mt-1 text-sm font-semibold tracking-tight text-white">
                        Seat listings
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      onClick={() => setMobileFiltersOpen(false)}
                    >
                      Done
                    </button>
                  </div>

                  <div className="max-h-[75vh] overflow-auto px-4 py-4 [-webkit-overflow-scrolling:touch]">
                    <div className="grid gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label
                          htmlFor="price-category-select-mobile"
                          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                        >
                          Category
                        </label>
                        <select
                          id="price-category-select-mobile"
                          value={categoryFilter ?? ""}
                          onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
                          className={selectClass}
                        >
                          <option value="">All categories</option>
                          {categoryOptions.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex min-w-0 flex-col gap-1">
                        <label
                          htmlFor="together-select-mobile"
                          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                        >
                          Seats together
                        </label>
                        <select
                          id="together-select-mobile"
                          value={togetherFilter}
                          onChange={(e) =>
                            setTogetherFilter((e.target.value as typeof togetherFilter) || "")
                          }
                          className={selectClass}
                        >
                          <option value="">All</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="6+">6+</option>
                        </select>
                      </div>

                      {catalogueCategories.length > 0 ? (
                        <label className="inline-flex items-start gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-white/[0.18] bg-black/30 text-[color:var(--ticketing-accent)]"
                            checked={includeEmptyCatalogueCategories}
                            onChange={(e) => setIncludeEmptyCatalogueCategories(e.target.checked)}
                          />
                          <span className="leading-snug">Include empty catalogue categories</span>
                        </label>
                      ) : null}

                      {showAreaPills ? (
                        <FilterPillRow
                          fieldId="filter-area-mobile"
                          label="Stage (area)"
                          options={areaOptions}
                          value={areaFilter}
                          onChange={setAreaFilter}
                        />
                      ) : null}

                      {showContingentPills ? (
                        <FilterPillRow
                          fieldId="filter-contingent-mobile"
                          label="Contingent"
                          options={contingentOptions}
                          value={contingentFilter}
                          onChange={setContingentFilter}
                        />
                      ) : null}

                      {hasAnyFilters ? (
                        <button
                          type="button"
                          className="mt-1 min-h-10 w-full rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-sm font-semibold text-zinc-100 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          onClick={() => {
                            setSearch("");
                            setCategoryFilter(null);
                            setAreaFilter(null);
                            setContingentFilter(null);
                            setTogetherFilter("");
                            setSortKey("match");
                            setSortDir("asc");
                            setIncludeEmptyCatalogueCategories(false);
                            setMoreFiltersOpen(false);
                            setMobileFiltersOpen(false);
                          }}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {renderItems.length === 0 || rowCount === 0 ? (
              <div
                className="rounded-xl border border-white/[0.07] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,transparent)] px-6 py-11 text-center ring-1 ring-white/[0.04]"
                role="status"
              >
                <p className="text-base font-medium text-zinc-100">No matching listings</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                  Try clearing filters or using a shorter search. Pills toggle off when selected again.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {renderItems.map((item) => {
                  if (item.type === "empty") {
                    return (
                      <EmptyCatalogueCategorySection
                        key={`empty:${item.meta.categoryKey}`}
                        meta={item.meta}
                      />
                    );
                  }

                  const section = item.section;
                  return (
                    <div key={section.categoryKey} className="flex flex-col gap-4">
                      <CatalogueCategorySectionHeading
                        displayCategoryName={section.displayCategoryName}
                        displayCategoryId={section.displayCategoryId}
                      />
                      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]">
                        <div className="overflow-x-auto scroll-pl-4 scroll-pr-4 [-webkit-overflow-scrolling:touch]">
                          <table className="w-full min-w-[38rem] border-collapse text-sm">
                            <thead>
                              <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_95%,transparent)] text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
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
                                  className="px-4 py-3 pr-4 text-right font-medium text-[color:color-mix(in_oklab,var(--ticketing-accent)_62%,white_18%)]"
                                >
                                  Price
                                </th>
                                <th scope="col" className="px-4 py-3 pr-5 font-medium text-zinc-400 sm:pr-6">
                                  Basket
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.05]">
                              {section.blocks.map((block, blockIndex) => {
                                const displayRows = block.displayRows.filter((r) => togetherOk(r.length));
                                if (displayRows.length === 0) return null;
                                return (
                                  <Fragment
                                    key={`${section.categoryKey}:${normId(block.categoryBlockId)}:${blockIndex}`}
                                  >
                                    {section.blocks.length > 1 ? (
                                      <tr
                                        className={
                                          blockIndex > 0
                                            ? "border-t border-white/[0.06] bg-white/[0.03]"
                                            : "bg-white/[0.03]"
                                        }
                                      >
                                        <td colSpan={5} className="px-4 py-2.5 pl-5 sm:pl-6">
                                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                            Block ·{" "}
                                            <span className="font-sans normal-case tracking-normal text-zinc-300">
                                              {categoryBlockDisplayName(block.categoryBlockName, block.categoryBlockId)}
                                            </span>
                                            {normId(block.categoryBlockId) &&
                                            categoryBlockDisplayName(block.categoryBlockName, block.categoryBlockId) !==
                                              normId(block.categoryBlockId) ? (
                                              <span className="ml-2 font-mono text-[10px] font-medium normal-case tracking-normal text-zinc-600">
                                                {block.categoryBlockId}
                                              </span>
                                            ) : null}
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                    {displayRows.map((listings) => {
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
                                          className="text-zinc-200 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)]"
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
                                          <td className="whitespace-nowrap px-4 py-3 pr-4 text-right text-sm font-bold tabular-nums text-[color:var(--ticketing-accent)]">
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
                                    const hi =
                                      parseSeatIntStrict(listings[listings.length - 1].seatNumber)!;
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
                                        className="text-zinc-200 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)]"
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
                                        <td className="whitespace-nowrap px-4 py-3 pr-4 text-right text-sm font-bold tabular-nums text-[color:var(--ticketing-accent)]">
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
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs">
                  Same-row consecutive seats collapse to one listing;{' '}
                  <span className="text-zinc-400">&quot;N Together&quot;</span> labels multi-seat spans.
                </p>
              </div>
            )}

          </>
        )}
      </div>

      {basketToastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_42%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_95%,transparent)] px-4 py-2.5 text-center text-sm font-medium text-zinc-100 shadow-lg shadow-black/50 ring-1 ring-white/[0.06] backdrop-blur-md"
        >
          {basketToastMessage}
        </div>
      ) : null}
    </section>
  );
}
