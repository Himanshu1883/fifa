"use client";

import { memo, useMemo } from "react";
import {
  countEventsWithAvailableCategory,
  SHOP_CATEGORY_SHORT,
  SHOP_MAIN_CATEGORIES,
  type ShopCategoryFilter,
  type ShopMainCategoryKey,
} from "@/app/shop/shop-utils";
import type { ShopMarketEvent } from "@/lib/shop-marketplace-types";

type Props = {
  events: ShopMarketEvent[];
  value: ShopCategoryFilter;
  onChange: (value: ShopCategoryFilter) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  hideFinalFan: boolean;
  onHideFinalFanChange: (value: boolean) => void;
  resultCount: number;
};

function pillClass(active: boolean, hasStock: boolean): string {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors";
  if (active) {
    return `${base} border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] bg-[color:var(--ticketing-accent)] text-zinc-950`;
  }
  if (!hasStock) {
    return `${base} border-white/[0.06] bg-transparent text-zinc-600`;
  }
  return `${base} border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:border-white/[0.16]`;
}

function ShopCategoryFilterBarInner({
  events,
  value,
  onChange,
  availableOnly,
  onAvailableOnlyChange,
  hideFinalFan,
  onHideFinalFanChange,
  resultCount,
}: Props) {
  const counts = useMemo(() => {
    const cats = Object.fromEntries(
      SHOP_MAIN_CATEGORIES.map((c) => [c, countEventsWithAvailableCategory(events, c)]),
    ) as Record<ShopMainCategoryKey, number>;
    return { all: events.length, ...cats };
  }, [events]);

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] px-2 py-1 sm:px-3">
      <div
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
        role="group"
        aria-label="Filters"
      >
        <button
          type="button"
          aria-pressed={availableOnly}
          onClick={() => onAvailableOnlyChange(!availableOnly)}
          className={pillClass(availableOnly, true)}
        >
          Available only
        </button>
        <button
          type="button"
          aria-pressed={hideFinalFan}
          onClick={() => onHideFinalFanChange(!hideFinalFan)}
          className={pillClass(hideFinalFan, true)}
        >
          Hide Final/Fan
        </button>
        <button
          type="button"
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
          className={pillClass(value === "all", true)}
        >
          All <span className="tabular-nums opacity-80">({counts.all})</span>
        </button>
        {SHOP_MAIN_CATEGORIES.map((cat) => {
          const n = counts[cat];
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={value === cat}
              onClick={() => onChange(cat)}
              className={pillClass(value === cat, n > 0)}
            >
              {SHOP_CATEGORY_SHORT[cat]} <span className="tabular-nums opacity-80">({n})</span>
            </button>
          );
        })}
      </div>
      <span className="hidden shrink-0 text-[10px] tabular-nums text-zinc-600 sm:inline">
        {resultCount} shown
      </span>
    </div>
  );
}

export const ShopCategoryFilterBar = memo(ShopCategoryFilterBarInner);
