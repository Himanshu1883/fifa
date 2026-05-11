"use client";

import { fetchBuyingCriteriaAction, saveBuyingCriteriaBulkAction, type BuyingCriteriaRow } from "@/app/actions/buying-criteria";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type EventStub = {
  id: number;
  matchLabel: string;
  name: string;
};

type CriteriaState = Omit<BuyingCriteriaRow, "eventId">;

const inp =
  "min-h-9 w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

function defaultCriteria(): CriteriaState {
  return { cat1: "", cat2: "", cat3: "", cat3FrontRow: false, cat4: "" };
}

export function BuyingCriteriaDialog({ events }: { events: EventStub[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dirtyCount, setDirtyCount] = useState(0);
  const [criteriaByEventId, setCriteriaByEventId] = useState<Record<number, CriteriaState>>({});

  const titleId = useId();
  const searchId = useId();
  const dirtyIdsRef = useRef<Set<number>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const fetchSeqRef = useRef(0);

  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const closeDialog = () => {
    fetchSeqRef.current += 1;
    setOpen(false);
  };

  const openDialog = () => {
    setError(null);
    setNote(null);
    setQuery("");
    dirtyIdsRef.current = new Set();
    setDirtyCount(0);

    const base: Record<number, CriteriaState> = {};
    for (const id of eventIds) base[id] = defaultCriteria();
    setCriteriaByEventId(base);

    const seq = (fetchSeqRef.current += 1);
    setLoading(true);
    setOpen(true);
    void (async () => {
      const res = await fetchBuyingCriteriaAction(eventIds);
      if (fetchSeqRef.current !== seq) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCriteriaByEventId((prev) => {
        const next = { ...prev };
        for (const row of res.rows) {
          next[row.eventId] = {
            cat1: row.cat1,
            cat2: row.cat2,
            cat3: row.cat3,
            cat3FrontRow: row.cat3FrontRow,
            cat4: row.cat4,
          };
        }
        return next;
      });
    })();
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      return (
        e.matchLabel.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        `${e.matchLabel} ${e.name}`.toLowerCase().includes(q)
      );
    });
  }, [events, query]);

  const markDirty = (eventId: number) => {
    if (!dirtyIdsRef.current.has(eventId)) {
      dirtyIdsRef.current.add(eventId);
      setDirtyCount(dirtyIdsRef.current.size);
    }
  };

  const updateField = (eventId: number, patch: Partial<CriteriaState>) => {
    setCriteriaByEventId((prev) => {
      const cur = prev[eventId] ?? defaultCriteria();
      const nextRow = { ...cur, ...patch };
      return { ...prev, [eventId]: nextRow };
    });
    markDirty(eventId);
  };

  const canSave = dirtyCount > 0 && !saving && !loading;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setNote(null);

    const dirtyIds = [...dirtyIdsRef.current.values()];
    const payload: BuyingCriteriaRow[] = dirtyIds
      .map((id) => {
        const c = criteriaByEventId[id] ?? defaultCriteria();
        return { eventId: id, ...c };
      })
      .filter((r) => eventsById.has(r.eventId));

    const res = await saveBuyingCriteriaBulkAction(payload);
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    dirtyIdsRef.current = new Set();
    setDirtyCount(0);
    setNote(`Saved ${res.saved.toLocaleString("en-US")} match${res.saved === 1 ? "" : "es"}.`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => openDialog()}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.07] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
      >
        Buying criteria
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) closeDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(92vh,52rem)] w-full max-w-[min(96vw,78rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base font-semibold text-zinc-100">
                    Buying criteria
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Notes per match across categories. CAT 3 front row is a YES flag.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => closeDialog()}
                    disabled={saving}
                    className="rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!canSave}
                    className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : dirtyCount ? `Save (${dirtyCount})` : "Save"}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label htmlFor={searchId} className="sr-only">
                    Search matches
                  </label>
                  <input
                    ref={searchRef}
                    id={searchId}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by match or event…"
                    autoComplete="off"
                    className={`${inp} max-w-xl`}
                  />
                  {loading ? (
                    <span className="text-[11px] font-medium text-zinc-500">Loading…</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Showing <span className="font-semibold text-zinc-200">{filteredEvents.length}</span> /{" "}
                  <span className="font-semibold text-zinc-200">{events.length}</span>
                </p>
              </div>

              {error ? (
                <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
              {note ? (
                <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  {note}
                </p>
              ) : null}
            </header>

            <div className="px-5 pb-5 pt-4">
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]">
                <div className="max-h-[min(62vh,36rem)] overflow-auto overscroll-contain">
                  <table className="min-w-[72rem] w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-20 border-b border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,white_3%)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[color:color-mix(in_oklab,var(--ticketing-surface)_88%,transparent)]">
                      <tr>
                        <th scope="col" className="whitespace-nowrap px-3 py-3 pl-4 font-mono sm:px-4 sm:pl-5">
                          Match
                        </th>
                        <th scope="col" className="min-w-[14rem] px-3 py-3 sm:px-4">
                          Event
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 1
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 2
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 sm:px-4">
                          CAT 3
                        </th>
                        <th scope="col" className="min-w-[10rem] px-3 py-3 text-center sm:px-4">
                          CAT 3 FRONT ROW
                        </th>
                        <th scope="col" className="min-w-[12rem] px-3 py-3 pr-4 sm:px-4 sm:pr-5">
                          CAT 4
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-200">
                      {filteredEvents.map((event, idx) => {
                        const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                        const row = criteriaByEventId[event.id] ?? defaultCriteria();
                        return (
                          <tr
                            key={event.id}
                            className={`border-t border-white/[0.06] transition-colors hover:bg-[color:color-mix(in_oklab,white_9%,transparent)] ${zebra}`}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5 pl-4 align-top font-mono text-[11px] font-semibold text-emerald-300/95 sm:px-4 sm:pl-5">
                              {event.matchLabel}
                            </td>
                            <td className="px-3 py-2.5 align-top text-xs text-zinc-200 sm:px-4">
                              <span className="line-clamp-2">{event.name}</span>
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <input
                                className={inp}
                                value={row.cat1}
                                onChange={(e) => updateField(event.id, { cat1: e.target.value })}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <input
                                className={inp}
                                value={row.cat2}
                                onChange={(e) => updateField(event.id, { cat2: e.target.value })}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <input
                                className={inp}
                                value={row.cat3}
                                onChange={(e) => updateField(event.id, { cat3: e.target.value })}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-3 py-2.5 align-top text-center sm:px-4">
                              <button
                                type="button"
                                onClick={() => updateField(event.id, { cat3FrontRow: !row.cat3FrontRow })}
                                className={`inline-flex min-h-9 w-full items-center justify-center rounded-md border px-2.5 text-xs font-semibold shadow-inner shadow-black/25 ring-1 ring-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] ${
                                  row.cat3FrontRow
                                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                                    : "border-white/10 bg-black/35 text-zinc-400 hover:bg-white/[0.06]"
                                }`}
                                aria-pressed={row.cat3FrontRow}
                              >
                                {row.cat3FrontRow ? "YES" : ""}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 pr-4 align-top sm:px-4 sm:pr-5">
                              <input
                                className={inp}
                                value={row.cat4}
                                onChange={(e) => updateField(event.id, { cat4: e.target.value })}
                                placeholder="—"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Tip: edit multiple rows and hit <span className="font-medium text-zinc-200">Save</span> once.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

