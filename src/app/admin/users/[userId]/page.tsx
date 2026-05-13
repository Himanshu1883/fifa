import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminViewer } from "@/lib/auth/require-viewer";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ userId: string }>;
};

function parseUserId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export default async function AdminUserDetailPage({ params }: Props) {
  await requireAdminViewer();

  const { userId: raw } = await params;
  const userId = parseUserId(raw);
  if (!userId) notFound();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      googleEmail: true,
      isAdmin: true,
      isApproved: true,
      approvedAt: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  const audits = await prisma.userLoginAudit.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, createdAt: true, ip: true, userAgent: true, method: true },
  });

  return (
    <div className="min-h-screen bg-[color:var(--ticketing-surface)] text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{user.username}</h1>
            {user.googleEmail ? <p className="mt-1 text-sm text-zinc-400">{user.googleEmail}</p> : null}
          </div>
          <Link
            href="/admin/users"
            className="rounded-md bg-white/[0.08] px-3 py-2 text-sm font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
          >
            Back to users
          </Link>
        </header>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
          <h2 className="text-sm font-semibold text-zinc-200">Profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Created</dt>
              <dd className="mt-1 text-sm text-zinc-200">{user.createdAt.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Approved</dt>
              <dd className="mt-1 text-sm text-zinc-200">
                {user.isApproved ? "Yes" : "No"}
                {user.approvedAt ? <span className="text-zinc-400"> · {user.approvedAt.toLocaleString()}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</dt>
              <dd className="mt-1 text-sm text-zinc-200">{user.isAdmin ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-sm font-semibold text-zinc-200">Login audit (last 25)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-6 py-3">When</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">IP</th>
                  <th className="px-6 py-3">User-Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {audits.map((a) => (
                  <tr key={a.id} className="hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-xs text-zinc-300">{a.createdAt.toLocaleString()}</td>
                    <td className="px-6 py-4 text-xs text-zinc-300">{a.method}</td>
                    <td className="px-6 py-4 text-xs text-zinc-400">{a.ip ?? "—"}</td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      <span className="block max-w-[80ch] truncate" title={a.userAgent ?? ""}>
                        {a.userAgent ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
                {audits.length === 0 ? (
                  <tr>
                    <td className="px-6 py-5 text-sm text-zinc-500" colSpan={4}>
                      No login events recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

