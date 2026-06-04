"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShopMatchesTable } from "@/app/shop/shop-matches-table";
import { ShopHeader } from "@/app/shop/shop-header";
import { ShopSearch } from "@/app/shop/shop-search";
import { ShopSkeletonList } from "@/app/shop/shop-skeleton";
import { ShopCategoryFilterBar } from "@/app/shop/shop-category-filter";
import {
  applyShopListFilters,
  filterShopEvents,
  SHOP_CATEGORY_SHORT,
  type ShopCategoryFilter,
} from "@/app/shop/shop-utils";
import { useShopData } from "@/hooks/useShopData";

/** Site nav bar height (layout.tsx). */
const NAV_OFFSET = "2.5rem";

export function ShopPageClient() {
  const { events, scannedAt, loading, error, isLive, stats, retry, scrollRootRef } = useShopData();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ShopCategoryFilter>("all");
  const [openMatchNums, setOpenMatchNums] = useState<Set<number>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const searchFilteredEvents = useMemo(() => filterShopEvents(events, search), [events, search]);

  const filteredEvents = useMemo(
    () => applyShopListFilters(events, search, categoryFilter),
    [events, search, categoryFilter],
  );

  const emptyMessage = useMemo(() => {
    if (events.length === 0) return "No marketplace listings found.";
    if (searchFilteredEvents.length === 0) return "No events match your search.";
    if (categoryFilter !== "all") {
      return `No matches with ${SHOP_CATEGORY_SHORT[categoryFilter]} available.`;
    }
    return "No marketplace listings found.";
  }, [events.length, searchFilteredEvents.length, categoryFilter]);

  const onToggle = useCallback((matchNum: number) => {
    setOpenMatchNums((prev) => {
      const next = new Set(prev);
      if (next.has(matchNum)) next.delete(matchNum);
      else next.add(matchNum);
      return next;
    });
  }, []);

  return (
    <div
      className="flex flex-col bg-[color:var(--ticketing-surface)] font-sans text-zinc-100"
      style={{ height: `calc(100dvh - ${NAV_OFFSET})` }}
    >
      <div className="z-20 shrink-0 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,black_4%)] backdrop-blur-sm">
        <ShopHeader
          scannedAt={scannedAt}
          isLive={isLive}
          eventCount={stats.eventCount}
          availableListings={stats.availableListings}
          nowMs={nowMs}
        />
        <ShopSearch value={search} onChange={setSearch} />
        <ShopCategoryFilterBar
          events={searchFilteredEvents}
          value={categoryFilter}
          onChange={setCategoryFilter}
          resultCount={filteredEvents.length}
        />
      </div>

      <div ref={scrollRootRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error ? (
          <div className="mx-2 mt-2 rounded-md border border-rose-500/30 bg-rose-950/30 px-3 py-4 text-center" role="alert">
            <p className="text-xs font-medium text-rose-100">Unable to load marketplace data.</p>
            <p className="mt-1 text-[11px] text-rose-200/80">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 inline-flex h-7 items-center rounded-md border border-white/[0.12] bg-white/[0.06] px-3 text-[11px] font-semibold text-zinc-100 hover:bg-white/[0.1]"
            >
              Retry
            </button>
          </div>
        ) : loading && events.length === 0 ? (
          <div className="p-2">
            <ShopSkeletonList count={16} />
          </div>
        ) : (
          <ShopMatchesTable
            events={filteredEvents}
            openMatchNums={openMatchNums}
            categoryFilter={categoryFilter}
            emptyMessage={emptyMessage}
            onToggle={onToggle}
          />
        )}
      </div>
    </div>
  );
}
