import Link from "next/link";
import { MatchDiscordWebhooksClient } from "@/app/discord-match-webhooks/match-discord-webhooks-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DiscordMatchWebhooksPage() {
  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-12 pt-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Notifications
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Per-match Discord webhooks
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-500">
              Route resale and LMS data to each match&apos;s Discord channel (all 104 matches).
            </p>
          </div>
          <Link
            href="/webhook-logs"
            className="inline-flex shrink-0 items-center rounded-lg border border-white/[0.10] bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/[0.10]"
          >
            Webhook logs
          </Link>
        </div>
        <MatchDiscordWebhooksClient />
      </div>
    </div>
  );
}
