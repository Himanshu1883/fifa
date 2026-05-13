import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { BuyingCriteriaEditor } from "@/app/buying-criteria/BuyingCriteriaEditor";

export const runtime = "nodejs";

export default async function BuyingCriteriaPage() {
  const session = await getSession();
  if (!session) redirect("/login?msg=buying_criteria_signin_required&next=%2Fbuying-criteria");
  const userId = Number(session.sub);
  if (!Number.isInteger(userId) || userId <= 0) redirect("/login?msg=buying_criteria_signin_required&next=%2Fbuying-criteria");

  const events = await prisma.event.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, matchLabel: true, name: true },
  });

  const eventStubs = events.map((e) => ({ id: e.id, matchLabel: e.matchLabel, name: e.name }));

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-18%,var(--ticketing-accent-dim),transparent_52%),radial-gradient(ellipse_55%_45%_at_100%_0%,color-mix(in_oklab,var(--ticketing-accent)_10%,transparent),transparent_45%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(255,255,255,0.03),transparent_50%)]"
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col gap-4 px-4 pb-12 pt-6 sm:gap-5 sm:px-6 sm:pb-14 sm:pt-7">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.04] backdrop-blur-md">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[color:color-mix(in_oklab,var(--ticketing-accent)_70%,transparent)] to-transparent"
            aria-hidden
          />

          <header className="relative px-4 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/"
                className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
              >
                Back to schedule
              </Link>
            </div>

            <div
              className="mt-6 h-px w-full bg-gradient-to-r from-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] via-white/[0.12] to-transparent"
              aria-hidden
            />
          </header>

          <div className="border-t border-white/[0.06] px-4 pb-6 pt-5 sm:px-8 sm:pb-8">
            <BuyingCriteriaEditor events={eventStubs} />
          </div>
        </div>
      </div>
    </div>
  );
}

