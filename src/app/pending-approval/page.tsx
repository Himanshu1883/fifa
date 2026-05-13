import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/logout";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pending approval",
};

export default async function PendingApprovalPage() {
  const session = await getSession();
  if (!session) redirect("/login?msg=signin_required&next=%2Fpending-approval");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color:var(--ticketing-surface)] via-[color:color-mix(in_oklab,var(--ticketing-surface)_70%,var(--ticketing-surface-elevated)_30%)] to-[color:var(--ticketing-surface-elevated)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-medium tracking-wide text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]">
            Event catalogue
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Pending approval</h1>
          <p className="text-sm text-zinc-400">
            Your account is signed in, but an admin still needs to approve access.
          </p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-md">
          <p className="text-sm text-zinc-300">
            Signed in as <span className="font-medium text-zinc-100">{session.name}</span>
          </p>
          <p className="mt-3 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-4 py-3 text-sm text-[color:color-mix(in_oklab,var(--ticketing-accent)_78%,white_18%)]">
            If you believe this is a mistake, contact an administrator.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-200 underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              Back to sign in
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg bg-white/[0.08] px-4 py-2 text-sm font-semibold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.12]"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

