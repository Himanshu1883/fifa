import Link from "next/link";
import { SbListingsCatalogClient } from "@/app/sb-listings/sb-listings-catalog-client";
import { loadSbListingsCatalog } from "@/lib/sb-listings-catalog";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SB Listings — Matches",
  description: "SeatsBrokers listings by match — active and deleted",
};

export default async function SbListingsPage() {
  let matches: Awaited<ReturnType<typeof loadSbListingsCatalog>> = [];
  let loadError: string | null = null;

  try {
    matches = await loadSbListingsCatalog();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const sbConfigured = Boolean(getSeatsBrokersConfig());

  if (loadError) {
    return (
      <div className="min-h-screen bg-[color:var(--ticketing-surface)] px-6 py-12 text-zinc-100">
        <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          Could not load SB listings: {loadError}
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-400 hover:text-zinc-200">
          ← Back to matches
        </Link>
      </div>
    );
  }

  return <SbListingsCatalogClient matches={matches} sbConfigured={sbConfigured} />;
}
