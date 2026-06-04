"use client";

import Link from "next/link";
import { memo, useCallback, type ReactNode } from "react";
import {
  computeBestOffer,
  formatShopPrice,
  getEventCategoryListing,
  SHOP_TABLE_CATEGORIES,
  type ShopCategoryFilter,
  type ShopMainCategoryKey,
  type ShopTableCategoryKey,
} from "@/app/shop/shop-utils";
import type { ShopMarketEvent, ShopMarketListing } from "@/lib/shop-marketplace-types";

const buyBtnClass =
  "inline-flex h-6 shrink-0 items-center justify-center rounded border border-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] bg-[color:var(--ticketing-accent)] px-2 text-[9px] font-bold uppercase tracking-wide text-zinc-950 hover:brightness-110 active:scale-[0.98]";

const priceClass = "font-bold tabular-nums text-[color:var(--ticketing-accent)]";
const thClass = "px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500";
const tdClass = "px-1.5 py-0 align-middle";

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`text-[10px] text-zinc-500 ${open ? "rotate-90" : ""}`} aria-hidden>
      ▶
    </span>
  );
}

function BestOfferCell({ event }: { event: ShopMarketEvent }) {
  const offer = computeBestOffer(event);
  if (offer.kind === "none") return <span className="text-[11px] text-zinc-600">—</span>;
  if (offer.kind === "unpriced") {
    return (
      <span className="text-[10px] font-semibold text-zinc-400">
        Avail · <span className="text-zinc-500">{offer.catLabel}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-xs ${priceClass}`}>{formatShopPrice(offer.price, event.currency)}</span>
      <span className="text-[9px] font-medium text-zinc-500">{offer.catLabel}</span>
    </span>
  );
}

function CategoryCell({
  event,
  categoryKey,
  highlighted,
}: {
  event: ShopMarketEvent;
  categoryKey: ShopTableCategoryKey;
  highlighted: boolean;
}) {
  const listing = getEventCategoryListing(event, categoryKey);
  const available = Boolean(listing?.available);
  const price = listing?.price ?? null;

  return (
    <td
      className={`${tdClass} text-right ${highlighted ? "bg-[color:color-mix(in_oklab,var(--ticketing-accent)_8%,transparent)]" : ""}`}
    >
      {available && price !== null ? (
        <span className="inline-flex items-center justify-end gap-1">
          <span className={`text-xs ${priceClass}`}>{formatShopPrice(price, event.currency)}</span>
          {event.buyUrl ? (
            <a href={event.buyUrl} target="_blank" rel="noopener noreferrer" className={buyBtnClass} onClick={(e) => e.stopPropagation()}>
              Buy
            </a>
          ) : null}
        </span>
      ) : available ? (
        <span className="inline-flex items-center justify-end gap-1">
          <span className="text-[10px] text-zinc-500">Avail</span>
          {event.buyUrl ? (
            <a href={event.buyUrl} target="_blank" rel="noopener noreferrer" className={buyBtnClass} onClick={(e) => e.stopPropagation()}>
              Buy
            </a>
          ) : null}
        </span>
      ) : (
        <span className="text-[11px] text-zinc-600">—</span>
      )}
    </td>
  );
}

function formatEventDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-[11px] font-medium text-zinc-200">{children}</dd>
    </div>
  );
}

function DetailCategoryRow({ listing, event }: { listing: ShopMarketListing; event: ShopMarketEvent }) {
  const available = listing.available;

  return (
    <tr className="border-t border-white/[0.05]">
      <td className="px-2 py-1.5 text-[11px] text-zinc-300">{listing.categoryLabel}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-600">{listing.marketKey}</td>
      <td className="px-2 py-1.5">
        {available ? (
          <span className="inline-flex rounded border border-[color:color-mix(in_oklab,var(--ticketing-accent)_25%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)]">
            Available
          </span>
        ) : (
          <span className="text-[10px] text-zinc-600">Unavailable</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {available && listing.price !== null ? (
          <span className={`text-xs ${priceClass}`}>{formatShopPrice(listing.price, event.currency)}</span>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {available && event.buyUrl ? (
          <a
            href={event.buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buyBtnClass}
            onClick={(e) => e.stopPropagation()}
          >
            Buy
          </a>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}

function DetailPanel({ event }: { event: ShopMarketEvent }) {
  const { catalogue } = event;
  const sortedListings = [...event.listings].sort((a, b) =>
    a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }),
  );

  return (
    <div className="border-t border-white/[0.06] bg-black/25 px-2 py-2 sm:px-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Event">{catalogue.eventName}</DetailField>
        <DetailField label="Match">{catalogue.matchLabel ?? `M${event.matchNum}`}</DetailField>
        <DetailField label="Event ID">{event.externalEventId}</DetailField>
        <DetailField label="Date & time">{formatEventDateTime(catalogue.eventDate)}</DetailField>
        <DetailField label="Venue">{catalogue.venue ?? "—"}</DetailField>
        <DetailField label="Country">{catalogue.country ?? "—"}</DetailField>
        <DetailField label="Stage">{catalogue.stage ?? "—"}</DetailField>
        <DetailField label="Competition">{catalogue.competition ?? "—"}</DetailField>
      </div>

      <dl className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <div>
          <dt className="text-[9px] uppercase tracking-wide text-zinc-500">Lowest</dt>
          <dd className={`font-semibold tabular-nums ${priceClass}`}>
            {formatShopPrice(event.lowestPrice, event.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-wide text-zinc-500">Highest</dt>
          <dd className="font-semibold tabular-nums text-zinc-300">
            {formatShopPrice(event.highestPrice, event.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-wide text-zinc-500">Average</dt>
          <dd className="font-semibold tabular-nums text-zinc-300">
            {formatShopPrice(event.averagePrice, event.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-wide text-zinc-500">In stock</dt>
          <dd className="font-semibold tabular-nums text-zinc-300">
            {event.availableCount} / {event.listingsCount}
          </dd>
        </div>
        {catalogue.linkedEventId !== null ? (
          <div>
            <dt className="text-[9px] uppercase tracking-wide text-zinc-500">Internal</dt>
            <dd>
              <Link
                href={`/events/${catalogue.linkedEventId}?kind=RESALE&panel=sock`}
                className="font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open event #{catalogue.linkedEventId}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-2 overflow-x-auto rounded-md border border-white/[0.06]">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead className="bg-black/40 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-1.5">Category</th>
              <th className="px-2 py-1.5">Key</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5 text-right">Price</th>
              <th className="px-2 py-1.5 text-right">Buy</th>
            </tr>
          </thead>
          <tbody>
            {sortedListings.map((listing) => (
              <DetailCategoryRow key={listing.marketKey} listing={listing} event={event} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RowProps = {
  event: ShopMarketEvent;
  zebra: boolean;
  isOpen: boolean;
  categoryFilter: ShopCategoryFilter;
  onToggle: (matchNum: number) => void;
};

function MatchRow({ event, zebra, isOpen, categoryFilter, onToggle }: RowProps) {
  const { catalogue } = event;
  const title = catalogue.eventName || `Match ${event.matchNum}`;
  const venue = catalogue.venue?.trim();
  const highlightCategory: ShopMainCategoryKey | null =
    categoryFilter === "all" ? null : categoryFilter;

  const handleToggle = useCallback(() => {
    onToggle(event.matchNum);
  }, [event.matchNum, onToggle]);

  const shopCell: ReactNode = event.buyUrl ? (
    <a
      href={event.buyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buyBtnClass}
      onClick={(e) => e.stopPropagation()}
    >
      Buy
    </a>
  ) : (
    <span className="text-[11px] text-zinc-600">—</span>
  );

  return (
    <>
      <tr
        className={`h-12 cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.03] ${
          zebra ? "bg-white/[0.02]" : ""
        }`}
        onClick={handleToggle}
      >
        <td className={`${tdClass} w-7`}>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center"
            aria-expanded={isOpen}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          >
            <Chevron open={isOpen} />
          </button>
        </td>
        <td className={`${tdClass} w-9 font-mono text-[10px] font-semibold text-zinc-500`}>M{event.matchNum}</td>
        <td className={`${tdClass} min-w-[9rem] max-w-[16rem]`}>
          <p className="truncate text-xs font-semibold leading-tight text-zinc-100">{title}</p>
          {venue ? (
            <p className="truncate text-[10px] leading-tight text-zinc-500">{venue}</p>
          ) : null}
        </td>
        {SHOP_TABLE_CATEGORIES.map((cat) => (
          <CategoryCell key={cat} event={event} categoryKey={cat} highlighted={highlightCategory === cat} />
        ))}
        <td className={`${tdClass} hidden text-right sm:table-cell`}>
          <BestOfferCell event={event} />
        </td>
        <td className={`${tdClass} text-right`}>{shopCell}</td>
      </tr>
      {isOpen ? (
        <tr className={zebra ? "bg-white/[0.02]" : ""}>
          <td colSpan={8} className="p-0">
            <DetailPanel event={event} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

const MatchRowMemo = memo(MatchRow);

type Props = {
  events: ShopMarketEvent[];
  openMatchNums: Set<number>;
  categoryFilter: ShopCategoryFilter;
  emptyMessage: string;
  onToggle: (matchNum: number) => void;
};

function ShopMatchesTableInner({ events, openMatchNums, categoryFilter, emptyMessage, onToggle }: Props) {
  if (events.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-xs text-zinc-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead className="sticky top-0 z-[1] border-b border-white/[0.08] bg-[color:var(--ticketing-surface)]">
          <tr className="h-8">
            <th className={`${thClass} w-7`} aria-label="Expand" />
            <th className={`${thClass} w-9`}>M</th>
            <th className={thClass}>Match</th>
            <th className={`${thClass} text-right`}>C1</th>
            <th className={`${thClass} text-right`}>C2</th>
            <th className={`${thClass} text-right`}>C3</th>
            <th className={`${thClass} hidden text-right sm:table-cell`}>Best</th>
            <th className={`${thClass} text-right`}>Shop</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, idx) => (
            <MatchRowMemo
              key={event.matchNum}
              event={event}
              zebra={idx % 2 === 1}
              isOpen={openMatchNums.has(event.matchNum)}
              categoryFilter={categoryFilter}
              onToggle={onToggle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ShopMatchesTable = memo(ShopMatchesTableInner);
