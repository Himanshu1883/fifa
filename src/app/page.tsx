import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { formatUsd, priceToNumber } from "@/lib/format-usd";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { AddEventDialog } from "@/app/add-event-dialog";
import { EditEventDialog } from "@/app/edit-event-dialog";
import { EventImportantToggle } from "@/app/event-important-toggle";
import { EventPrefsEditCell } from "@/app/event-prefs-edit-cell";
import type { HomeImportantFilter, HomeSortKey } from "@/app/home-event-sort-controls";
import { HomeEventSortControls } from "@/app/home-event-sort-controls";
import {
  HomeEventCategoryBlockCells,
  type HomeSeatCategoryHierarchyItem,
} from "@/app/home-event-category-block-cells";

export const runtime = "nodejs";

/** One catalogue row per event category/block pair (Prisma `EventCategory`). */
type EventCategoryCatalogueRow = {
  eventId: number;
  categoryId: string;
  categoryName: string;
  categoryBlockId: string;
  categoryBlockName: string;
};

type EventCategoryBlockStats = {
  categoryCount: number;
  blockCount: number;
  hierarchy: HomeSeatCategoryHierarchyItem[];
};

type EventBlockSeatNowResaleRow = {
  eventId: number;
  categoryId: string;
  blockId: string;
  availabilityResale: number;
};

function buildCategoryBlockStats(
  rows: EventCategoryCatalogueRow[],
  seatNowRows: EventBlockSeatNowResaleRow[],
): Map<number, EventCategoryBlockStats> {
  type Bucket = {
    categoryIds: Set<string>;
    blockIds: Set<string>;
    catMap: Map<string, { name: string; blocks: Map<string, string> }>;
  };

  const resaleByKey = new Map<string, number>();
  for (const r of seatNowRows) {
    resaleByKey.set(`${r.eventId}::${r.categoryId}::${r.blockId}`, r.availabilityResale);
  }

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
    bucket.categoryIds.add(r.categoryId);
    bucket.blockIds.add(r.categoryBlockId);

    let catEntry = bucket.catMap.get(r.categoryId);
    if (!catEntry) {
      catEntry = { name: r.categoryName, blocks: new Map() };
      bucket.catMap.set(r.categoryId, catEntry);
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
          .map(([blockId, blockName]) => ({
            blockId,
            blockName,
            availabilityResale: resaleByKey.get(`${eventId}::${categoryId}::${blockId}`) ?? null,
          })),
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
    important?: string | string[];
  }>;
};

type HomeEventRow = {
  id: number;
  sortOrder: number;
  /** Parsed from `matchLabel` or `name` via `/^match\\s*(\\d+)$/i`; null if neither matches. */
  matchNum: number | null;
  matchLabel: string;
  name: string;
  isImportant: boolean;
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

const eventNameLinkClass =
  "font-medium text-sky-300/95 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

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

function parseImportantFilter(q: { important?: string | string[] }): HomeImportantFilter {
  const raw = firstQs(q.important);
  if (raw === "1") return "important";
  if (raw === "0") return "notImportant";
  return "all";
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
  const importantFilter = parseImportantFilter(q);

  let dbErr: string | undefined;
  let eventsAll: HomeEventRow[];
  let events: HomeEventRow[];
  try {
    const [rows, listingAgg, catalogueCategoryRows] = await Promise.all([
      prisma.event.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          matchLabel: true,
          name: true,
          isImportant: true,
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
      prisma.eventCategory.findMany({
        select: {
          eventId: true,
          categoryId: true,
          categoryName: true,
          categoryBlockId: true,
          categoryBlockName: true,
        },
      }),
    ]);

    const eventIds = rows.map((r) => r.id);
    const seatNowRows = await prisma.eventBlockSeatNow.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true, categoryId: true, blockId: true, availabilityResale: true },
    });

    const categoryBlockByEvent = buildCategoryBlockStats(catalogueCategoryRows, seatNowRows);

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

    eventsAll = rows.map((e) => {
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

    events =
      importantFilter === "important"
        ? eventsAll.filter((e) => e.isImportant)
        : importantFilter === "notImportant"
          ? eventsAll.filter((e) => !e.isImportant)
          : eventsAll;

    sortHomeEvents(events, listSort, listOrder);
  } catch (err) {
    eventsAll = [];
    events = [];
    const msg = err instanceof Error ? err.message : String(err);
    dbErr =
      "Could not load events from the database. Check DATABASE_URL, that Postgres is running, and run migrations if needed. " +
      `(${msg})`;
  }

  const suggestedSortOrder =
    eventsAll.length === 0 ? 1 : Math.max(...eventsAll.map((e) => e.sortOrder)) + 1;

  const totalSeatListings = events.reduce((acc, e) => acc + e.seatListingCount, 0);
  const eventsWithListings = events.filter((e) => e.seatListingCount > 0).length;

  const noListingTitle = "No seat listings synced for this event yet";
  const noPriceTitle = "No listing prices available (add seat listings via webhook or import)";

  const alertShell =
    "rounded-xl border border-red-400/30 bg-[color:color-mix(in_oklab,red_12%,transparent)] px-4 py-3 text-sm text-red-200 shadow-sm shadow-black/30 ring-1 ring-red-500/15";

  return (
    <div className="min-h-screen bg-[#070a09] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(52,211,153,0.06),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        {prefsErr ? (
          <p className={alertShell} role="alert">
            {prefsErr}
          </p>
        ) : null}

        {dbErr ? (
          <p className={alertShell} role="alert">
            {dbErr}
          </p>
        ) : null}

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--ticketing-accent)_70%,transparent)] to-transparent"
            aria-hidden
          />
          <header className="relative px-4 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
            <Link
              href="/settings"
              className="absolute right-4 top-4 rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12] sm:right-8 sm:top-6"
            >
              Settings
            </Link>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Schedule &amp; catalogue
            </p>
            <div
              className="mt-3 h-px w-full max-w-lg bg-gradient-to-r from-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] via-white/[0.12] to-transparent"
              aria-hidden
            />
            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
              <div className="min-w-0 space-y-2">
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2.125rem] sm:leading-tight lg:text-[2.35rem] lg:leading-[1.08]">
                  Match schedule
                </h1>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
                  Fixtures with venue context, lowest seat-listing price, and{" "}
                  <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-zinc-300">
                    EventCategory
                  </code>{" "}
                  rollups. Edit pref IDs from each row; expand counts for the full category hierarchy.
                </p>
              </div>

              <dl
                className="flex w-full flex-col divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_42%,transparent)] shadow-inner shadow-black/25 ring-1 ring-white/[0.04] sm:flex-row sm:divide-x sm:divide-y-0 lg:w-auto lg:min-w-[min(100%,24rem)] lg:shrink-0"
                aria-label="Schedule totals"
              >
                <div className="px-4 py-3.5 sm:flex-1 sm:py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Matches</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-zinc-50 sm:text-2xl sm:leading-none">
                    {events.length.toLocaleString("en-US")}
                  </dd>
                </div>
                <div className="px-4 py-3.5 sm:flex-1 sm:py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Seat listings
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[color:color-mix(in_oklab,var(--ticketing-accent)_88%,white_8%)] sm:text-2xl sm:leading-none">
                    {totalSeatListings.toLocaleString("en-US")}
                  </dd>
                </div>
                <div className="px-4 py-3.5 sm:flex-1 sm:py-4">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    With listings
                  </dt>
                  <dd
                    className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-zinc-200 sm:text-2xl sm:leading-none"
                    title="Matches with at least one seat listing row"
                  >
                    {events.length > 0 ? eventsWithListings.toLocaleString("en-US") : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <section aria-labelledby="home-events-heading" className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2
                    id="home-events-heading"
                    className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >
                    Events
                  </h2>
                  <p className="text-xs leading-relaxed text-zinc-500 lg:hidden">
                    Summaries below; switch to a large screen for the full grid.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <AddEventDialog suggestedSortOrder={suggestedSortOrder} />
                  <Suspense
                    fallback={
                      <div className="h-11 min-w-[14rem] animate-pulse rounded-lg border border-white/[0.06] bg-black/25" />
                    }
                  >
                    <HomeEventSortControls sort={listSort} order={listOrder} important={importantFilter} />
                  </Suspense>
                </div>
              </div>

              {!dbErr && events.length === 0 ? (
                <div
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]"
                  role="status"
                >
                  <div className="px-4 py-14 text-center sm:px-6 sm:py-16">
                    <div
                      className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-black/25 px-5 py-8 ring-1 ring-white/[0.04]"
                    >
                      <p className="text-base font-semibold tracking-tight text-zinc-100">No matches yet</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                        Create an event to start building your schedule. Seat listings and catalogue categories will
                        populate after webhook or import.
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <AddEventDialog suggestedSortOrder={suggestedSortOrder} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : !dbErr ? (
                <>
                  <ul
                    className="m-0 flex list-none flex-col gap-3 p-0 lg:hidden"
                    aria-labelledby="home-events-heading"
                  >
                    {events.map((event, idx) => {
                      const hasListings = event.seatListingCount > 0;
                      const priceLabel =
                        hasListings && event.lowestPriceCents
                          ? formatUsd(event.lowestPriceCents)
                          : "—";
                      const zebra =
                        idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                      const location = [event.venue, event.country].map((v) => v?.trim()).filter(Boolean).join(" · ");
                      return (
                        <li key={event.id}>
                          <article
                            className={`rounded-xl border border-white/[0.08] p-4 shadow-sm ring-1 ring-white/[0.04] transition-colors hover:border-white/[0.11] ${zebra}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                                  <span className="font-mono text-xs font-semibold tabular-nums text-[color:color-mix(in_oklab,var(--ticketing-accent)_90%,white_8%)]">
                                    {event.matchLabel}
                                  </span>
                                  <h3 className="min-w-0 text-base font-semibold leading-snug tracking-tight text-white">
                                    <Link href={`/events/${event.id}`} className={eventNameLinkClass}>
                                      {event.name}
                                    </Link>
                                  </h3>
                                </div>
                                {location ? (
                                  <p className="text-xs leading-relaxed text-zinc-500">{location}</p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                                <EditEventDialog event={event} />
                                <EventImportantToggle
                                  eventId={event.id}
                                  eventName={event.name}
                                  isImportant={event.isImportant}
                                />
                              </div>
                            </div>

                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Stage
                                </dt>
                                <dd className="mt-0.5 font-medium text-zinc-200">{cellText(event.stage)}</dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Lowest price
                                </dt>
                                <dd
                                  className="mt-0.5 tabular-nums font-semibold text-zinc-100"
                                  title={!hasListings ? noPriceTitle : undefined}
                                >
                                  {priceLabel}
                                </dd>
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Tickets
                                </dt>
                                <dd
                                  className="mt-0.5 tabular-nums font-medium text-zinc-200"
                                  title={!hasListings ? noListingTitle : undefined}
                                >
                                  {event.seatListingCount.toLocaleString("en-US")}
                                </dd>
                              </div>
                            </dl>

                            <HomeEventCategoryBlockCells
                              eventName={event.name}
                              categoryCount={event.categoryCount}
                              blockCount={event.blockCount}
                              hierarchy={event.categoryBlockHierarchy}
                              layout="card"
                            />

                            <div className="mt-4 border-t border-white/[0.06] pt-3">
                              <p className="sr-only">Preference IDs</p>
                              <EventPrefsEditCell
                                eventId={event.id}
                                prefId={event.prefId}
                                resalePrefId={event.resalePrefId}
                              />
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="text-xs leading-relaxed text-zinc-500 lg:hidden">
                    Lowest price is the minimum seat listing amount (USD). Ticket counts reflect seat-listing rows. Tap
                    category totals to open the hierarchy dialog.
                  </p>

                  <div className="hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04] lg:block">
                    <div className="relative max-h-[min(70vh,52rem)] overflow-auto overscroll-contain">
                      <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-20 border-b border-white/[0.1] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,white_3%)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[color:color-mix(in_oklab,var(--ticketing-surface)_88%,transparent)]">
                          <tr>
                            <th scope="col" className="whitespace-nowrap px-3 py-3.5 pl-4 sm:px-4 sm:pl-5">
                              Match
                            </th>
                            <th scope="col" className="min-w-[10rem] px-3 py-3.5 sm:px-4">
                              Event name
                            </th>
                            <th scope="col" className="whitespace-nowrap px-3 py-3.5 sm:px-4">
                              Important
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Stage
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Venue
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Country
                            </th>
                            <th
                              scope="colgroup"
                              colSpan={2}
                              className="whitespace-nowrap px-3 py-3.5 text-right sm:px-4"
                              title="Distinct category and block IDs from EventCategory catalogue rows — click the counts on each row to open the hierarchy dialog"
                            >
                              Categories · blocks
                            </th>
                            <th scope="col" className="whitespace-nowrap px-3 py-3.5 text-right sm:px-4">
                              Lowest price
                            </th>
                            <th scope="col" className="whitespace-nowrap px-3 py-3.5 text-right sm:px-4">
                              Tickets
                            </th>
                            <th scope="col" className="min-w-[20rem] px-3 py-3.5 pr-4 sm:px-4 sm:pr-5">
                              Pref &amp; resale
                            </th>
                          </tr>
                        </thead>
                        <tbody className="text-zinc-200">
                          {events.map((event, idx) => {
                            const zebra =
                              idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                            const hasListings = event.seatListingCount > 0;
                            const priceLabel =
                              hasListings && event.lowestPriceCents
                                ? formatUsd(event.lowestPriceCents)
                                : "—";
                            return (
                              <tr
                                key={event.id}
                                className={`border-t border-white/[0.06] transition-colors hover:bg-[color:color-mix(in_oklab,white_9%,transparent)] ${zebra}`}
                              >
                                <td className="whitespace-nowrap px-3 py-3 align-middle pl-4 font-mono text-xs text-emerald-300/95 sm:px-4 sm:pl-5">
                                  {event.matchLabel}
                                </td>
                                <td className="max-w-[16rem] px-3 py-3 align-middle sm:max-w-none sm:px-4">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <Link
                                      href={`/events/${event.id}`}
                                      className={`${eventNameLinkClass} min-w-0 truncate`}
                                    >
                                      {event.name}
                                    </Link>
                                    <EditEventDialog event={event} />
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 align-middle sm:px-4">
                                  <EventImportantToggle
                                    eventId={event.id}
                                    eventName={event.name}
                                    isImportant={event.isImportant}
                                  />
                                </td>
                                <td className="max-w-[11rem] px-3 py-3 align-middle text-zinc-300 sm:px-4">
                                  {cellText(event.stage)}
                                </td>
                                <td className="max-w-[13rem] px-3 py-3 align-middle text-zinc-300 sm:px-4">
                                  {cellText(event.venue)}
                                </td>
                                <td className="max-w-[10rem] px-3 py-3 align-middle text-zinc-300 sm:px-4">
                                  {cellText(event.country)}
                                </td>
                                <HomeEventCategoryBlockCells
                                  eventName={event.name}
                                  categoryCount={event.categoryCount}
                                  blockCount={event.blockCount}
                                  hierarchy={event.categoryBlockHierarchy}
                                />
                                <td
                                  className="whitespace-nowrap px-3 py-3 text-right align-middle font-medium tabular-nums text-zinc-100 sm:px-4"
                                  title={!hasListings ? noPriceTitle : undefined}
                                >
                                  {priceLabel}
                                </td>
                                <td
                                  className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-zinc-200 sm:px-4"
                                  title={!hasListings ? noListingTitle : undefined}
                                >
                                  {event.seatListingCount.toLocaleString("en-US")}
                                </td>
                                <td className="max-w-[24rem] px-3 py-3 pr-4 align-middle sm:max-w-none sm:px-4 sm:pr-5">
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
                    <footer className="border-t border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-zinc-500 sm:px-5">
                      Lowest price uses the minimum seat listing amount (USD). Ticket counts are rows in seat listings.
                      Categories and blocks are distinct IDs from catalogue rows — tap counts in each row for the
                      hierarchy dialog.
                    </footer>
                  </div>
                </>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
