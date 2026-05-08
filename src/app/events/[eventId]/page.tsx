import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { eventId: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    return { title: "Event" };
  }
  const event = await prisma.event.findUnique({
    where: { id },
    select: { matchLabel: true, name: true },
  });
  return {
    title: event ? `${event.matchLabel} — ${event.name}` : "Event",
  };
}

export default async function EventDetailPage({ params }: Props) {
  const { eventId: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const event = await prisma.event.findUnique({
    where: { id },
    include: { categories: { orderBy: { id: "asc" } } },
  });

  if (!event) notFound();

  const { categories } = event;

  return (
    <div className="min-h-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 text-zinc-100">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-10 px-4 py-14 sm:px-8">
        <nav aria-label="Breadcrumb">
          <Link
            href="/"
            className="text-sm font-medium text-emerald-400/90 transition-colors hover:text-emerald-300"
          >
            ← All matches
          </Link>
        </nav>

        <header className="space-y-3 border-b border-white/10 pb-8">
          <p className="font-mono text-sm text-emerald-300/90">{event.matchLabel}</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight">{event.name}</h1>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400">
            <div>
              <dt className="inline text-zinc-500">Pref ID:</dt>{" "}
              <dd className="inline font-mono text-zinc-300">{event.prefId}</dd>
            </div>
            {event.resalePrefId ? (
              <div>
                <dt className="inline text-zinc-500">Resale pref ID:</dt>{" "}
                <dd className="inline font-mono text-zinc-300">{event.resalePrefId}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-zinc-500">Categories:</dt>{" "}
              <dd className="inline text-zinc-300">{categories.length}</dd>
            </div>
          </dl>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-zinc-100">Categories &amp; blocks</h2>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 backdrop-blur-md">
            {categories.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-400">
                No categories for this event yet. Seed them against pref ID{" "}
                <span className="font-mono text-emerald-300/90">{event.prefId}</span> in{" "}
                <span className="font-mono text-zinc-300">prisma/seed.ts</span>, then run{" "}
                <span className="font-mono text-zinc-300">npx prisma db seed</span>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[36rem] w-full border-collapse text-left text-sm">
                  <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Category name</th>
                      <th className="px-4 py-3 font-semibold">Block name</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Block ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.04]"
                      >
                        <td className="px-4 py-3 text-zinc-100">{row.categoryName}</td>
                        <td className="px-4 py-3 text-zinc-100">{row.categoryBlockName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-zinc-200">
                          {row.categoryBlockId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {categories.length > 0 ? (
              <footer className="border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
                {categories.length} row{categories.length === 1 ? "" : "s"}
              </footer>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
