import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createEventWithPrefs, updateEventPrefs } from "@/app/actions/event-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inp =
  "rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

const inpSm =
  "min-w-[9rem] max-w-[12rem] flex-1 rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

type Props = {
  searchParams: Promise<{ prefsErr?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const q = await searchParams;
  const prefsErr = typeof q.prefsErr === "string" ? q.prefsErr : undefined;

  const events = await prisma.event.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: true },
  });

  return (
    <div className="min-h-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 text-zinc-100">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-10 px-4 py-14 sm:px-8">
        <header className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-emerald-400/90">
            Event catalogue
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Matches
          </h1>
          <p className="max-w-xl text-base text-zinc-400">
            Edit pref IDs inline and save each row. Add a match with pref and optional resale catalogue pref —
            opens with no categories until you seed or webhook.
          </p>
        </header>

        {prefsErr ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
            {prefsErr}
          </p>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Add event</h2>
          <form
            action={createEventWithPrefs}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4"
          >
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor="new-name" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Event name <span className="text-emerald-400">*</span>
              </label>
              <input
                id="new-name"
                name="name"
                required
                placeholder="e.g. Team A vs Team B"
                className={inp}
              />
            </div>
            <div className="flex min-w-[7rem] flex-col gap-1">
              <label htmlFor="new-label" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Label
              </label>
              <input
                id="new-label"
                name="matchLabel"
                placeholder="Match72 (optional)"
                className={`${inp} font-mono`}
              />
            </div>
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor="new-pref" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Pref ID <span className="text-emerald-400">*</span>
              </label>
              <input
                id="new-pref"
                name="prefId"
                required
                placeholder="Primary catalogue pref"
                className={`${inp} font-mono`}
              />
            </div>
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor="new-resale" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Resale pref ID
              </label>
              <input
                id="new-resale"
                name="resalePrefId"
                placeholder="Optional"
                className={`${inp} font-mono`}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Add event
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Events</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="min-w-[56rem] w-full border-collapse text-left text-sm">
                <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Label</th>
                    <th className="px-4 py-3 font-semibold">Event name</th>
                    <th className="min-w-[22rem] px-4 py-3 font-semibold">Pref &amp; resale (edit)</th>
                    <th className="px-4 py-3 font-semibold">Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.04]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-emerald-300/90">
                        {event.matchLabel}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/events/${event.id}`}
                          className="font-medium text-sky-300 underline-offset-4 transition-colors hover:text-sky-200 hover:underline"
                        >
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <form
                          action={updateEventPrefs}
                          key={`${event.id}-${event.prefId}-${event.resalePrefId ?? ""}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="id" value={event.id} />
                          <input
                            name="prefId"
                            defaultValue={event.prefId}
                            aria-label={`Pref ID for event ${event.id}`}
                            className={inpSm}
                          />
                          <input
                            name="resalePrefId"
                            defaultValue={event.resalePrefId ?? ""}
                            placeholder="Resale"
                            aria-label={`Resale pref for event ${event.id}`}
                            className={inpSm}
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
                          >
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                        {event.categories.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="border-t border-white/[0.06] px-4 py-3 text-xs text-zinc-500">
              {events.length} events — select a name to view categories
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
