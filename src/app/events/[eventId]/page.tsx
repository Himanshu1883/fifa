import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeatListingsPanel } from "./seat-listings-panel";
import { SockAvailablePanel } from "./sock-available-panel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function extractNewKeysFromDiffJson(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const key = (raw as { key?: unknown }).key;
    if (typeof key !== "string") continue;
    const trimmed = key.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return Array.from(new Set(out));
}

const eventDetailSelect = {
  id: true,
  prefId: true,
  resalePrefId: true,
  matchLabel: true,
  name: true,
} as const;

/** Segment is DB `id` when all digits; otherwise treat as `prefId` (string). Redirects canonicalize to `/events/{id}`. */
async function resolveEventDetail(rawSegment: string) {
  const trimmed = rawSegment.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const id = Number.parseInt(trimmed, 10);
    const byId = await prisma.event.findUnique({
      where: { id },
      select: eventDetailSelect,
    });
    if (byId) return { event: byId };
    const byPref = await prisma.event.findFirst({
      where: { prefId: trimmed },
      select: eventDetailSelect,
      orderBy: { id: "asc" },
    });
    return byPref ? { event: byPref } : null;
  }

  const byPref = await prisma.event.findFirst({
    where: { prefId: trimmed },
    select: eventDetailSelect,
    orderBy: { id: "asc" },
  });
  return byPref ? { event: byPref } : null;
}

async function resolveEventDetailMeta(rawSegment: string) {
  const trimmed = rawSegment.trim();
  if (!trimmed) return null;
  const sel = { id: true, matchLabel: true, name: true } as const;

  if (/^\d+$/.test(trimmed)) {
    const id = Number.parseInt(trimmed, 10);
    const byId = await prisma.event.findUnique({ where: { id }, select: sel });
    if (byId) return byId;
    return prisma.event.findFirst({
      where: { prefId: trimmed },
      select: sel,
      orderBy: { id: "asc" },
    });
  }

  return prisma.event.findFirst({
    where: { prefId: trimmed },
    select: sel,
    orderBy: { id: "asc" },
  });
}

export async function generateMetadata({ params }: Props) {
  const { eventId: rawId } = await params;
  const event = await resolveEventDetailMeta(rawId);
  return {
    title: event ? `${event.matchLabel} — ${event.name}` : "Event",
  };
}

function readFirstStringParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return typeof v === "string" ? v : null;
}

type PanelKey = "listings" | "sock";
function normalizePanelKey(raw: string | null): PanelKey {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "listings" || v === "listing" || v === "seats" || v === "seat-listings") return "listings";
  if (!v) return "sock";
  if (v === "sock" || v === "sock-available" || v === "sock_available") return "sock";
  return "sock";
}

type SockKindKey = "" | "RESALE" | "LAST_MINUTE";
function normalizeSockKind(raw: string | null): SockKindKey {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "resale") return "RESALE";
  if (v === "last_minute" || v === "last-minute" || v === "lastminute" || v === "lm") return "LAST_MINUTE";
  return "";
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { eventId: rawId } = await params;
  const query = searchParams ? await searchParams : {};
  const panel = normalizePanelKey(readFirstStringParam(query.panel));
  const initialSockKind = normalizeSockKind(readFirstStringParam(query.kind));
  const resaleCtaActive = initialSockKind === "RESALE";
  const lastMinuteCtaActive = initialSockKind === "LAST_MINUTE" || initialSockKind === "";

  const trimmed = rawId.trim();
  if (!trimmed) notFound();

  const resolved = await resolveEventDetail(trimmed);
  if (!resolved) notFound();

  const { event } = resolved;
  const canonical = String(event.id);
  if (trimmed !== canonical) {
    const sp = new URLSearchParams();
    if (panel !== "sock") sp.set("panel", panel);
    const suffix = sp.size ? `?${sp.toString()}` : "";
    redirect(`/events/${canonical}${suffix}`);
  }

  // Default to LAST_MINUTE when `kind` is missing.
  if (!initialSockKind) {
    const sp = new URLSearchParams();
    if (panel !== "sock") sp.set("panel", panel);
    sp.set("kind", "LAST_MINUTE");
    redirect(`/events/${event.id}?${sp.toString()}`);
  }

  const [seatListingsCount, sockAvailableCount, eventCategoryCounts] = await Promise.all([
    prisma.eventSeatListing.count({ where: { eventId: event.id } }),
    prisma.sockAvailable.count({ where: { eventId: event.id } }),
    Promise.all([
      prisma.eventCategory.groupBy({ by: ["categoryId"], where: { eventId: event.id } }),
      prisma.eventCategory.count({ where: { eventId: event.id } }),
    ]).then(([cats, rows]) => ({ distinctCategories: cats.length, catalogueRows: rows })),
  ]);

  const hasSeatListings = seatListingsCount > 0;
  const effectivePanel: PanelKey = hasSeatListings ? panel : "sock";
  if (!hasSeatListings && panel === "listings") {
    redirect(`/events/${event.id}`);
  }

  const [sockResaleCount, sockLastMinuteCount] = await Promise.all([
    prisma.sockAvailable.count({ where: { eventId: event.id, kind: "RESALE" } }),
    prisma.sockAvailable.count({ where: { eventId: event.id, kind: "LAST_MINUTE" } }),
  ]);

  const seatListingsTruncated = false;

  const listingsPayload =
    effectivePanel === "listings"
      ? (
          await prisma.eventSeatListing.findMany({
            where: { eventId: event.id },
            select: {
              id: true,
              seatCategoryId: true,
              seatCategoryName: true,
              categoryBlockId: true,
              categoryBlockName: true,
              rowLabel: true,
              seatNumber: true,
              amount: true,
              areaId: true,
              areaName: true,
              contingentId: true,
            },
            orderBy: [
              { seatCategoryId: "asc" },
              { seatCategoryName: "asc" },
              { categoryBlockName: "asc" },
              { categoryBlockId: "asc" },
              { rowLabel: "asc" },
              { seatNumber: "asc" },
            ],
          })
        ).map((r) => ({
          id: r.id,
          seatCategoryId: r.seatCategoryId,
          seatCategoryName: r.seatCategoryName,
          categoryBlockId: r.categoryBlockId,
          categoryBlockName: r.categoryBlockName,
          rowLabel: r.rowLabel,
          seatNumber: r.seatNumber,
          amount: r.amount.toString(),
          areaId: r.areaId,
          areaName: r.areaName,
          contingentId: r.contingentId,
        }))
      : [];

  const eventCategoriesPayload =
    effectivePanel === "listings"
      ? (
          await prisma.eventCategory.findMany({
            where: { eventId: event.id },
            select: {
              categoryId: true,
              categoryName: true,
              categoryBlockId: true,
              categoryBlockName: true,
            },
            orderBy: [{ categoryId: "asc" }, { categoryBlockId: "asc" }],
          })
        ).map((c) => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          categoryBlockId: c.categoryBlockId,
          categoryBlockName: c.categoryBlockName,
        }))
      : [];

  const sockAvailablePayload =
    effectivePanel === "sock"
      ? (
          await prisma.sockAvailable.findMany({
            where: { eventId: event.id },
            select: {
              id: true,
              amount: true,
              areaName: true,
              blockName: true,
              contingentId: true,
              row: true,
              seatNumber: true,
              seatId: true,
              resaleMovementId: true,
              categoryName: true,
              categoryId: true,
              areaId: true,
              blockId: true,
              kind: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: [
              { categoryId: "asc" },
              { blockName: "asc" },
              { row: "asc" },
              { seatNumber: "asc" },
              { resaleMovementId: "asc" },
            ],
          })
        ).map((r) => ({
          id: r.id,
          amount: r.amount?.toString() ?? null,
          areaName: r.areaName,
          blockName: r.blockName,
          contingentId: r.contingentId,
          row: r.row,
          seatNumber: r.seatNumber,
          seatId: r.seatId,
          resaleMovementId: r.resaleMovementId,
          categoryName: r.categoryName,
          categoryId: r.categoryId,
          areaId: r.areaId,
          blockId: r.blockId,
          kind: r.kind,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }))
      : [];

  const latestSockDiffNewKeysByKind =
    effectivePanel === "sock"
      ? await prisma.sockAvailableWebhookDiffLog.findMany({
          where: {
            eventId: event.id,
            kind: { in: ["RESALE", "LAST_MINUTE"] as const },
          },
          distinct: ["kind"],
          orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
          select: { kind: true, newSeatIds: true },
        })
      : [];

  const latestDiffNewKeysByKind: { RESALE: string[]; LAST_MINUTE: string[] } = { RESALE: [], LAST_MINUTE: [] };
  for (const row of latestSockDiffNewKeysByKind) {
    if (row.kind === "RESALE") latestDiffNewKeysByKind.RESALE = extractNewKeysFromDiffJson(row.newSeatIds);
    else latestDiffNewKeysByKind.LAST_MINUTE = extractNewKeysFromDiffJson(row.newSeatIds);
  }

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />
      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
          <nav aria-label="Breadcrumb" className="shrink-0">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] outline-offset-4 ring-1 ring-white/[0.04] transition-colors hover:border-[color:color-mix(in_oklab,var(--ticketing-accent)_24%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] hover:text-[color:color-mix(in_oklab,var(--ticketing-accent)_78%,white_10%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)]"
            >
              <span aria-hidden className="text-sm leading-none opacity-80">
                ←
              </span>
              Matches
            </Link>
          </nav>

          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--ticketing-accent)_75%,transparent)] to-transparent"
              aria-hidden
            />

            <header className="relative px-4 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-7">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]">
                      Match
                    </span>
                    <span className="rounded-full border border-white/[0.1] bg-black/25 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-zinc-300 ring-1 ring-white/[0.05]">
                      {event.matchLabel}
                    </span>
                    <span className="hidden text-zinc-600 sm:inline" aria-hidden>
                      ·
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:inline">
                      Resale inventory
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2.15rem] lg:leading-tight">
                      {event.name}
                    </h1>
                    <p className="max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      Search and filter through listings. Consecutive seats merge into a single row.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/events/${event.id}?kind=LAST_MINUTE`}
                      className={
                        lastMinuteCtaActive
                          ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          : "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      }
                    >
                      <span>Browse Last Minute Sales</span>
                      <span
                        className={
                          lastMinuteCtaActive
                            ? "inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-950/90 ring-1 ring-black/10"
                            : "inline-flex items-center gap-1 rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]"
                        }
                      >
                        New <span aria-hidden>→</span>
                      </span>
                    </Link>
                    <Link
                      href={`/events/${event.id}?kind=RESALE`}
                      className={
                        resaleCtaActive
                          ? "inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          : "inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      }
                    >
                      Browse Resale Marketplace
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/25 px-2.5 py-1 text-[10px] text-zinc-400 ring-1 ring-white/[0.04]"
                      title={event.prefId}
                    >
                      <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-500">
                        Pref
                      </span>
                      <span className="min-w-0 truncate font-mono text-zinc-300">{event.prefId}</span>
                    </span>
                    {event.resalePrefId ? (
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/25 px-2.5 py-1 text-[10px] text-zinc-400 ring-1 ring-white/[0.04]"
                        title={event.resalePrefId}
                      >
                        <span className="shrink-0 font-semibold uppercase tracking-wide text-zinc-500">
                          Resale
                        </span>
                        <span className="min-w-0 truncate font-mono text-zinc-300">
                          {event.resalePrefId}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  className={`grid w-full shrink-0 gap-2.5 lg:max-w-[28rem] ${
                    hasSeatListings ? "grid-cols-3" : "grid-cols-2"
                  }`}
                >
                  {hasSeatListings ? (
                    <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-3 ring-1 ring-white/[0.04]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Seat listings
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white sm:text-xl">
                        {seatListingsCount.toLocaleString("en-US")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">rows loaded</p>
                    </div>
                  ) : null}
                  <div
                    className="rounded-xl border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3.5 py-3 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)]"
                    title={`${eventCategoryCounts.catalogueRows.toLocaleString("en-US")} catalogue rows (category×block)`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,white_25%)]">
                      Categories
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50 sm:text-xl">
                      {eventCategoryCounts.distinctCategories.toLocaleString("en-US")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,white_25%)]">
                      distinct categories
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-3 ring-1 ring-white/[0.04]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Sock available
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-white sm:text-xl">
                      {sockAvailableCount.toLocaleString("en-US")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      <span className="tabular-nums text-zinc-400">{sockResaleCount.toLocaleString("en-US")}</span>
                      <span> resale</span>
                      <span className="text-zinc-700"> · </span>
                      <span className="tabular-nums text-zinc-400">{sockLastMinuteCount.toLocaleString("en-US")}</span>
                      <span> last‑minute</span>
                    </p>
                  </div>
                </div>
              </div>
            </header>

            {hasSeatListings ? (
              <div className="border-t border-white/[0.06] px-4 py-3 sm:px-7 sm:py-3.5">
                <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div
                    className="flex w-full rounded-xl bg-black/40 p-1 ring-1 ring-white/[0.08] sm:w-auto"
                    role="tablist"
                    aria-label="Event sections"
                  >
                    <Link
                      role="tab"
                      aria-selected={effectivePanel === "listings"}
                      href={`/events/${event.id}?panel=listings`}
                      className={
                        effectivePanel === "listings"
                          ? "flex flex-1 items-center justify-center gap-2 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] px-3 py-2 text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:flex-none"
                          : "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:flex-none"
                      }
                    >
                      Listings
                      <span
                        className={
                          effectivePanel === "listings"
                            ? "rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_20%,transparent)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-100"
                            : "rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-400"
                        }
                        aria-hidden
                      >
                        {seatListingsCount.toLocaleString("en-US")}
                      </span>
                    </Link>
                    <Link
                      role="tab"
                      aria-selected={effectivePanel === "sock"}
                      href={`/events/${event.id}`}
                      className={
                        effectivePanel === "sock"
                          ? "flex flex-1 items-center justify-center gap-2 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] px-3 py-2 text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:flex-none"
                          : "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] sm:flex-none"
                      }
                    >
                      Sock available
                      <span
                        className={
                          effectivePanel === "sock"
                            ? "rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_20%,transparent)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-100"
                            : "rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-400"
                        }
                        aria-hidden
                      >
                        {sockAvailableCount.toLocaleString("en-US")}
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-t border-white/[0.06] px-0 pb-6 pt-4 sm:pb-7">
              {effectivePanel === "sock" ? (
                <SockAvailablePanel
                  rows={sockAvailablePayload}
                  embedInParentCard
                  initialKind={initialSockKind}
                  latestDiffNewKeysByKind={latestDiffNewKeysByKind}
                />
              ) : (
                <SeatListingsPanel
                  listings={listingsPayload}
                  eventCategories={eventCategoriesPayload}
                  truncated={seatListingsTruncated}
                  totalCount={seatListingsCount}
                  embedInParentCard
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
