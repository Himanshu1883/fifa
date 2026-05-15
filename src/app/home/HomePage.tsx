import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatUsd, priceToNumber } from "@/lib/format-usd";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { AddEventDialog } from "@/app/add-event-dialog";
import { EditEventDialog } from "@/app/edit-event-dialog";
import { EventImportantToggle } from "@/app/event-important-toggle";
import { EventPrefsEditCell } from "@/app/event-prefs-edit-cell";
import { BoxofficeControlsClient } from "@/app/boxoffice-controls-client";
import type { HomeImportantFilter, HomeSortKey } from "@/app/home-event-sort-controls";
import { HomeEventSortControls } from "@/app/home-event-sort-controls";

export type HomeSockKind = "RESALE" | "LAST_MINUTE";

export type HomeSearchParams = {
  prefsErr?: string | string[];
  sort?: string | string[];
  order?: string | string[];
  kind?: string | string[];
  important?: string | string[];
  venue?: string | string[];
  country?: string | string[];
  bc?: string | string[];
  mp?: string | string[];
};

type MissingPriceSeatSample = {
  seatId: string;
  seatNumber: string;
  row: string;
  blockName: string;
  categoryId: string;
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
  ticketsCount: number;
  lowestPriceCents: string | null;
  cat1: string | null;
  cat2: string | null;
  cat3: string | null;
  cat4: string | null;
  cat1LimitUsdCents: number | null;
  cat2LimitUsdCents: number | null;
  cat3LimitUsdCents: number | null;
  cat4LimitUsdCents: number | null;
  categoryCount: number;
  blockCount: number;
  latestDiff:
    | {
        createdAt: Date | null;
        newCount: number;
        priceChangedCount: number;
      }
    | null;
  missingPriceSeatCount?: number;
  missingPriceSeatSamples?: MissingPriceSeatSample[];
};

const eventNameLinkClass =
  "font-medium text-sky-300/95 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

function cellText(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function diffPillClass(): string {
  return "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,black_82%)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)]";
}

function formatDiffWhen(d: Date | null | undefined): string | null {
  if (!d) return null;
  const when = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(when.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
}

function cellUsdWithLimitFromCentsString(
  value: string | null | undefined,
  limitUsdCents: number | null | undefined,
): { label: string; withinLimit: boolean } {
  const t = value?.trim();
  if (!t) return { label: "—", withinLimit: false };
  const priceLabel = formatUsd(t);
  if (limitUsdCents == null) return { label: priceLabel, withinLimit: false };
  const limitLabel = formatUsd(String(limitUsdCents));
  const priceCents = priceToNumber(t);
  return {
    label: `${priceLabel}/${limitLabel}`,
    withinLimit: Number.isFinite(priceCents) && priceCents <= limitUsdCents,
  };
}

function distinctNonEmptyCaseInsensitive(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

function sockAmountRawToCentsString(value: string | null): string | null {
  if (!value) return null;
  const n = priceToNumber(value);
  if (!Number.isFinite(n)) return null;
  // sock_available.amount uses units displayed as USD via /1000.
  // formatUsd expects cents, so dollars = n/1000 => cents = n/10.
  const cents = n / 10;
  return Number.isFinite(cents) ? String(cents) : null;
}

function catNumberFromSockCategoryName(name: string): 1 | 2 | 3 | 4 | null {
  const s = String(name ?? "").trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

export function firstQs(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function parseHomeListSort(q: { sort?: string | string[]; order?: string | string[] }): {
  sort: HomeSortKey;
  order: "asc" | "desc";
} {
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

function parseHomeVenueFilter(q: { venue?: string | string[] }): string {
  return firstQs(q.venue)?.trim() ?? "";
}

function parseHomeCountryFilter(q: { country?: string | string[] }): string {
  return firstQs(q.country)?.trim() ?? "";
}

export function parseHomeSockKindFilter(q: { kind?: string | string[] }): HomeSockKind {
  const raw = (firstQs(q.kind) ?? "").trim().toLowerCase();
  if (!raw) return "LAST_MINUTE";
  if (raw === "resale") return "RESALE";
  if (raw === "last_minute" || raw === "last-minute" || raw === "lastminute" || raw === "lm" || raw === "shop")
    return "LAST_MINUTE";
  return "LAST_MINUTE";
}

export function homeBasePathForKind(kind: HomeSockKind): "/" | "/resale" {
  return kind === "RESALE" ? "/resale" : "/";
}

export function homeQueryStringFrom(q: HomeSearchParams): string {
  const prefsErr = firstQs(q.prefsErr);
  const venueFilter = parseHomeVenueFilter(q);
  const countryFilter = parseHomeCountryFilter(q);
  const importantFilter = parseImportantFilter(q);
  const { sort: listSort, order: listOrder } = parseHomeListSort(q);
  const bc = firstQs(q.bc);
  const mp = firstQs(q.mp);

  const sp = new URLSearchParams();
  if (prefsErr) sp.set("prefsErr", prefsErr);
  if (bc === "1") sp.set("bc", "1");
  if (mp === "1") sp.set("mp", "1");
  if (venueFilter.trim()) sp.set("venue", venueFilter.trim());
  if (countryFilter.trim()) sp.set("country", countryFilter.trim());
  if (importantFilter === "important") sp.set("important", "1");
  else if (importantFilter === "notImportant") sp.set("important", "0");
  if (!(listSort === "match" && listOrder === "asc")) {
    sp.set("sort", listSort);
    if (listOrder === "desc") sp.set("order", "desc");
  }
  return sp.toString();
}

function compareNullablePrice(a: string | null, b: string | null, order: "asc" | "desc"): number {
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

function compareMatchNumberOrder(aNum: number | null, bNum: number | null, order: "asc" | "desc"): number {
  const aHas = aNum !== null;
  const bHas = bNum !== null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas || !bHas) return 0;
  let c = aNum - bNum;
  if (order === "desc") c = -c;
  return c;
}

function sortHomeEvents(rows: HomeEventRow[], sort: HomeSortKey, order: "asc" | "desc"): void {
  rows.sort((x, y) => {
    let c = 0;
    if (sort === "match") {
      c = compareMatchNumberOrder(x.matchNum, y.matchNum, order);
    } else if (sort === "price") {
      c = compareNullablePrice(x.lowestPriceCents, y.lowestPriceCents, order);
      if (c === 0) c = compareMatchNumberOrder(x.matchNum, y.matchNum, "asc");
    } else {
      c = x.ticketsCount - y.ticketsCount;
      if (order === "desc") c = -c;
      if (c === 0) c = compareMatchNumberOrder(x.matchNum, y.matchNum, "asc");
    }
    if (c !== 0) return c;
    const tie = x.sortOrder - y.sortOrder;
    if (tie !== 0) return tie;
    return x.id - y.id;
  });
}

const getHomeSockAggregates = unstable_cache(
  async (eventIds: number[], kind: HomeSockKind) => {
    if (eventIds.length === 0) {
      return { sockAgg: [], sockAggByCategory: [] } as const;
    }
    const where = {
      eventId: { in: eventIds },
      kind,
    } satisfies Prisma.SockAvailableWhereInput;
    const [sockAgg, sockAggByCategory] = await Promise.all([
      prisma.sockAvailable.groupBy({
        by: ["eventId"],
        where,
        _count: { _all: true },
        _min: { amount: true },
      }),
      prisma.sockAvailable.groupBy({
        by: ["eventId", "categoryName"],
        where,
        _min: { amount: true },
      }),
    ]);
    return { sockAgg, sockAggByCategory } as const;
  },
  ["home-sock-aggregates-v2"],
  { revalidate: 5 },
);

const getHomeEventCategoryCounts = unstable_cache(
  async (eventIds: number[]) => {
    if (eventIds.length === 0) return [] as { eventId: number; categoryCount: number; blockCount: number }[];

    // `shop_event_category` is a high-cardinality catalogue table; for the home grid we only need
    // distinct counts, not the full per-event hierarchy (loaded lazily on demand).
    return prisma.$queryRaw<{ eventId: number; categoryCount: number; blockCount: number }[]>(
      Prisma.sql`
        SELECT
          "event_id" as "eventId",
          COUNT(DISTINCT "category_id")::int as "categoryCount",
          COUNT(DISTINCT "category_block_id")::int as "blockCount"
        FROM "shop_event_category"
        WHERE "event_id" IN (${Prisma.join(eventIds)})
        GROUP BY "event_id"
      `,
    );
  },
  ["home-event-category-counts-v2"],
  { revalidate: 60 },
);

const getHomeLatestDiffLogs = unstable_cache(
  async (
    eventIds: number[],
    kind: HomeSockKind,
  ): Promise<Array<{ eventId: number; createdAt: Date; newCount: number; priceChangedCount: number }>> => {
    if (eventIds.length === 0) return [];
    return prisma.$queryRaw<Array<{ eventId: number; createdAt: Date; newCount: number; priceChangedCount: number }>>(
      Prisma.sql`
        SELECT DISTINCT ON ("event_id")
          "event_id" as "eventId",
          "created_at" as "createdAt",
          "new_count" as "newCount",
          "price_changed_count" as "priceChangedCount"
        FROM "sock_available_webhook_diff_logs"
        WHERE "event_id" IN (${Prisma.join(eventIds)})
          AND kind::text = ${kind}
        ORDER BY "event_id" ASC, "created_at" DESC
      `,
    );
  },
  ["home-latest-diff-logs-v1"],
  { revalidate: 5 },
);

const getHomeMissingPriceSeatSummary = unstable_cache(
  async (
    eventIds: number[],
    kind: HomeSockKind,
    perEventSampleLimit: number,
  ): Promise<{
    counts: Array<{ eventId: number; count: number }>;
    samples: Array<{ eventId: number } & MissingPriceSeatSample>;
  }> => {
    if (eventIds.length === 0) return { counts: [], samples: [] };
    const where = {
      eventId: { in: eventIds },
      kind,
      amount: null,
    } satisfies Prisma.SockAvailableWhereInput;

    const countsRaw = await prisma.sockAvailable.groupBy({
      by: ["eventId"],
      where,
      _count: { _all: true },
    });

    const samples = await prisma.$queryRaw<Array<{ eventId: number } & MissingPriceSeatSample>>(
      Prisma.sql`
        SELECT
          t.event_id as "eventId",
          t.seatid as "seatId",
          t.seat_number as "seatNumber",
          t.row as "row",
          t.block_name as "blockName",
          t.category_id as "categoryId"
        FROM (
          SELECT
            event_id,
            seatid,
            seat_number,
            row,
            block_name,
            category_id,
            updated_at,
            ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY updated_at DESC) as rn
          FROM sock_available
          WHERE event_id IN (${Prisma.join(eventIds)})
            AND kind::text = ${kind}
            AND amount IS NULL
        ) t
        WHERE t.rn <= ${perEventSampleLimit}
        ORDER BY t.event_id ASC, t.updated_at DESC
      `,
    );

    return {
      counts: countsRaw.map((r) => ({ eventId: r.eventId, count: r._count._all })),
      samples,
    };
  },
  ["home-missing-price-seat-summary-v1"],
  { revalidate: 5 },
);

export async function HomePage({
  searchParams,
  kind,
  onlyBuyingCriteriaMeet,
  onlyMissingPrice,
}: {
  searchParams: Promise<HomeSearchParams>;
  kind: HomeSockKind;
  onlyBuyingCriteriaMeet: boolean;
  onlyMissingPrice: boolean;
}) {
  const q = await searchParams;
  const prefsRaw = firstQs(q.prefsErr);
  const prefsErr = prefsRaw ?? undefined;
  const { sort: listSort, order: listOrder } = parseHomeListSort(q);
  const sockKind = kind;
  const buyingCriteriaMeetActive = onlyBuyingCriteriaMeet;
  const missingPriceActive = onlyMissingPrice;
  const importantFilter = parseImportantFilter(q);
  const venueFilter = parseHomeVenueFilter(q);
  const countryFilter = parseHomeCountryFilter(q);
  const boxofficePort = process.env.BOXOFFICE_WS_PORT ?? "3020";
  const showBoxofficeControls =
    process.env.NODE_ENV === "development" ||
    /^(1|true|yes)$/i.test((process.env.BOXOFFICE_WS_SHOW_IN_PROD ?? "").trim());

  let dbErr: string | undefined;
  let eventsAll: HomeEventRow[];
  let events: HomeEventRow[];
  let buyingCriteriaFilteredOutAll = false;
  let missingPriceFilteredOutAll = false;
  try {
    const rows = await prisma.event.findMany({
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
    });

    const eventIds = rows.map((r) => r.id);
    const [{ sockAgg, sockAggByCategory }, categoryCounts, buyingCriteriaPriceLimitRules] = await Promise.all([
      getHomeSockAggregates(eventIds, sockKind),
      getHomeEventCategoryCounts(eventIds),
      prisma.eventBuyingCriteriaRule.findMany({
        where: { eventId: { in: eventIds }, maxPriceUsdCents: { not: null } },
        select: { eventId: true, categoryNum: true, maxPriceUsdCents: true },
      }),
    ]);

    const countsByEventId = new Map<number, { categoryCount: number; blockCount: number }>();
    for (const r of categoryCounts) {
      countsByEventId.set(r.eventId, { categoryCount: r.categoryCount, blockCount: r.blockCount });
    }

    const limitByEventId = new Map<number, { 1: number | null; 2: number | null; 3: number | null; 4: number | null }>();
    for (const r of buyingCriteriaPriceLimitRules) {
      const cat = r.categoryNum;
      if (cat !== 1 && cat !== 2 && cat !== 3 && cat !== 4) continue;
      const cents = r.maxPriceUsdCents;
      if (cents == null) continue;
      const prev = limitByEventId.get(r.eventId) ?? { 1: null, 2: null, 3: null, 4: null };
      const existing = prev[cat];
      prev[cat] = existing == null ? cents : Math.min(existing, cents);
      limitByEventId.set(r.eventId, prev);
    }

    const byEvent = new Map<number, { ticketsCount: number; lowestPriceCents: string | null }>();
    for (const g of sockAgg) {
      const minAmt = g._min.amount;
      byEvent.set(g.eventId, {
        ticketsCount: g._count._all,
        lowestPriceCents: minAmt != null ? sockAmountRawToCentsString(minAmt.toString()) : null,
      });
    }

    const catMinByEvent = new Map<
      number,
      { cat1: string | null; cat2: string | null; cat3: string | null; cat4: string | null }
    >();
    for (const g of sockAggByCategory) {
      const catNum = catNumberFromSockCategoryName(g.categoryName);
      if (!catNum) continue;
      const cents = g._min.amount != null ? sockAmountRawToCentsString(g._min.amount.toString()) : null;
      const prev = catMinByEvent.get(g.eventId) ?? { cat1: null, cat2: null, cat3: null, cat4: null };
      const key = catNum === 1 ? "cat1" : catNum === 2 ? "cat2" : catNum === 3 ? "cat3" : "cat4";
      const prevVal = prev[key];
      if (!prevVal) {
        prev[key] = cents;
      } else if (cents) {
        const a = priceToNumber(prevVal);
        const b = priceToNumber(cents);
        if (Number.isFinite(a) && Number.isFinite(b) && b < a) prev[key] = cents;
      }
      catMinByEvent.set(g.eventId, prev);
    }

    eventsAll = rows.map((e) => {
      const agg = byEvent.get(e.id);
      const counts = countsByEventId.get(e.id);
      const cats = catMinByEvent.get(e.id);
      const limits = limitByEventId.get(e.id);
      return {
        ...e,
        matchNum: parseEventMatchNumber(e.matchLabel, e.name),
        ticketsCount: agg?.ticketsCount ?? 0,
        lowestPriceCents: agg?.lowestPriceCents ?? null,
        cat1: cats?.cat1 ?? null,
        cat2: cats?.cat2 ?? null,
        cat3: cats?.cat3 ?? null,
        cat4: cats?.cat4 ?? null,
        cat1LimitUsdCents: limits?.[1] ?? null,
        cat2LimitUsdCents: limits?.[2] ?? null,
        cat3LimitUsdCents: limits?.[3] ?? null,
        cat4LimitUsdCents: limits?.[4] ?? null,
        categoryCount: counts?.categoryCount ?? 0,
        blockCount: counts?.blockCount ?? 0,
        latestDiff: null,
      };
    });

    const venueQ = venueFilter.trim().toLowerCase();
    const countryQ = countryFilter.trim().toLowerCase();

    const filteredByVenueCountry = eventsAll.filter((e) => {
      if (venueQ && String(e.venue ?? "").trim().toLowerCase() !== venueQ) return false;
      if (countryQ && String(e.country ?? "").trim().toLowerCase() !== countryQ) return false;
      return true;
    });

    events =
      importantFilter === "important"
        ? filteredByVenueCountry.filter((e) => e.isImportant)
        : importantFilter === "notImportant"
          ? filteredByVenueCountry.filter((e) => !e.isImportant)
          : filteredByVenueCountry;

    const beforeMissingPriceFilter = events;
    if (missingPriceActive) {
      events = beforeMissingPriceFilter.filter((e) => {
        const t = e.lowestPriceCents?.trim();
        return !t;
      });
      missingPriceFilteredOutAll = beforeMissingPriceFilter.length > 0 && events.length === 0;
    }

    const meetsBuyingCriteria = (e: HomeEventRow): boolean => {
      const checks: Array<[priceCentsString: string | null, limitUsdCents: number | null]> = [
        [e.cat1, e.cat1LimitUsdCents],
        [e.cat2, e.cat2LimitUsdCents],
        [e.cat3, e.cat3LimitUsdCents],
        [e.cat4, e.cat4LimitUsdCents],
      ];
      for (const [priceStr, limit] of checks) {
        if (!priceStr || limit == null) continue;
        const priceCents = priceToNumber(priceStr);
        if (Number.isFinite(priceCents) && priceCents <= limit) return true;
      }
      return false;
    };

    const beforeBuyingCriteriaFilter = events;
    if (buyingCriteriaMeetActive) {
      events = beforeBuyingCriteriaFilter.filter(meetsBuyingCriteria);
      buyingCriteriaFilteredOutAll = beforeBuyingCriteriaFilter.length > 0 && events.length === 0;
    }
    sortHomeEvents(events, listSort, listOrder);
  } catch (err) {
    eventsAll = [];
    events = [];
    buyingCriteriaFilteredOutAll = false;
    missingPriceFilteredOutAll = false;
    const msg = err instanceof Error ? err.message : String(err);
    dbErr =
      "Could not load events from the database. Check DATABASE_URL, that Postgres is running, and run migrations if needed. " +
      `(${msg})`;
  }

  const suggestedSortOrder = eventsAll.length === 0 ? 1 : Math.max(...eventsAll.map((e) => e.sortOrder)) + 1;

  const venueOptions = distinctNonEmptyCaseInsensitive(eventsAll.map((e) => e.venue));
  const countryOptions = distinctNonEmptyCaseInsensitive(eventsAll.map((e) => e.country));

  const totalTickets = events.reduce((acc, e) => acc + e.ticketsCount, 0);
  const homeResaleActive = sockKind === "RESALE";
  const homeShopActive = sockKind === "LAST_MINUTE";

  const homeKindHref = (nextKind: HomeSockKind): string => {
    const base = homeBasePathForKind(nextKind);
    const qs = homeQueryStringFrom(q);
    return `${base}${qs ? `?${qs}` : ""}#home-events-heading`;
  };

  const homeBuyingCriteriaMeetHref = (nextActive: boolean): string => {
    const base = homeBasePathForKind(sockKind);
    const sp = new URLSearchParams(homeQueryStringFrom(q));
    if (nextActive) sp.set("bc", "1");
    else sp.delete("bc");
    const qs = sp.toString();
    return `${base}${qs ? `?${qs}` : ""}#home-events-heading`;
  };

  const homeMissingPriceHref = (nextActive: boolean): string => {
    const base = homeBasePathForKind(sockKind);
    const sp = new URLSearchParams(homeQueryStringFrom(q));
    if (nextActive) sp.set("mp", "1");
    else sp.delete("mp");
    const qs = sp.toString();
    return `${base}${qs ? `?${qs}` : ""}#home-events-heading`;
  };

  const noTicketsTitle = "No sock_available rows synced for this event yet";
  const noPriceTitle = "No sock_available amounts available";

  const missingPriceSeatSampleLimit = 25;

  if (missingPriceActive && !dbErr && events.length > 0) {
    const listedEventIds = events.map((e) => e.id);
    const { counts, samples } = await getHomeMissingPriceSeatSummary(
      listedEventIds,
      sockKind,
      missingPriceSeatSampleLimit,
    );

    const countByEventId = new Map<number, number>();
    for (const c of counts) countByEventId.set(c.eventId, c.count);

    const samplesByEventId = new Map<number, MissingPriceSeatSample[]>();
    for (const s of samples) {
      const bucket = samplesByEventId.get(s.eventId);
      const item: MissingPriceSeatSample = {
        seatId: s.seatId,
        seatNumber: s.seatNumber,
        row: s.row,
        blockName: s.blockName,
        categoryId: s.categoryId,
      };
      if (bucket) bucket.push(item);
      else samplesByEventId.set(s.eventId, [item]);
    }

    events = events.map((e) => ({
      ...e,
      missingPriceSeatCount: countByEventId.get(e.id) ?? 0,
      missingPriceSeatSamples: samplesByEventId.get(e.id) ?? [],
    }));
  }

  if (!dbErr && events.length > 0) {
    const listedEventIds = events.map((e) => e.id);
    const latest = await getHomeLatestDiffLogs(listedEventIds, sockKind);
    const byEventId = new Map<number, { createdAt: Date; newCount: number; priceChangedCount: number }>();
    for (const r of latest) {
      byEventId.set(r.eventId, { createdAt: r.createdAt, newCount: r.newCount, priceChangedCount: r.priceChangedCount });
    }
    events = events.map((e) => ({ ...e, latestDiff: byEventId.get(e.id) ?? null }));
  }

  const alertShell =
    "rounded-xl border border-red-400/30 bg-[color:color-mix(in_oklab,red_12%,transparent)] px-4 py-3 text-sm text-red-200 shadow-sm shadow-black/30 ring-1 ring-red-500/15";

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
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
            <div className="absolute right-4 top-4 flex flex-col items-end gap-2 sm:right-8 sm:top-6">
              <div className="flex items-center gap-2">
                <Link
                  href="/buying-criteria"
                  className="rounded-md bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-3 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-white/10 hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)]"
                >
                  Buying criteria
                </Link>
                <Link
                  href="/listing-changes"
                  className="rounded-md bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 ring-1 ring-white/10 hover:bg-sky-500/20"
                >
                  Changes
                </Link>
                <Link
                  href="/undetectable"
                  className="rounded-md bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-100 ring-1 ring-white/10 hover:bg-sky-500/20"
                >
                  Undetectable
                </Link>
                <Link
                  href="/gmail"
                  className="rounded-md bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-3 py-1.5 text-xs font-medium text-zinc-100 ring-1 ring-white/10 hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)]"
                >
                  Gmail
                </Link>
              </div>
              {showBoxofficeControls ? <BoxofficeControlsClient port={boxofficePort} /> : null}
            </div>
            <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)]">
                2026 FIFA WORLD CUP{" "}
                <span className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,white_40%)]">·</span> Live
                ticket tracker
              </p>

              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.04] lg:text-6xl">
                All World Cup tickets, <span className="text-[color:var(--ticketing-accent)]">in one place.</span>
              </h1>

              <p className="mt-4 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
                Browse resale marketplace listings and official face-value Last Minute Sales drops across every match.
                Sort by price and filter by stage, venue, or country.
              </p>

              <dl
                className="mt-10 grid w-full max-w-3xl grid-cols-3 divide-x divide-white/[0.10] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/25 px-2 py-4 shadow-inner shadow-black/35 ring-1 ring-white/[0.05]"
                aria-label="Schedule totals"
              >
                <div className="px-4 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Tickets{sockKind === "RESALE" ? " (Resale)" : " (Shop)"}
                  </dt>
                  <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[color:color-mix(in_oklab,var(--ticketing-accent)_88%,white_8%)] sm:text-4xl">
                    {totalTickets.toLocaleString("en-US")}
                  </dd>
                </div>
                <div className="px-4 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Matches</dt>
                  <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">
                    {events.length.toLocaleString("en-US")}
                  </dd>
                </div>
                <div className="px-4 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Sources</dt>
                  <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-white sm:text-4xl">1</dd>
                </div>
              </dl>

              <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href={homeKindHref("LAST_MINUTE")}
                  className={
                    homeShopActive
                      ? "group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:var(--ticketing-accent)] px-6 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      : "group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  }
                >
                  Browse Last Minute Sales
                  <span
                    className={
                      homeShopActive
                        ? "rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-950/90"
                        : "rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]"
                    }
                  >
                    New
                  </span>
                  <span className="text-zinc-950/80 transition-transform group-hover:translate-x-0.5" aria-hidden>
                    →
                  </span>
                </Link>
                <Link
                  href={homeKindHref("RESALE")}
                  className={
                    homeResaleActive
                      ? "inline-flex min-h-11 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:var(--ticketing-accent)] px-6 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      : "inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  }
                >
                  Browse Resale Marketplace
                </Link>
                <Link
                  href={homeBuyingCriteriaMeetHref(!buyingCriteriaMeetActive)}
                  className={
                    buyingCriteriaMeetActive
                      ? "inline-flex min-h-11 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:var(--ticketing-accent)] px-6 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      : "inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  }
                >
                  Buying Criteria
                </Link>
                <Link
                  href={homeMissingPriceHref(!missingPriceActive)}
                  className={
                    missingPriceActive
                      ? "inline-flex min-h-11 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:var(--ticketing-accent)] px-6 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      : "inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  }
                >
                  Missing price
                </Link>
              </div>
            </div>
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <section aria-labelledby="home-events-heading" className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 id="home-events-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
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
                    <HomeEventSortControls
                      sort={listSort}
                      order={listOrder}
                      important={importantFilter}
                      venueOptions={venueOptions}
                      countryOptions={countryOptions}
                      venue={venueFilter}
                      country={countryFilter}
                    />
                  </Suspense>
                </div>
              </div>

              {!dbErr && events.length === 0 ? (
                <div
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]"
                  role="status"
                >
                  <div className="px-4 py-14 text-center sm:px-6 sm:py-16">
                    <div className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-black/25 px-5 py-8 ring-1 ring-white/[0.04]">
                      {eventsAll.length === 0 ? (
                        <>
                          <p className="text-base font-semibold tracking-tight text-zinc-100">No matches yet</p>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                            Create an event to start building your schedule. Sock availability and catalogue categories
                            will populate after webhook or import.
                          </p>
                        </>
                      ) : missingPriceFilteredOutAll ? (
                        <>
                          <p className="text-base font-semibold tracking-tight text-zinc-100">No events missing price</p>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                            Try turning off Missing price to see all events.
                          </p>
                        </>
                      ) : buyingCriteriaFilteredOutAll ? (
                        <>
                          <p className="text-base font-semibold tracking-tight text-zinc-100">
                            No events meet Buying Criteria
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                            Try turning off the filter, or increasing your max prices on the Buying Criteria page.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-base font-semibold tracking-tight text-zinc-100">No results</p>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                            No events match your current filters. Try clearing filters or adjusting sort/venue/country.
                          </p>
                        </>
                      )}
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        {eventsAll.length === 0 ? <AddEventDialog suggestedSortOrder={suggestedSortOrder} /> : null}
                        {buyingCriteriaMeetActive ? (
                          <Link
                            href={homeBuyingCriteriaMeetHref(false)}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          >
                            Show all events
                          </Link>
                        ) : null}
                        {missingPriceActive ? (
                          <Link
                            href={homeMissingPriceHref(false)}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          >
                            Show all events
                          </Link>
                        ) : null}
                        {eventsAll.length > 0 && !buyingCriteriaMeetActive && !missingPriceActive ? (
                          <Link
                            href={`${homeBasePathForKind(sockKind)}#home-events-heading`}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-6 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          >
                            Clear filters
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : !dbErr ? (
                <>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0 lg:hidden" aria-labelledby="home-events-heading">
                    {events.map((event, idx) => {
                      const hasTickets = event.ticketsCount > 0;
                      const hasPrice = Boolean(event.lowestPriceCents);
                      const priceLabel = hasPrice && event.lowestPriceCents ? formatUsd(event.lowestPriceCents) : "—";
                      const priceTitle = hasTickets ? (hasPrice ? undefined : noPriceTitle) : noTicketsTitle;
                      const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                      const location = [event.venue, event.country]
                        .map((v) => v?.trim())
                        .filter(Boolean)
                        .join(" · ");
                      const missingSeatCount = event.missingPriceSeatCount ?? 0;
                      const missingSeatSamples = event.missingPriceSeatSamples ?? [];
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
                                    <Link href={`/events/${event.id}?kind=LAST_MINUTE`} className={eventNameLinkClass}>
                                      {event.name}
                                    </Link>
                                  </h3>
                                </div>
                                {location ? <p className="text-xs leading-relaxed text-zinc-500">{location}</p> : null}
                                {missingPriceActive ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_26%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)]">
                                        Missing price seats: {missingSeatCount.toLocaleString("en-US")}
                                      </span>
                                      {!hasTickets ? (
                                        <span className="text-[11px] font-medium text-zinc-500">No sock rows</span>
                                      ) : null}
                                    </div>
                                    {missingSeatCount > 0 ? (
                                      <details className="group rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 ring-1 ring-white/[0.04]">
                                        <summary className="cursor-pointer select-none text-[11px] font-semibold text-zinc-200 hover:text-white">
                                          View seatIds
                                        </summary>
                                        <div className="mt-2 space-y-1.5">
                                          <ul className="space-y-1">
                                            {missingSeatSamples.map((s) => (
                                              <li
                                                key={`${s.seatId}|${s.blockName}|${s.row}|${s.seatNumber}|${s.categoryId}`}
                                                className="text-[11px] text-zinc-300"
                                              >
                                                <span className="font-mono text-zinc-200">{s.seatId}</span>
                                                <span className="text-zinc-600"> · </span>
                                                <span className="text-zinc-400">
                                                  {s.blockName} · row {s.row} · seat {s.seatNumber} · cat {s.categoryId}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                          {missingSeatCount > missingSeatSamples.length ? (
                                            <p className="text-[11px] text-zinc-500">
                                              …and {(missingSeatCount - missingSeatSamples.length).toLocaleString("en-US")} more
                                            </p>
                                          ) : null}
                                        </div>
                                      </details>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                                <EditEventDialog event={event} venueOptions={venueOptions} />
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
                                  className="mt-0.5 tabular-nums font-bold text-[color:var(--ticketing-accent)]"
                                  title={priceTitle}
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
                                  title={!hasTickets ? noTicketsTitle : undefined}
                                >
                                  {event.ticketsCount.toLocaleString("en-US")}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Cat1
                                </dt>
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat1,
                                    event.cat1LimitUsdCents,
                                  );
                                  return (
                                    <dd
                                      className={`mt-0.5 font-bold tabular-nums ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </dd>
                                  );
                                })()}
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Cat2
                                </dt>
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat2,
                                    event.cat2LimitUsdCents,
                                  );
                                  return (
                                    <dd
                                      className={`mt-0.5 font-bold tabular-nums ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </dd>
                                  );
                                })()}
                              </div>
                              <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Cat3
                                </dt>
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat3,
                                    event.cat3LimitUsdCents,
                                  );
                                  return (
                                    <dd
                                      className={`mt-0.5 font-bold tabular-nums ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </dd>
                                  );
                                })()}
                              </div>
                              <div className="col-span-2 sm:col-span-1">
                                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                  Cat4
                                </dt>
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat4,
                                    event.cat4LimitUsdCents,
                                  );
                                  return (
                                    <dd
                                      className={`mt-0.5 font-bold tabular-nums ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </dd>
                                  );
                                })()}
                              </div>
                            </dl>

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
                    Lowest price is the minimum sock_available amount (USD, amount/1000). Ticket counts reflect
                    sock_available rows. Tap category totals to open the hierarchy dialog.
                  </p>

                  <div className="hidden overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04] lg:block">
                    <div className="relative max-h-[min(70vh,52rem)] overflow-auto overscroll-contain">
                      <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
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
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Cat1
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Cat2
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Cat3
                            </th>
                            <th scope="col" className="px-3 py-3.5 sm:px-4">
                              Cat4
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
                            const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                            const hasTickets = event.ticketsCount > 0;
                            const hasPrice = Boolean(event.lowestPriceCents);
                            const priceLabel = hasPrice && event.lowestPriceCents ? formatUsd(event.lowestPriceCents) : "—";
                            const priceTitle = hasTickets ? (hasPrice ? undefined : noPriceTitle) : noTicketsTitle;
                            const missingSeatCount = event.missingPriceSeatCount ?? 0;
                            const missingSeatSamples = event.missingPriceSeatSamples ?? [];
                            return (
                              <tr
                                key={event.id}
                                className={`border-t border-white/[0.06] transition-colors hover:bg-[color:color-mix(in_oklab,white_9%,transparent)] ${zebra}`}
                              >
                                <td className="whitespace-nowrap px-3 py-3 align-middle pl-4 font-mono text-xs text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] sm:px-4 sm:pl-5">
                                  {event.matchLabel}
                                </td>
                                <td className="max-w-[16rem] px-3 py-3 align-middle sm:max-w-none sm:px-4">
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <Link
                                        href={`/events/${event.id}?kind=LAST_MINUTE`}
                                        className={`${eventNameLinkClass} min-w-0 truncate`}
                                      >
                                        {event.name}
                                      </Link>
                                      <EditEventDialog event={event} venueOptions={venueOptions} />
                                    </div>
                                    {missingPriceActive ? (
                                      <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_26%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)]">
                                            Missing price seats: {missingSeatCount.toLocaleString("en-US")}
                                          </span>
                                          {!hasTickets ? (
                                            <span className="text-[10px] font-medium text-zinc-500">No sock rows</span>
                                          ) : null}
                                        </div>
                                        {missingSeatCount > 0 ? (
                                          <details className="group max-w-[22rem] rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 ring-1 ring-white/[0.04]">
                                            <summary className="cursor-pointer select-none text-[10px] font-semibold text-zinc-200 hover:text-white">
                                              View seatIds
                                            </summary>
                                            <div className="mt-2 space-y-1">
                                              <ul className="space-y-1">
                                                {missingSeatSamples.map((s) => (
                                                  <li
                                                    key={`${s.seatId}|${s.blockName}|${s.row}|${s.seatNumber}|${s.categoryId}`}
                                                    className="text-[10px] text-zinc-300"
                                                  >
                                                    <span className="font-mono text-zinc-200">{s.seatId}</span>
                                                    <span className="text-zinc-600"> · </span>
                                                    <span className="text-zinc-400">
                                                      {s.blockName} · row {s.row} · seat {s.seatNumber} · cat {s.categoryId}
                                                    </span>
                                                  </li>
                                                ))}
                                              </ul>
                                              {missingSeatCount > missingSeatSamples.length ? (
                                                <p className="text-[10px] text-zinc-500">
                                                  …and {(missingSeatCount - missingSeatSamples.length).toLocaleString("en-US")} more
                                                </p>
                                              ) : null}
                                            </div>
                                          </details>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 align-middle sm:px-4">
                                  <div className="flex items-center gap-3">
                                    <EventImportantToggle
                                      eventId={event.id}
                                      eventName={event.name}
                                      isImportant={event.isImportant}
                                      hideLabel
                                    />
                                    {event.latestDiff ? (
                                      <div className="flex min-w-0 flex-col gap-0.5">
                                        <span className={diffPillClass()}>
                                          New-
                                          <span className="font-extrabold tabular-nums text-[color:var(--ticketing-accent)]">
                                            {event.latestDiff.newCount}
                                          </span>{" "}
                                          <span className="text-zinc-400">&amp;</span> Price-
                                          <span className="font-extrabold tabular-nums text-[color:var(--ticketing-accent)]">
                                            {event.latestDiff.priceChangedCount}
                                          </span>
                                        </span>
                                        {(() => {
                                          const when = formatDiffWhen(event.latestDiff.createdAt);
                                          return when ? (
                                            <span className="text-[10px] tabular-nums text-zinc-500">{when}</span>
                                          ) : null;
                                        })()}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-zinc-500">—</span>
                                    )}
                                  </div>
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
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat1,
                                    event.cat1LimitUsdCents,
                                  );
                                  return (
                                    <td
                                      className={`max-w-[12rem] px-3 py-3 align-middle font-bold tabular-nums sm:px-4 ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </td>
                                  );
                                })()}
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat2,
                                    event.cat2LimitUsdCents,
                                  );
                                  return (
                                    <td
                                      className={`max-w-[12rem] px-3 py-3 align-middle font-bold tabular-nums sm:px-4 ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </td>
                                  );
                                })()}
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat3,
                                    event.cat3LimitUsdCents,
                                  );
                                  return (
                                    <td
                                      className={`max-w-[12rem] px-3 py-3 align-middle font-bold tabular-nums sm:px-4 ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </td>
                                  );
                                })()}
                                {(() => {
                                  const { label, withinLimit } = cellUsdWithLimitFromCentsString(
                                    event.cat4,
                                    event.cat4LimitUsdCents,
                                  );
                                  return (
                                    <td
                                      className={`max-w-[12rem] px-3 py-3 align-middle font-bold tabular-nums sm:px-4 ${
                                        withinLimit ? "font-extrabold text-emerald-400" : "text-[color:var(--ticketing-accent)]"
                                      }`}
                                    >
                                      {label}
                                    </td>
                                  );
                                })()}
                                <td
                                  className="whitespace-nowrap px-3 py-3 text-right align-middle font-bold tabular-nums text-[color:var(--ticketing-accent)] sm:px-4"
                                  title={priceTitle}
                                >
                                  {priceLabel}
                                </td>
                                <td
                                  className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums text-zinc-200 sm:px-4"
                                  title={!hasTickets ? noTicketsTitle : undefined}
                                >
                                  {event.ticketsCount.toLocaleString("en-US")}
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
                      Lowest price uses the minimum sock_available amount (USD, amount/1000). Ticket counts are rows in
                      sock_available.
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

