import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { gmailTokenSecretStatus } from "@/lib/gmail/oauth-env";
import { GmailControlsClient } from "./gmail-controls-client";

export const runtime = "nodejs";

type Props = {
  searchParams: Promise<{ gmailErr?: string | string[]; gmailOk?: string | string[] }>;
};

function firstQs(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export default async function GmailPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login?msg=gmail_signin_required&next=%2Fgmail");
  const userId = Number(session.sub);
  if (!Number.isInteger(userId) || userId <= 0) redirect("/login?msg=gmail_signin_required&next=%2Fgmail");

  const sp = await searchParams;
  const gmailErr = firstQs(sp.gmailErr);
  const gmailOk = firstQs(sp.gmailOk);

  const tokenSecret = gmailTokenSecretStatus();

  const account = await prisma.gmailAccount.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, createdAt: true, updatedAt: true },
  });

  const messageCount = account
    ? await prisma.gmailMessage.count({ where: { gmailAccountId: account.id } })
    : 0;

  const alertShell =
    "rounded-xl border border-red-400/30 bg-[color:color-mix(in_oklab,red_12%,transparent)] px-4 py-3 text-sm text-red-200 shadow-sm shadow-black/30 ring-1 ring-red-500/15";
  const okShell =
    "rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 shadow-sm shadow-black/30 ring-1 ring-emerald-500/10";

  return (
    <div className="min-h-screen bg-[#070a09] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(52,211,153,0.06),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        {gmailErr ? (
          <p className={alertShell} role="alert">
            {gmailErr}
          </p>
        ) : null}
        {gmailOk ? (
          <p className={okShell} role="status">
            {gmailOk}
          </p>
        ) : null}

        {tokenSecret.ok ? null : (
          <p className={alertShell} role="alert">
            {tokenSecret.reason}
          </p>
        )}

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--ticketing-accent)_70%,transparent)] to-transparent"
            aria-hidden
          />

          <header className="relative px-4 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Integrations
                </p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2.125rem] sm:leading-tight">
                  Gmail
                </h1>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
                  Connect a Gmail account, sync recent messages, and persist minimal metadata in Postgres via Prisma.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/"
                  className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
                >
                  Back to schedule
                </Link>
                <Link
                  href="/settings"
                  className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
                >
                  Settings
                </Link>
              </div>
            </div>

            <div
              className="mt-6 h-px w-full bg-gradient-to-r from-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] via-white/[0.12] to-transparent"
              aria-hidden
            />
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="lg:col-span-2">
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]">
                  <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                    <p className="text-sm font-semibold tracking-tight text-white">Account</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {account ? "Connected Gmail account for this user." : "No Gmail account connected yet."}
                    </p>
                  </div>

                  <div className="space-y-4 px-4 py-4 sm:px-5">
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Email</dt>
                        <dd className="mt-1 text-sm font-medium text-zinc-200">{account?.email ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                          Stored messages
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-zinc-200">
                          {account ? messageCount.toLocaleString("en-US") : "—"}
                        </dd>
                      </div>
                    </dl>

                    <GmailControlsClient connected={Boolean(account)} tokenSecretOk={tokenSecret.ok} />
                  </div>
                </div>
              </section>

              <aside className="space-y-3">
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]">
                  <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
                    <p className="text-sm font-semibold tracking-tight text-white">Notes</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Redirect URI must match Google Cloud Console.
                    </p>
                  </div>
                  <div className="space-y-2 px-4 py-4 text-xs leading-relaxed text-zinc-400 sm:px-5">
                    <p>
                      Callback:{" "}
                      <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-zinc-200">
                        /api/gmail/oauth/callback
                      </code>
                    </p>
                    <p>
                      Scopes:{" "}
                      <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-zinc-200">
                        gmail.readonly + openid email
                      </code>
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

