import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ListingChangesClient, type ListingChangesEventRow } from "@/app/listing-changes/listing-changes-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function Page() {
  const events = await prisma.event.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, matchLabel: true, name: true },
  });

  const eventIds = events.map((e) => e.id);
  const latest =
    eventIds.length > 0
      ? await prisma.sockAvailableWebhookDiffLog.findMany({
          where: {
            eventId: { in: eventIds },
            kind: { in: ["RESALE", "LAST_MINUTE"] as const },
          },
          distinct: ["eventId", "kind"],
          orderBy: [{ eventId: "asc" }, { kind: "asc" }, { createdAt: "desc" }],
          select: {
            eventId: true,
            kind: true,
            createdAt: true,
            newCount: true,
            changedCount: true,
            priceChangedCount: true,
          },
        })
      : [];

  const latestByEventId = new Map<number, { RESALE?: (typeof latest)[number]; LAST_MINUTE?: (typeof latest)[number] }>();
  for (const row of latest) {
    const bucket = latestByEventId.get(row.eventId) ?? {};
    if (row.kind === "RESALE") bucket.RESALE = row;
    else bucket.LAST_MINUTE = row;
    latestByEventId.set(row.eventId, bucket);
  }

  const rows: ListingChangesEventRow[] = events.map((e) => {
    const bucket = latestByEventId.get(e.id);
    const resale = bucket?.RESALE;
    const shop = bucket?.LAST_MINUTE;
    return {
      id: e.id,
      matchLabel: e.matchLabel,
      name: e.name,
      latestResale: resale
        ? {
            createdAt: resale.createdAt.toISOString(),
            newCount: resale.newCount,
            changedCount: resale.changedCount,
            priceChangedCount: resale.priceChangedCount,
          }
        : null,
      latestShop: shop
        ? {
            createdAt: shop.createdAt.toISOString(),
            newCount: shop.newCount,
            changedCount: shop.changedCount,
            priceChangedCount: shop.priceChangedCount,
          }
        : null,
    };
  });

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Listing changes</p>
            <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              New listings and price changes
            </h1>
            <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-500">
              Click a match to see the most recent sock-available webhook diffs and which listing keys were added.
            </p>
          </div>
          <div className="shrink-0">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div className="border-b border-white/[0.06] px-4 py-4 sm:px-6">
            <p className="text-xs leading-relaxed text-zinc-500">
              <span className="font-semibold text-zinc-200">{rows.length.toLocaleString("en-US")}</span> events · Shop =
              LAST_MINUTE · Resale = RESALE
            </p>
          </div>
          <ListingChangesClient events={rows} />
        </div>
      </div>
    </div>
  );
}

