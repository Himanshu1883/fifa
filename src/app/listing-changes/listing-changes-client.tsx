"use client";

import { useEffect, useMemo, useState } from "react";

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
  categoryId?: string;
  categoryName?: string;
  blockName?: string;
  row?: string;
  seatNumber?: string;
  amountRaw?: unknown;
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

function amountRawToUsdLabel(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : typeof raw === "object" && raw && typeof (raw as { toString?: unknown }).toString === "function"
          ? Number(String((raw as { toString: () => unknown }).toString()))
          : NaN;
  if (!Number.isFinite(n)) return "—";
  const usd = n / 1000;
  if (!Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(2)}`;
}

export function ListingChangesClient({ events }: { events: ListingChangesEventRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyWithChanges, setOnlyWithChanges] = useState(false);

  const [expandedEventId, setExpandedEventId] = useState<number | null>(() => {
    const firstActive =
      events.find((e) => (e.latestShop?.newCount ?? 0) > 0 || (e.latestResale?.newCount ?? 0) > 0) ??
      events.find((e) => (e.latestShop?.priceChangedCount ?? 0) > 0 || (e.latestResale?.priceChangedCount ?? 0) > 0) ??
      null;
    return firstActive ? firstActive.id : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LogRow[] | null>(null);

  const expandedEvent = useMemo(
    () => events.find((e) => e.id === expandedEventId) ?? null,
    [expandedEventId, events],
  );

  const byKind = useMemo(() => {
    const out: Record<Kind, LogRow[]> = { LAST_MINUTE: [], RESALE: [] };
    for (const r of rows ?? []) out[r.kind].push(r);
    return out;
  }, [rows]);

  const qNorm = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = events;
    if (onlyWithChanges) {
      list = list.filter((e) => {
        const any = [e.latestShop, e.latestResale].filter(Boolean) as Array<{ newCount: number; priceChangedCount: number }>;
        return any.some((x) => x.newCount > 0 || x.priceChangedCount > 0);
      });
    }
    if (!qNorm) return list;
    return list.filter((e) => {
      const hay = `${e.matchLabel} ${e.name}`.toLowerCase();
      return hay.includes(qNorm);
    });
  }, [events, onlyWithChanges, qNorm]);

  const toggleExpanded = (e: ListingChangesEventRow) => {
    setError(null);
    if (expandedEventId === e.id) {
      setExpandedEventId(null);
      setRows(null);
      setLoading(false);
      return;
    }
    setExpandedEventId(e.id);
    setRows(null);
    setLoading(true);
    setShowNewLimit({ LAST_MINUTE: 12, RESALE: 12 });
  };

  useEffect(() => {
    if (expandedEventId == null) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/listing-changes?eventId=${encodeURIComponent(String(expandedEventId))}&limit=25`, {
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
  }, [expandedEventId]);

  const [showNewLimit, setShowNewLimit] = useState<Record<Kind, number>>({ LAST_MINUTE: 12, RESALE: 12 });

  function renderLog(kind: Kind, log: LogRow | null) {
    const newItems = Array.isArray(log?.newSeatIds) ? log!.newSeatIds : [];
    const shown = newItems.slice(0, showNewLimit[kind]);
    const extra = newItems.length - shown.length;
    const notifyLabel =
      log?.notifyAttempted != null
        ? log.notifyAttempted
          ? log.notifyOk
            ? "Notify: ok"
            : "Notify: failed"
          : "Notify: skipped"
        : null;

    return (
      <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {kind === "LAST_MINUTE" ? "Shop (LAST_MINUTE)" : "Resale"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {log ? (
                <>
                  <span className="font-semibold text-zinc-200">
                    New {log.newCount} · Changed {log.changedCount} · Price {log.priceChangedCount}
                  </span>{" "}
                  <span className="text-zinc-600">·</span> {formatWhen(log.createdAt)}
                </>
              ) : (
                "No logs yet"
              )}
            </p>
          </div>
          {log ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <span>
                pref <span className="font-mono text-zinc-300">{log.prefId}</span>
              </span>
              {notifyLabel ? (
                <span>
                  <span className="text-zinc-600">·</span> {notifyLabel}
                  {log.notifyStatus ? ` (${log.notifyStatus})` : ""}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {log && newItems.length ? (
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold text-zinc-200">New listings</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {shown.map((x) => (
                <div key={x.key} className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
                    <span className="font-semibold text-zinc-100">
                      {x.categoryName?.trim()
                        ? x.categoryName
                        : x.categoryId
                          ? `Cat ${x.categoryId}`
                          : "Category —"}
                    </span>
                    <span className="font-bold tabular-nums text-[color:var(--ticketing-accent)]">
                      {amountRawToUsdLabel(x.amountRaw)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300">{x.blockName ?? "Block —"}</span>
                    <span className="text-zinc-600"> · </span>
                    <span>row {x.row ?? "—"}</span>
                    <span className="text-zinc-600"> · </span>
                    <span>seat {x.seatNumber ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-500">
                Showing <span className="font-semibold text-zinc-200">{shown.length}</span> of{" "}
                <span className="font-semibold text-zinc-200">{newItems.length}</span>
              </p>
              {extra > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setShowNewLimit((s) => ({
                      ...s,
                      [kind]: Math.min(60, s[kind] + 24),
                    }))
                  }
                  className="rounded-lg border border-white/12 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                >
                  Show more
                </button>
              ) : null}
            </div>
          </div>
        ) : log ? (
          <div className="px-4 py-3 text-xs text-zinc-500">No new listings captured for this diff.</div>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label className="w-full sm:max-w-xs">
            <span className="sr-only">Search matches</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search match or event…"
              className="h-10 w-full rounded-lg border border-white/[0.10] bg-black/25 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-inner shadow-black/35 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
            />
          </label>
          <label className="inline-flex select-none items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={onlyWithChanges}
              onChange={(e) => setOnlyWithChanges(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/30 text-[color:var(--ticketing-accent)] focus:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)]"
            />
            Only show matches with changes
          </label>
        </div>
        <p className="text-[11px] text-zinc-500">
          Click a row once to expand (no popup).
        </p>
      </div>

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
            {filtered.map((e, idx) => {
              const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
              const expanded = expandedEventId === e.id;
              const hasAny = Boolean(e.latestShop || e.latestResale);
              const hasDelta =
                (e.latestShop?.newCount ?? 0) > 0 ||
                (e.latestResale?.newCount ?? 0) > 0 ||
                (e.latestShop?.priceChangedCount ?? 0) > 0 ||
                (e.latestResale?.priceChangedCount ?? 0) > 0;
              return (
                <>
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
                        onClick={() => toggleExpanded(e)}
                        className="flex min-w-0 items-center gap-2 text-left font-medium text-sky-300/95 underline-offset-4 transition-colors hover:text-sky-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      >
                        <span className={`text-xs text-zinc-500 ${expanded ? "rotate-180" : ""}`} aria-hidden>
                          ▾
                        </span>
                        <span className="min-w-0 max-w-[36rem] truncate">{e.name}</span>
                        {hasDelta ? (
                          <span className="rounded-full bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]">
                            Updated
                          </span>
                        ) : null}
                        {!hasAny ? <span className="text-[11px] text-zinc-600">No logs</span> : null}
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

                  {expanded ? (
                    <tr className="border-t border-white/[0.06] bg-black/15">
                      <td colSpan={4} className="px-3 py-4 pl-4 sm:px-4 sm:pl-6">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-zinc-100">
                              {e.matchLabel} · {e.name}
                            </p>
                            {expandedEvent ? (
                              <p className="text-[11px] text-zinc-500">
                                EventId <span className="font-mono text-zinc-300">{expandedEvent.id}</span>
                              </p>
                            ) : null}
                          </div>

                          {error && expandedEventId === e.id ? (
                            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                              {error}
                            </p>
                          ) : null}

                          {loading && expandedEventId === e.id ? (
                            <div className="space-y-3">
                              <div className="h-10 w-full animate-pulse rounded-lg border border-white/[0.06] bg-black/25" />
                              <div className="h-28 w-full animate-pulse rounded-xl border border-white/[0.06] bg-black/25" />
                              <div className="h-28 w-full animate-pulse rounded-xl border border-white/[0.06] bg-black/25" />
                            </div>
                          ) : (
                            <div className="grid gap-3 lg:grid-cols-2">
                              {renderLog("LAST_MINUTE", byKind.LAST_MINUTE[0] ?? null)}
                              {renderLog("RESALE", byKind.RESALE[0] ?? null)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

