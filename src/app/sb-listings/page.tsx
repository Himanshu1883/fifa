import { SbListingsCatalogClient } from "@/app/sb-listings/sb-listings-catalog-client";
import { getSeatsBrokersConfig } from "@/lib/seatsbrokers-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SB Listings — Matches",
  description: "SeatsBrokers listings by match — active and deleted",
};

export default function SbListingsPage() {
  const sbConfigured = Boolean(getSeatsBrokersConfig());

  return <SbListingsCatalogClient sbConfigured={sbConfigured} />;
}
