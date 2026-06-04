import Link from "next/link";

import { SbPushSettingsClient } from "@/app/sb-push-settings/sb-push-settings-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Push rules — Matches",
  description: "SeatsBrokers push grouping and quantity rules",
};

export default function SbPushSettingsPage() {
  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/"
          className="inline-flex text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Matches
        </Link>
        <header className="mt-4 border-b border-white/[0.06] pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            SeatsBrokers
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Push rules</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Control how resale inventory is grouped and how many listings are created per price bucket.
            Changes apply to preview, manual push, auto-push, and scrape-driven deletes.
          </p>
        </header>

        <div className="mt-8">
          <SbPushSettingsClient />
        </div>
      </div>
    </div>
  );
}
