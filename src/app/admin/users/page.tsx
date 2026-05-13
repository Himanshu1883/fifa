import Link from "next/link";
import { requireAdminViewer } from "@/lib/auth/require-viewer";
import { prisma } from "@/lib/prisma";
import { createUserAction, setUserAdminAction, setUserApprovedAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ error?: string | string[]; created?: string | string[] }>;
};

function firstQs(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function describeError(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v === "invalid_input") return "Enter a valid username and password.";
  if (v === "username_taken") return "That username is already taken.";
  if (v === "create_failed") return "Failed to create user.";
  if (v === "invalid_user") return "Invalid user id.";
  if (v === "cannot_change_self") return "You can’t change your own admin/approval flags here.";
  return v.slice(0, 120);
}

function describeCreated(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v === "1") return "User created.";
  return null;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const viewer = await requireAdminViewer();

  const sp = searchParams ? await searchParams : {};
  const error = describeError(firstQs(sp.error));
  const created = describeCreated(firstQs(sp.created));

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      username: true,
      googleEmail: true,
      isAdmin: true,
      isApproved: true,
      approvedAt: true,
      createdAt: true,
      loginAudits: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { ip: true, userAgent: true, createdAt: true, method: true },
      },
    },
  });

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Signed in as <span className="font-medium text-zinc-200">{viewer.username}</span>
            </p>
          </div>
        </header>

        {(error || created) && (
          <div className="mt-6">
            {error ? (
              <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            {created ? (
              <p className="mt-3 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-4 py-3 text-sm text-zinc-100" role="status">
                {created}
              </p>
            ) : null}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
          <h2 className="text-sm font-semibold text-zinc-200">Create user</h2>
          <form action={createUserAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="username" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                maxLength={64}
                className="w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                maxLength={256}
                className="w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="isApproved" className="h-4 w-4 accent-[color:var(--ticketing-accent)]" />
              Approved
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="isAdmin" className="h-4 w-4 accent-[color:var(--ticketing-accent)]" />
              Admin
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-[color:var(--ticketing-accent)] px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-[filter] hover:brightness-[1.06]"
              >
                Create user
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-zinc-200">All users</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Flags</th>
                  <th className="px-6 py-3">Last login</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((u) => {
                  const last = u.loginAudits[0] ?? null;
                  const self = u.id === viewer.id;
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.03]">
                      <td className="px-6 py-4 align-top">
                        <div className="font-medium text-zinc-100">
                          <Link href={`/admin/users/${u.id}`} className="hover:underline">
                            {u.username}
                          </Link>
                        </div>
                        {u.googleEmail ? <div className="text-xs text-zinc-500">{u.googleEmail}</div> : null}
                        <div className="mt-1 text-xs text-zinc-500">Created {u.createdAt.toLocaleString()}</div>
                      </td>

                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                              u.isApproved
                                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/25"
                                : "bg-amber-500/10 text-amber-200 ring-amber-500/25"
                            }`}
                          >
                            {u.isApproved ? "Approved" : "Pending"}
                          </span>
                          {u.isAdmin ? (
                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/25">
                              Admin
                            </span>
                          ) : (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-white/10">
                              User
                            </span>
                          )}
                        </div>
                        {u.approvedAt ? (
                          <div className="mt-2 text-xs text-zinc-500">Approved {u.approvedAt.toLocaleString()}</div>
                        ) : null}
                      </td>

                      <td className="px-6 py-4 align-top">
                        {last ? (
                          <div className="space-y-1">
                            <div className="text-xs text-zinc-400">{last.createdAt.toLocaleString()}</div>
                            <div className="text-xs text-zinc-500">
                              {last.method}
                              {last.ip ? <> · {last.ip}</> : null}
                            </div>
                            {last.userAgent ? (
                              <div className="max-w-[42ch] truncate text-xs text-zinc-600" title={last.userAgent}>
                                {last.userAgent}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          <form action={setUserApprovedAction}>
                            <input type="hidden" name="userId" value={String(u.id)} />
                            <input type="hidden" name="approved" value={u.isApproved ? "0" : "1"} />
                            <button
                              type="submit"
                              disabled={self}
                              className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {u.isApproved ? "Unapprove" : "Approve"}
                            </button>
                          </form>

                          <form action={setUserAdminAction}>
                            <input type="hidden" name="userId" value={String(u.id)} />
                            <input type="hidden" name="admin" value={u.isAdmin ? "0" : "1"} />
                            <button
                              type="submit"
                              disabled={self}
                              className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {u.isAdmin ? "Remove admin" : "Make admin"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

