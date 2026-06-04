"use client";

import Link from "next/link";
import { memo, useCallback, type ReactNode } from "react";
import { ShopCategoryPricesRow } from "@/app/shop/shop-category-prices";
import { formatShopPrice } from "@/app/shop/shop-utils";
import type { ShopCategoryFilter, ShopMainCategoryKey } from "@/app/shop/shop-utils";
import type { ShopMarketEvent, ShopMarketListing } from "@/lib/shop-marketplace-types";

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

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 ring-1 ring-white/[0.03]">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-100">{value}</dd>
    </div>
  );
}

function ListingRow({
  listing,
  currency,
  highlighted,
}: {
  listing: ShopMarketListing;
  currency: string;
  highlighted: boolean;
}) {
  return (
    <tr
      className={`border-t border-white/[0.06] transition-colors ${
        highlighted ? "bg-[color:color-mix(in_oklab,var(--ticketing-accent)_8%,transparent)]" : "hover:bg-white/[0.03]"
      }`}
    >
      <td className="px-3 py-2.5 text-sm text-zinc-200">{listing.categoryLabel}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{listing.marketKey}</td>
      <td className="px-3 py-2.5">
        {listing.available ? (
          <span className="inline-flex rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-100">
            Available
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
            Unavailable
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-[color:var(--ticketing-accent)]">
        {listing.available ? formatShopPrice(listing.price, currency) : "—"}
      </td>
    </tr>
  );
}

type EventItemProps = {
  event: ShopMarketEvent;
  isOpen: boolean;
  categoryFilter: ShopCategoryFilter;
  onToggle: (matchNum: number) => void;
};

function ShopEventAccordionItemInner({ event, isOpen, categoryFilter, onToggle }: EventItemProps) {
  const { catalogue } = event;
  const title = catalogue.eventName || `Match ${event.matchNum}`;
  const availableListings = event.listings.filter((l) => l.available);
  const highlightCategory: ShopMainCategoryKey | null =
    categoryFilter === "all" ? null : categoryFilter;

  const handleToggle = useCallback(() => {
    onToggle(event.matchNum);
  }, [event.matchNum, onToggle]);

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 transition-colors ${
        highlightCategory
          ? "border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] ring-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)]"
          : "border-white/[0.08] ring-white/[0.04]"
      }`}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className="flex w-full flex-col gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:px-4"
      >
        <div className="flex w-full items-start gap-3">
          <Chevron open={isOpen} />
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-white sm:text-base">{title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              <span className="font-mono text-[color:color-mix(in_oklab,var(--ticketing-accent)_65%,white_12%)]">
                M{event.matchNum}
              </span>
              {catalogue.venue ? <span className="truncate max-w-[14rem]">{catalogue.venue}</span> : null}
              {event.availableCount > 0 ? (
                <span className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_75%,white_10%)]">
                  {event.availableCount} slots
                </span>
              ) : (
                <span className="text-zinc-600">No stock</span>
              )}
            </span>
          </div>
        </div>

        <ShopCategoryPricesRow event={event} highlightCategory={highlightCategory} />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-5 border-t border-white/[0.06] px-4 py-4 sm:px-5">
            <section>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Event information
              </h3>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <KeyValue label="Event name" value={catalogue.eventName} />
                <KeyValue label="Event ID" value={event.externalEventId} />
                <KeyValue
                  label="Internal ID"
                  value={
                    catalogue.linkedEventId !== null ? (
                      <Link
                        href={`/events/${catalogue.linkedEventId}?kind=RESALE&panel=sock`}
                        className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] hover:underline"
                      >
                        {catalogue.linkedEventId}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <KeyValue
                  label="Date"
                  value={catalogue.eventDate ? new Date(catalogue.eventDate).toLocaleDateString() : "—"}
                />
                <KeyValue label="Competition" value={catalogue.competition ?? "—"} />
                <KeyValue label="Venue" value={catalogue.venue ?? "—"} />
                <KeyValue label="Stage" value={catalogue.stage ?? "—"} />
                <KeyValue label="Country" value={catalogue.country ?? "—"} />
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Market data</h3>
              <dl className="grid gap-2 sm:grid-cols-3">
                <KeyValue label="Market name" value="LMS / Last Minute Sales" />
                <KeyValue label="Listings" value={event.listingsCount.toLocaleString("en-US")} />
                <KeyValue label="Available quantity" value={event.availableCount.toLocaleString("en-US")} />
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Pricing</h3>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <KeyValue label="Lowest price" value={formatShopPrice(event.lowestPrice, event.currency)} />
                <KeyValue label="Highest price" value={formatShopPrice(event.highestPrice, event.currency)} />
                <KeyValue label="Average price" value={formatShopPrice(event.averagePrice, event.currency)} />
                <KeyValue label="Currency" value={event.currency} />
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Category listings
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] ring-1 ring-white/[0.04]">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead className="bg-black/30 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Market key</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.listings.map((l) => (
                      <ListingRow
                        key={l.marketKey}
                        listing={l}
                        currency={event.currency}
                        highlighted={highlightCategory !== null && l.categoryKey === highlightCategory}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {availableListings.length > 0 ? (
              <section>
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Available slots
                </h3>
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableListings.map((l) => (
                    <KeyValue
                      key={l.marketKey}
                      label={l.marketKey}
                      value={
                        l.price !== null
                          ? `${formatShopPrice(l.price, event.currency)} · available`
                          : "Available (no price)"
                      }
                    />
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

const ShopEventAccordionItem = memo(ShopEventAccordionItemInner);

type ListProps = {
  events: ShopMarketEvent[];
  openMatchNums: Set<number>;
  categoryFilter: ShopCategoryFilter;
  emptyMessage: string;
  onToggle: (matchNum: number) => void;
};

function ShopEventAccordionListInner({
  events,
  openMatchNums,
  categoryFilter,
  emptyMessage,
  onToggle,
}: ListProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-10 text-center text-sm text-zinc-500 ring-1 ring-white/[0.04]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <ShopEventAccordionItem
          key={event.matchNum}
          event={event}
          isOpen={openMatchNums.has(event.matchNum)}
          categoryFilter={categoryFilter}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

export const ShopEventAccordionList = memo(ShopEventAccordionListInner);
