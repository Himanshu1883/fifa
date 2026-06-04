"use client";

import { memo } from "react";
import {
  formatShopPrice,
  getEventCategoryListing,
  SHOP_CATEGORY_SHORT,
  SHOP_MAIN_CATEGORIES,
  type ShopMainCategoryKey,
} from "@/app/shop/shop-utils";
import type { ShopMarketEvent } from "@/lib/shop-marketplace-types";

type Props = {
  event: ShopMarketEvent;
  highlightCategory: ShopMainCategoryKey | null;
};

function CategoryPriceCell({
  categoryKey,
  event,
  highlighted,
}: {
  categoryKey: ShopMainCategoryKey;
  event: ShopMarketEvent;
  highlighted: boolean;
}) {
  const listing = getEventCategoryListing(event, categoryKey);
  const available = Boolean(listing?.available);
  const price = listing?.price ?? null;

  return (
    <div
      className={`flex min-w-[4.25rem] flex-col rounded-lg border px-2 py-1.5 text-center transition-colors sm:min-w-[5rem] sm:px-2.5 ${
        highlighted
          ? "border-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]"
          : available
            ? "border-emerald-500/25 bg-emerald-500/[0.08]"
            : "border-white/[0.06] bg-black/20"
      }`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {SHOP_CATEGORY_SHORT[categoryKey]}
      </span>
      <span
        className={`mt-0.5 text-xs font-bold tabular-nums sm:text-sm ${
          available
            ? highlighted
              ? "text-[color:var(--ticketing-accent)]"
              : "text-emerald-100"
            : "text-zinc-600"
        }`}
      >
        {available && price !== null ? formatShopPrice(price, event.currency) : "—"}
      </span>
    </div>
  );
}

function ShopCategoryPricesRowInner({ event, highlightCategory }: Props) {
  return (
    <div
      className="grid w-full grid-cols-4 gap-1.5 sm:gap-2"
      role="group"
      aria-label="Category prices"
    >
      {SHOP_MAIN_CATEGORIES.map((cat) => (
        <CategoryPriceCell
          key={cat}
          categoryKey={cat}
          event={event}
          highlighted={highlightCategory === cat}
        />
      ))}
    </div>
  );
}

export const ShopCategoryPricesRow = memo(ShopCategoryPricesRowInner);
