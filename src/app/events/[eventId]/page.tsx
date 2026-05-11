import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeatListingsPanel } from "./seat-listings-panel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
};

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

export default async function EventDetailPage({ params }: Props) {
  const { eventId: rawId } = await params;
  const trimmed = rawId.trim();
  if (!trimmed) notFound();

  const resolved = await resolveEventDetail(trimmed);
  if (!resolved) notFound();

  const { event } = resolved;
  const canonical = String(event.id);
  if (trimmed !== canonical) {
    redirect(`/events/${canonical}`);
  }

  const seatListings = await prisma.eventSeatListing.findMany({
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
  });
  const seatListingsTruncated = false;
  const seatListingsTotal = seatListings.length;

  const eventCategoriesRaw = await prisma.eventCategory.findMany({
    where: { eventId: event.id },
    select: {
      categoryId: true,
      categoryName: true,
      categoryBlockId: true,
      categoryBlockName: true,
    },
    orderBy: [{ categoryId: "asc" }, { categoryBlockId: "asc" }],
  });
  const eventCategoriesPayload = eventCategoriesRaw.map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    categoryBlockId: c.categoryBlockId,
    categoryBlockName: c.categoryBlockName,
  }));

  const listingsPayload = seatListings.map((r) => ({
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
  }));

  const categoryIds = new Set(
    listingsPayload.map((r) => String(r.seatCategoryId).trim()).filter(Boolean),
  );

  return (
    <div className="min-h-screen bg-[#070a09] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,rgba(52,211,153,0.13),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(52,211,153,0.06),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />
      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <nav aria-label="Breadcrumb" className="shrink-0">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300/95 outline-offset-4 ring-1 ring-white/[0.04] transition-colors hover:border-emerald-500/25 hover:bg-emerald-500/10 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400/55"
          >
            <span aria-hidden className="text-sm leading-none opacity-80">
              ←
            </span>
            Matches
          </Link>
        </nav>

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"
            aria-hidden
          />
          <header className="relative px-4 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/95 ring-1 ring-emerald-400/30">
                    Match
                  </span>
                  <span className="rounded-full border border-white/[0.1] bg-black/25 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-zinc-300 ring-1 ring-white/[0.05]">
                    {event.matchLabel}
                  </span>
                  <span className="hidden text-zinc-600 sm:inline" aria-hidden>
                    ·
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:inline">
                    Seat listings
                  </span>
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-[2.15rem] lg:leading-tight">
                    {event.name}
                  </h1>
                  <p className="max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                    Resale inventory — search, sort, filter by category, stage, or contingent.
                    Consecutive seats merge into one row.
                  </p>
                </div>
              </div>

              <div
                className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-[min(100%,26rem)] lg:justify-end"
                aria-label="Load summary"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-black/35 px-2.5 py-1 text-[11px] font-medium tabular-nums text-zinc-200 ring-1 ring-white/[0.05]">
                  <span className="font-semibold text-zinc-500">Loaded</span>
                  {listingsPayload.length.toLocaleString("en-US")}
                  {seatListingsTruncated ? (
                    <span className="text-zinc-500">
                      / {seatListingsTotal.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-emerald-200/95 ring-1 ring-emerald-400/25">
                  <span className="font-semibold text-emerald-400/80">Categories</span>
                  {categoryIds.size.toLocaleString("en-US")}
                </span>
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
          </header>

          <div className="border-t border-white/[0.06] px-0 pb-5 pt-0 sm:px-0 sm:pb-6">
            <SeatListingsPanel
              listings={listingsPayload}
              eventCategories={eventCategoriesPayload}
              truncated={seatListingsTruncated}
              totalCount={seatListingsTotal}
              embedInParentCard
            />
          </div>
        </div>
      </div>
    </div>
  );
}
