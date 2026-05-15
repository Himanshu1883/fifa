"use client";

import { useEffect, useId, useMemo, useState } from "react";

type Kind = "RESALE" | "LAST_MINUTE";

export type ListingChangesEventRow = {
  id: number;
  matchLabel: string;
  name: string;
  latestShop: {
    createdAt: string;
    newCount: number;
    changedCount: number;
    priceChangedCount: number;
  } | null;
  latestResale: {
    createdAt: string;
    newCount: number;
    changedCount: number;
    priceChangedCount: number;
  } | null;
};

type NewSeatId = {
  key: string;
  seatId: string;
  resaleMovementId: string | null;
};

type LogRow = {
  id: number;
  createdAt: string;
  eventId: number;
  kind: Kind;
  prefId: string;
  newCount: number;
  changedCount: number;
  priceChangedCount: number;
  newSeatIds: NewSeatId[] | null;
  sample: unknown;
  notifyAttempted: boolean | null;
  notifyOk: boolean | null;
  notifyProvider: string | null;
  notifyStatus: string | null;
  notifyError: string | null;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function pillClass(active: boolean): string {
  return active
    ? "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_26%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)]"
    : "inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-500 ring-1 ring-white/[0.04]";
}

function countsLabel(v: { newCount: number; priceChangedCount: number } | null): string {
  if (!v) return "—";
  return `New ${v.newCount} · Price ${v.priceChangedCount}`;
}

export function ListingChangesClient({ events }: { events: ListingChangesEventRow[] }) {
  const [open, setOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const titleId = useId();

  const activeEvent = useMemo(() => events.find((e) => e.id === activeEventId) ?? null, [activeEventId, events]);

  const byKind = useMemo(() => {
    const out: Record<Kind, LogRow[]> = { LAST_MINUTE: [], RESALE: [] };
    for (const r of rows ?? []) out[r.kind].push(r);
    return out;
  }, [rows]);

  const close = () => {
    setOpen(false);
    setActiveEventId(null);
    setRows(null);
    setError(null);
    setLoading(false);
  };

  const openFor = (e: ListingChangesEventRow) => {
    setActiveEventId(e.id);
    setActiveLabel(`${e.matchLabel} · ${e.name}`);
    setRows(null);
    setError(null);
    setLoading(true);
    setOpen(true);
  };

  useEffect(() => {
    if (!open || activeEventId == null) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/listing-changes?eventId=${encodeURIComponent(String(activeEventId))}&limit=25`, {
          signal: ac.signal,
        });
        const json = (await res.json()) as { ok: boolean; rows?: LogRow[]; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Failed to load logs");
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setLoading(false);
      } catch (err) {
        if (ac.signal.aborted) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => ac.abort();
  }, [open, activeEventId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <div className="relative max-h-[min(72vh,56rem)] overflow-auto overscroll-contain">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-20 border-b border-white/[0.1] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,white_3%)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[color:color-mix(in_oklab,var(--ticketing-surface)_88%,transparent)]">
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 pl-4 font-mono sm:px-4 sm:pl-6">
                Match
              </th>
              <th scope="col" className="min-w-[14rem] px-3 py-3.5 sm:px-4">
                Event
              </th>
              <th scope="col" className="min-w-[14rem] px-3 py-3.5 sm:px-4">
                Shop (LAST_MINUTE)
              </th>
              <th scope="col" className="min-w-[14rem] px-3 py-3.5 pr-4 sm:px-4 sm:pr-6">
                Resale
              </th>
            </tr>
          </thead>
          <tbody className="text-zinc-200">
            {events.map((e, idx) => {
              const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
              return (
                <tr
                  key={e.id}
                  className={`border-t border-white/[0.06] transition-colors hover:bg-[color:color-mix(in_oklab,white_9%,transparent)] ${zebra}`}
                >
                  <td className="whitespace-nowrap px-3 py-3 align-middle pl-4 font-mono text-xs text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] sm:px-4 sm:pl-6">
                    {e.matchLabel}
                  </td>
                  <td className="px-3 py-3 align-middle sm:px-4">
                    <button
                      type="button"
                      onClick={() => openFor(e)}
                      className="min-w-0 max-w-[36rem] truncate text-left font-medium text-sky-300/95 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                    >
                      {e.name}
                    </button>
                  </td>
                  <td className="px-3 py-3 align-middle sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={pillClass(Boolean(e.latestShop))}>{countsLabel(e.latestShop)}</span>
                      <span className="text-[11px] text-zinc-500">{formatWhen(e.latestShop?.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 pr-4 align-middle sm:px-4 sm:pr-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={pillClass(Boolean(e.latestResale))}>{countsLabel(e.latestResale)}</span>
                      <span className="text-[11px] text-zinc-500">{formatWhen(e.latestResale?.createdAt)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[min(92vh,52rem)] w-full max-w-[min(96vw,64rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base font-semibold text-zinc-100">
                    {activeLabel || "Listing changes"}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Showing recent webhook diff logs. Keys look like <span className="font-mono text-zinc-300">m:…</span>{" "}
                    (movement) or <span className="font-mono text-zinc-300">s:…</span> (seat).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => close()}
                  className="rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                >
                  Close
                </button>
              </div>
              {activeEvent ? (
                <p className="mt-3 text-[11px] text-zinc-500">
                  EventId <span className="font-mono text-zinc-300">{activeEvent.id}</span>
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
            </header>

            <div className="max-h-[min(72vh,40rem)] overflow-auto px-5 pb-5 pt-4">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-10 w-full animate-pulse rounded-lg border border-white/[0.06] bg-black/25" />
                  <div className="h-28 w-full animate-pulse rounded-xl border border-white/[0.06] bg-black/25" />
                  <div className="h-28 w-full animate-pulse rounded-xl border border-white/[0.06] bg-black/25" />
                </div>
              ) : (
                <div className="space-y-4">
                  {(["LAST_MINUTE", "RESALE"] as const).map((kind) => {
                    const list = byKind[kind];
                    return (
                      <section
                        key={kind}
                        className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{kind}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {list.length ? `${list.length.toLocaleString("en-US")} rows` : "No logs yet"}
                            </p>
                          </div>
                        </div>
                        {list.length ? (
                          <ul className="divide-y divide-white/[0.06]">
                            {list.map((r) => {
                              const items = Array.isArray(r.newSeatIds) ? r.newSeatIds : [];
                              const shown = items.slice(0, 60);
                              const extra = items.length - shown.length;
                              const notify =
                                r.notifyAttempted != null
                                  ? `Notify: ${r.notifyAttempted ? (r.notifyOk ? "ok" : "failed") : "skipped"}`
                                  : null;
                              return (
                                <li key={r.id} className="px-4 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-xs font-semibold tabular-nums text-zinc-100">
                                        New {r.newCount} · Changed {r.changedCount} · Price {r.priceChangedCount}
                                      </span>
                                      <span className="text-[11px] text-zinc-500">{formatWhen(r.createdAt)}</span>
                                      <span className="text-[11px] text-zinc-500">
                                        pref <span className="font-mono text-zinc-300">{r.prefId}</span>
                                      </span>
                                    </div>
                                    {notify ? (
                                      <span className="text-[11px] text-zinc-500">
                                        {notify}
                                        {r.notifyStatus ? ` (${r.notifyStatus})` : ""}
                                      </span>
                                    ) : null}
                                  </div>

                                  {shown.length ? (
                                    <details className="mt-2 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 ring-1 ring-white/[0.04]">
                                      <summary className="cursor-pointer select-none text-[11px] font-semibold text-zinc-200 hover:text-white">
                                        New listing keys ({items.length.toLocaleString("en-US")})
                                      </summary>
                                      <div className="mt-2">
                                        <ul className="grid gap-1.5 md:grid-cols-2">
                                          {shown.map((x) => (
                                            <li key={x.key} className="text-[11px] text-zinc-300">
                                              <span className="font-mono text-zinc-200">{x.key}</span>
                                              <span className="text-zinc-600"> · </span>
                                              <span className="font-mono text-zinc-300">{x.seatId}</span>
                                            </li>
                                          ))}
                                        </ul>
                                        {extra > 0 ? (
                                          <p className="mt-2 text-[11px] text-zinc-500">
                                            …and {extra.toLocaleString("en-US")} more
                                          </p>
                                        ) : null}
                                      </div>
                                    </details>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

