import Link from "next/link";
import { WebhookLogsClient } from "@/app/webhook-logs/webhook-logs-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function WebhookLogsPage() {
  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Notifications</p>
            <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Webhook logs
            </h1>
            <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-zinc-500">
              SHOP and Resale Discord webhooks, plus full request/response payloads per notify.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10]"
          >
            Back
          </Link>
        </div>

        <WebhookLogsClient />
      </div>
    </div>
  );
}
