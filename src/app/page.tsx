import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { formatUsd, priceToNumber } from "@/lib/format-usd";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { AddEventDialog } from "@/app/add-event-dialog";
import { EventPrefsEditCell } from "@/app/event-prefs-edit-cell";
import type { HomeSortKey } from "@/app/home-event-sort-controls";
import { HomeEventSortControls } from "@/app/home-event-sort-controls";
import {
  HomeEventCategoryBlockCells,
  type HomeSeatCategoryHierarchyItem,
} from "@/app/home-event-category-block-cells";

export const runtime = "nodejs";

type DistinctSeatCategoryBlockRow = {
  eventId: number;
  seatCategoryId: string;
  seatCategoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
};

type EventCategoryBlockStats = {
  categoryCount: number;
  blockCount: number;
  hierarchy: HomeSeatCategoryHierarchyItem[];
};

function buildCategoryBlockStats(rows: DistinctSeatCategoryBlockRow[]): Map<number, EventCategoryBlockStats> {
  type Bucket = {
    categoryIds: Set<string>;
    blockIds: Set<string>;
    catMap: Map<string, { name: string; blocks: Map<string, string> }>;
  };

  const perEvent = new Map<number, Bucket>();

  for (const r of rows) {
    let bucket = perEvent.get(r.eventId);
    if (!bucket) {
      bucket = {
        categoryIds: new Set(),
        blockIds: new Set(),
        catMap: new Map(),
      };
      perEvent.set(r.eventId, bucket);
    }
    bucket.categoryIds.add(r.seatCategoryId);
    bucket.blockIds.add(r.categoryBlockId);

    let catEntry = bucket.catMap.get(r.seatCategoryId);
    if (!catEntry) {
      catEntry = { name: r.seatCategoryName, blocks: new Map() };
      bucket.catMap.set(r.seatCategoryId, catEntry);
    }
    catEntry.blocks.set(r.categoryBlockId, r.categoryBlockName);
  }

  const out = new Map<number, EventCategoryBlockStats>();

  for (const [eventId, b] of perEvent) {
    const hierarchy: HomeSeatCategoryHierarchyItem[] = [...b.catMap.entries()]
      .sort(([a], [c]) => a.localeCompare(c))
      .map(([categoryId, { name, blocks }]) => ({
        categoryId,
        categoryName: name,
        blocks: [...blocks.entries()]
          .sort(([x], [z]) => x.localeCompare(z))
          .map(([blockId, blockName]) => ({ blockId, blockName })),
      }));

    out.set(eventId, {
      categoryCount: b.categoryIds.size,
      blockCount: b.blockIds.size,
      hierarchy,
    });
  }

  return out;
}

type Props = {
  searchParams: Promise<{
    prefsErr?: string | string[];
    sort?: string | string[];
    order?: string | string[];
  }>;
};

type HomeEventRow = {
  id: number;
  sortOrder: number;
  /** Parsed from `matchLabel` or `name` via `/^match\\s*(\\d+)$/i`; null if neither matches. */
  matchNum: number | null;
  matchLabel: string;
  name: string;
  stage: string | null;
  venue: string | null;
  country: string | null;
  prefId: string;
  resalePrefId: string | null;
  seatListingCount: number;
  lowestPriceCents: string | null;
  categoryCount: number;
  blockCount: number;
  categoryBlockHierarchy: HomeSeatCategoryHierarchyItem[];
};

function cellText(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function firstQs(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function parseHomeListSort(q: {
  sort?: string | string[];
  order?: string | string[];
}): { sort: HomeSortKey; order: "asc" | "desc" } {
  const raw = firstQs(q.sort);
  const sort: HomeSortKey =
    raw === "price" || raw === "tickets" || raw === "match" ? raw : "match";
  const ord = firstQs(q.order);
  const order: "asc" | "desc" = ord === "desc" ? "desc" : "asc";
  return { sort, order };
}

function compareNullablePrice(
  a: string | null,
  b: string | null,
  order: "asc" | "desc"
): number {
  const na = priceToNumber(a ?? "");
  const nb = priceToNumber(b ?? "");
  const aOk = Number.isFinite(na);
  const bOk = Number.isFinite(nb);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  let c = na === nb ? 0 : na < nb ? -1 : 1;
  if (order === "desc") c = -c;
  return c;
}

function compareMatchNumberOrder(
  aNum: number | null,
  bNum: number | null,
  order: "asc" | "desc"
): number {
  const aHas = aNum !== null;
  const bHas = bNum !== null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas || !bHas) return 0;
  let c = aNum - bNum;
  if (order === "desc") c = -c;
  return c;
}

function sortHomeEvents(
  rows: HomeEventRow[],
  sort: HomeSortKey,
  order: "asc" | "desc"
): void {
  rows.sort((x, y) => {
    let c = 0;
    if (sort === "match") {
      c = compareMatchNumberOrder(x.matchNum, y.matchNum, order);
    } else if (sort === "price") {
      c = compareNullablePrice(x.lowestPriceCents, y.lowestPriceCents, order);
      if (c === 0) c = compareMatchNumberOrder(x.matchNum, y.matchNum, "asc");
    } else {
      c = x.seatListingCount - y.seatListingCount;
      if (order === "desc") c = -c;
      if (c === 0) c = compareMatchNumberOrder(x.matchNum, y.matchNum, "asc");
    }
    if (c !== 0) return c;
    const tie = x.sortOrder - y.sortOrder;
    if (tie !== 0) return tie;
    return x.id - y.id;
  });
}

export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  const prefsRaw = firstQs(q.prefsErr);
  const prefsErr = prefsRaw ?? undefined;
  const { sort: listSort, order: listOrder } = parseHomeListSort(q);

  let dbErr: string | undefined;
  let events: HomeEventRow[];
  try {
    const [rows, listingAgg, distinctCatBlockRows] = await Promise.all([
      prisma.event.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          matchLabel: true,
          name: true,
          stage: true,
          venue: true,
          country: true,
          prefId: true,
          resalePrefId: true,
        },
      }),
      prisma.eventSeatListing.groupBy({
        by: ["eventId"],
        _count: { _all: true },
        _min: { amount: true },
      }),
      prisma.$queryRaw<DistinctSeatCategoryBlockRow[]>`
        SELECT DISTINCT
          event_id AS "eventId",
          seat_category_id AS "seatCategoryId",
          seat_category_name AS "seatCategoryName",
          category_block_id AS "categoryBlockId",
          category_block_name AS "categoryBlockName"
        FROM event_seat_listings
        ORDER BY event_id ASC, seat_category_id ASC, category_block_id ASC
      `,
    ]);

    const categoryBlockByEvent = buildCategoryBlockStats(distinctCatBlockRows);

    const byEvent = new Map<
      number,
      { seatListingCount: number; lowestPriceCents: string | null }
    >();
    for (const g of listingAgg) {
      const minAmt = g._min.amount;
      byEvent.set(g.eventId, {
        seatListingCount: g._count._all,
        lowestPriceCents: minAmt != null ? minAmt.toString() : null,
      });
    }

    events = rows.map((e) => {
      const agg = byEvent.get(e.id);
      const catBlk = categoryBlockByEvent.get(e.id);
      return {
        ...e,
        matchNum: parseEventMatchNumber(e.matchLabel, e.name),
        seatListingCount: agg?.seatListingCount ?? 0,
        lowestPriceCents: agg?.lowestPriceCents ?? null,
        categoryCount: catBlk?.categoryCount ?? 0,
        blockCount: catBlk?.blockCount ?? 0,
        categoryBlockHierarchy: catBlk?.hierarchy ?? [],
      };
    });
    sortHomeEvents(events, listSort, listOrder);
  } catch (err) {
    events = [];
    const msg = err instanceof Error ? err.message : String(err);
    dbErr =
      "Could not load events from the database. Check DATABASE_URL, that Postgres is running, and run migrations if needed. " +
      `(${msg})`;
  }

  const suggestedSortOrder =
    events.length === 0 ? 1 : Math.max(...events.map((e) => e.sortOrder)) + 1;

  const noListingTitle = "No seat listings synced for this event yet";
  const noPriceTitle = "No listing prices available (add seat listings via webhook or import)";

  return (
    <div className="min-h-screen bg-[#070a09] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,rgba(52,211,153,0.13),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(52,211,153,0.06),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-6 sm:px-6 sm:pb-14 sm:pt-7">
        {prefsErr ? (
          <p
            className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {prefsErr}
          </p>
        ) : null}

        {dbErr ? (
          <p
            className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {dbErr}
          </p>
        ) : null}

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
            aria-hidden
          />
          <header className="relative space-y-2.5 px-4 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/95 ring-1 ring-emerald-400/30">
                Catalogue
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Home
              </span>
            </div>
            <div className="space-y-1.5">
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Matches
              </h1>
              <p className="max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                Full-width schedule: venue, pricing snapshot from seat listings, and pref controls. Edit pref and
                resale IDs from the pencil on each row. New events open with no categories until you seed or webhook.
              </p>
            </div>
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-4 sm:px-7 sm:pb-7">
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Events</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <AddEventDialog suggestedSortOrder={suggestedSortOrder} />
                  <Suspense
                    fallback={
                      <div className="h-11 min-w-[14rem] animate-pulse rounded-lg border border-white/[0.06] bg-black/25" />
                    }
                  >
                    <HomeEventSortControls sort={listSort} order={listOrder} />
                  </Suspense>
                  <p className="text-xs text-zinc-500">{events.length} matches</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]">
                <div className="overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch]">
                  <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#0b0f0e]/95 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                      <tr>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 pl-4 sm:px-4 sm:pl-5">
                          Match
                        </th>
                        <th scope="col" className="min-w-[10rem] px-3 py-3 sm:px-4">
                          Event name
                        </th>
                        <th scope="col" className="px-3 py-3 sm:px-4">
                          Stage
                        </th>
                        <th scope="col" className="px-3 py-3 sm:px-4">
                          Venue
                        </th>
                        <th scope="col" className="px-3 py-3 sm:px-4">
                          Country
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-right sm:px-4"
                          title="Distinct seat_category_id values in seat listings for this event"
                        >
                          Categories
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap px-3 py-3 text-right sm:px-4"
                          title="Distinct category_block_id values in seat listings for this event"
                        >
                          Blocks
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
                          Lowest price
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
                          Tickets
                        </th>
                        <th scope="col" className="min-w-[20rem] px-3 py-3 pr-4 sm:px-4 sm:pr-5">
                          Pref &amp; resale
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-200">
                      {events.map((event, idx) => {
                        const zebra = idx % 2 === 1 ? "bg-white/[0.02]" : "bg-transparent";
                        const hasListings = event.seatListingCount > 0;
                        const priceLabel =
                          hasListings && event.lowestPriceCents
                            ? formatUsd(event.lowestPriceCents)
                            : "—";
                        return (
                          <tr
                            key={event.id}
                            className={`border-t border-white/[0.05] transition-colors hover:bg-white/[0.04] ${zebra}`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 pl-4 font-mono text-xs text-emerald-300/95 sm:px-4 sm:pl-5">
                              {event.matchLabel}
                            </td>
                            <td className="px-3 py-3 sm:px-4">
                              <Link
                                href={`/events/${event.id}`}
                                className="font-medium text-sky-300/95 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/50"
                              >
                                {event.name}
                              </Link>
                            </td>
                            <td className="max-w-[11rem] px-3 py-3 text-zinc-300 sm:px-4">{cellText(event.stage)}</td>
                            <td className="max-w-[13rem] px-3 py-3 text-zinc-300 sm:px-4">{cellText(event.venue)}</td>
                            <td className="max-w-[10rem] px-3 py-3 text-zinc-300 sm:px-4">{cellText(event.country)}</td>
                            <HomeEventCategoryBlockCells
                              eventName={event.name}
                              categoryCount={event.categoryCount}
                              blockCount={event.blockCount}
                              hierarchy={event.categoryBlockHierarchy}
                            />
                            <td
                              className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-zinc-100 sm:px-4"
                              title={!hasListings ? noPriceTitle : undefined}
                            >
                              {priceLabel}
                            </td>
                            <td
                              className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-200 sm:px-4"
                              title={!hasListings ? noListingTitle : undefined}
                            >
                              {event.seatListingCount.toLocaleString("en-US")}
                            </td>
                            <td className="px-3 py-3 pr-4 align-top sm:px-4 sm:pr-5">
                              <EventPrefsEditCell
                                key={`${event.id}-${event.prefId}-${event.resalePrefId ?? ""}`}
                                eventId={event.id}
                                prefId={event.prefId}
                                resalePrefId={event.resalePrefId}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <footer className="border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500 sm:px-5">
                  Lowest price is the minimum seat listing amount (USD). Ticket count is rows in seat listings.
                  Categories and blocks are distinct IDs from those listings; click a count to see the full hierarchy.
                </footer>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
