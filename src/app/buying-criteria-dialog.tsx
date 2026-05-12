"use client";

import { fetchBuyingCriteriaAction, setCat3FrontRowAction } from "@/app/actions/buying-criteria";
import {
  fetchBuyingCriteriaRulesAction,
  replaceBuyingCriteriaRulesAction,
  saveBuyingCriteriaQtyRulesBulkAction,
  type BuyingCriteriaRuleInput,
  type BuyingCriteriaRuleRow,
} from "@/app/actions/buying-criteria-rules";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type EventStub = {
  id: number;
  matchLabel: string;
  name: string;
};

const inp =
  "min-h-9 w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

type FrontRowState = { cat3FrontRow: boolean };
type EditorTarget = { eventId: number; categoryNum: number };
type QtyDraft = { minQty: string; maxPriceUsd: string };

function defaultFrontRow(): FrontRowState {
  return { cat3FrontRow: false };
}

function formatUsdFromCents(cents: number | null): string {
  if (cents === null) return "—";
  const whole = cents % 100 === 0;
  const v = cents / 100;
  return whole ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
}

function usdInputFromCents(cents: number | null): string {
  if (cents === null) return "";
  const whole = cents % 100 === 0;
  const v = cents / 100;
  return whole ? v.toFixed(0) : v.toFixed(2);
}

function summarizeRules(rules: BuyingCriteriaRuleRow[]): string {
  if (!rules.length) return "—";
  const parts = rules
    .slice()
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "QTY_UNDER_PRICE" ? -1 : 1;
      const at = a.togetherCount ?? 0;
      const bt = b.togetherCount ?? 0;
      if (at !== bt) return at - bt;
      const aq = a.minQty ?? 0;
      const bq = b.minQty ?? 0;
      return aq - bq;
    })
    .map((r) => {
      const price = formatUsdFromCents(r.maxPriceUsdCents);
      if (r.kind === "QTY_UNDER_PRICE") return `Qty≥${r.minQty ?? "?"} ≤${price}`;
      const t = r.togetherCount ?? 0;
      const label = t === 6 ? "6+T" : `${t}T`;
      return `${label} ≤${price}`;
    });
  return parts.join("; ");
}

export function BuyingCriteriaDialog({ events }: { events: EventStub[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat3FrontRowByEventId, setCat3FrontRowByEventId] = useState<Record<number, boolean>>({});
  const [frontRowSavingByEventId, setFrontRowSavingByEventId] = useState<Record<number, boolean>>({});
  const [rulesByEventId, setRulesByEventId] = useState<Record<number, Record<number, BuyingCriteriaRuleRow[]>>>({});
  const [qtyDraftByKey, setQtyDraftByKey] = useState<Record<string, QtyDraft>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDirtyCount, setBulkDirtyCount] = useState(0);

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [draftRules, setDraftRules] = useState<BuyingCriteriaRuleInput[]>([]);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);
  const [newQtyMin, setNewQtyMin] = useState("20");
  const [newQtyPrice, setNewQtyPrice] = useState("300");
  const [newTogetherCount, setNewTogetherCount] = useState(2);
  const [newTogetherPrice, setNewTogetherPrice] = useState("600");

  const titleId = useId();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const fetchSeqRef = useRef(0);
  const dirtyQtyKeysRef = useRef<Set<string>>(new Set());

  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const closeDialog = () => {
    fetchSeqRef.current += 1;
    setEditor(null);
    setOpen(false);
  };

  const openDialog = () => {
    setError(null);
    setNote(null);
    setQuery("");
    setEditor(null);
    dirtyQtyKeysRef.current = new Set();
    setBulkDirtyCount(0);
    setBulkSaving(false);

    const frontBase: Record<number, boolean> = {};
    const rulesBase: Record<number, Record<number, BuyingCriteriaRuleRow[]>> = {};
    const qtyBase: Record<string, QtyDraft> = {};
    for (const id of eventIds) {
      frontBase[id] = defaultFrontRow().cat3FrontRow;
      rulesBase[id] = { 1: [], 2: [], 3: [], 4: [] };
      for (const c of [1, 2, 3, 4]) {
        qtyBase[`${id}-${c}`] = { minQty: "", maxPriceUsd: "" };
      }
    }
    setCat3FrontRowByEventId(frontBase);
    setRulesByEventId(rulesBase);
    setQtyDraftByKey(qtyBase);

    const seq = (fetchSeqRef.current += 1);
    setLoading(true);
    setOpen(true);
    void (async () => {
      const [frontRes, rulesRes] = await Promise.all([
        fetchBuyingCriteriaAction(eventIds),
        fetchBuyingCriteriaRulesAction(eventIds),
      ]);
      if (fetchSeqRef.current !== seq) return;
      setLoading(false);

      if (!frontRes.ok) setError(frontRes.error);
      if (frontRes.ok) {
        setCat3FrontRowByEventId((prev) => {
          const next = { ...prev };
          for (const row of frontRes.rows) next[row.eventId] = row.cat3FrontRow;
          return next;
        });
      }

      if (!rulesRes.ok) setError((prev) => (prev ? `${prev} ${rulesRes.error}` : rulesRes.error));
      if (rulesRes.ok) {
        setRulesByEventId((prev) => {
          const next = { ...prev };
          for (const rule of rulesRes.rules) {
            const perEvent = (next[rule.eventId] ??= { 1: [], 2: [], 3: [], 4: [] });
            const perCat = (perEvent[rule.categoryNum] ??= []);
            perCat.push(rule);
          }
          return next;
        });

        setQtyDraftByKey((prev) => {
          const next = { ...prev };
          for (const rule of rulesRes.rules) {
            if (rule.kind !== "QTY_UNDER_PRICE") continue;
            const key = `${rule.eventId}-${rule.categoryNum}`;
            next[key] = {
              minQty: rule.minQty != null ? String(rule.minQty) : "",
              maxPriceUsd: usdInputFromCents(rule.maxPriceUsdCents),
            };
          }
          return next;
        });
      }
    })();
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editor && !editorSaving) {
        setEditor(null);
        return;
      }
      if (!editorSaving) closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, editor, editorSaving]);

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

  const toggleFrontRow = async (eventId: number) => {
    if (frontRowSavingByEventId[eventId]) return;
    const cur = cat3FrontRowByEventId[eventId] ?? false;
    const next = !cur;
    setCat3FrontRowByEventId((prev) => ({ ...prev, [eventId]: next }));
    setFrontRowSavingByEventId((prev) => ({ ...prev, [eventId]: true }));
    setError(null);
    setNote(null);

    const res = await setCat3FrontRowAction(eventId, next);
    setFrontRowSavingByEventId((prev) => ({ ...prev, [eventId]: false }));
    if (!res.ok) {
      setCat3FrontRowByEventId((prev) => ({ ...prev, [eventId]: cur }));
      setError(res.error);
    }
  };

  const markQtyDirty = (key: string) => {
    if (!dirtyQtyKeysRef.current.has(key)) {
      dirtyQtyKeysRef.current.add(key);
      setBulkDirtyCount(dirtyQtyKeysRef.current.size);
    }
  };

  const updateQtyDraft = (eventId: number, categoryNum: number, patch: Partial<QtyDraft>) => {
    const key = `${eventId}-${categoryNum}`;
    setQtyDraftByKey((prev) => {
      const cur = prev[key] ?? { minQty: "", maxPriceUsd: "" };
      return { ...prev, [key]: { ...cur, ...patch } };
    });
    markQtyDirty(key);
  };

  const saveBulkQty = async () => {
    if (bulkSaving || loading) return;
    if (dirtyQtyKeysRef.current.size === 0) return;
    setBulkSaving(true);
    setError(null);
    setNote(null);

    const keys = [...dirtyQtyKeysRef.current.values()];
    const payload = keys
      .map((key) => {
        const [eventIdRaw, catRaw] = key.split("-");
        const eventId = Number(eventIdRaw);
        const categoryNum = Number(catRaw);
        if (!Number.isFinite(eventId) || !Number.isFinite(categoryNum)) return null;
        if (!eventsById.has(eventId)) return null;
        const draft = qtyDraftByKey[key] ?? { minQty: "", maxPriceUsd: "" };
        const minQty = draft.minQty.trim() === "" ? null : Number(draft.minQty);
        const maxPriceUsd = draft.maxPriceUsd.trim() === "" ? null : draft.maxPriceUsd.trim();
        return {
          eventId,
          categoryNum,
          minQty: minQty !== null && Number.isFinite(minQty) ? Math.trunc(minQty) : null,
          maxPriceUsd,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const res = await saveBuyingCriteriaQtyRulesBulkAction(payload);
    if (!res.ok) {
      setBulkSaving(false);
      setError(res.error);
      return;
    }

    const refreshedEventIds = [...new Set(payload.map((p) => p.eventId))];
    const refreshed = await fetchBuyingCriteriaRulesAction(refreshedEventIds);
    setBulkSaving(false);
    if (!refreshed.ok) {
      setError(refreshed.error);
      return;
    }

    setRulesByEventId((prev) => {
      const next = { ...prev };
      const perEvent: Record<number, Record<number, BuyingCriteriaRuleRow[]>> = {};
      for (const eid of refreshedEventIds) perEvent[eid] = { 1: [], 2: [], 3: [], 4: [] };
      for (const rule of refreshed.rules) {
        const e = (perEvent[rule.eventId] ??= { 1: [], 2: [], 3: [], 4: [] });
        const c = (e[rule.categoryNum] ??= []);
        c.push(rule);
      }
      for (const eid of Object.keys(perEvent)) {
        next[Number(eid)] = perEvent[Number(eid)]!;
      }
      return next;
    });

    dirtyQtyKeysRef.current = new Set();
    setBulkDirtyCount(0);
    setNote(`Saved ${res.saved.toLocaleString("en-US")} cell${res.saved === 1 ? "" : "s"}.`);
  };

  const openEditor = (eventId: number, categoryNum: number) => {
    setEditor({ eventId, categoryNum });
    setEditorError(null);
    setEditorNote(null);
    setEditorSaving(false);
    setNewQtyMin("20");
    setNewQtyPrice("300");
    setNewTogetherCount(2);
    setNewTogetherPrice("600");

    const existing = rulesByEventId[eventId]?.[categoryNum] ?? [];
    setDraftRules(
      existing
        .map((r) => {
          const maxPriceUsd = usdInputFromCents(r.maxPriceUsdCents);
          if (r.kind === "QTY_UNDER_PRICE") {
            if (r.minQty == null) return null;
            return { kind: r.kind, minQty: r.minQty, maxPriceUsd } satisfies BuyingCriteriaRuleInput;
          }
          if (r.togetherCount == null) return null;
          return { kind: r.kind, togetherCount: r.togetherCount, maxPriceUsd } satisfies BuyingCriteriaRuleInput;
        })
        .filter((v): v is BuyingCriteriaRuleInput => v !== null),
    );
  };

  const removeDraftRuleAt = (idx: number) => {
    setDraftRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const addQtyRule = () => {
    const minQty = Number(newQtyMin);
    if (!Number.isFinite(minQty) || !Number.isInteger(minQty) || minQty <= 0) {
      setEditorError("Min qty must be a positive integer.");
      return;
    }
    setEditorError(null);
    setDraftRules((prev) => [{ kind: "QTY_UNDER_PRICE", minQty, maxPriceUsd: newQtyPrice }, ...prev.filter((r) => r.kind !== "QTY_UNDER_PRICE")]);
  };

  const addTogetherRule = () => {
    setEditorError(null);
    setDraftRules((prev) => {
      const filtered = prev.filter(
        (r) => !(r.kind === "TOGETHER_UNDER_PRICE" && r.togetherCount === newTogetherCount),
      );
      return [
        ...filtered,
        { kind: "TOGETHER_UNDER_PRICE", togetherCount: newTogetherCount, maxPriceUsd: newTogetherPrice },
      ];
    });
  };

  const saveEditor = async () => {
    if (!editor || editorSaving) return;
    setEditorSaving(true);
    setEditorError(null);
    setEditorNote(null);

    const res = await replaceBuyingCriteriaRulesAction(editor.eventId, editor.categoryNum, draftRules);
    if (!res.ok) {
      setEditorSaving(false);
      setEditorError(res.error);
      return;
    }

    const refreshed = await fetchBuyingCriteriaRulesAction([editor.eventId]);
    setEditorSaving(false);
    if (!refreshed.ok) {
      setEditorError(refreshed.error);
      return;
    }

    setRulesByEventId((prev) => {
      const next = { ...prev };
      const perEvent: Record<number, BuyingCriteriaRuleRow[]> = { 1: [], 2: [], 3: [], 4: [] };
      for (const rule of refreshed.rules) {
        const perCat = (perEvent[rule.categoryNum] ??= []);
        perCat.push(rule);
      }
      next[editor.eventId] = perEvent;
      return next;
    });

    setEditorNote("Saved.");
    setEditor(null);
  };

  const summarizeDraftRule = (r: BuyingCriteriaRuleInput): string => {
    const price = r.maxPriceUsd.trim() ? `$${r.maxPriceUsd.trim()}` : "—";
    if (r.kind === "QTY_UNDER_PRICE") return `Qty≥${r.minQty} ≤${price}`;
    const label = r.togetherCount === 6 ? "6+T" : `${r.togetherCount}T`;
    return `${label} ≤${price}`;
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
            if (e.target === e.currentTarget && !editorSaving && !bulkSaving) closeDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[min(92vh,52rem)] w-full max-w-[min(96vw,78rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base font-semibold text-zinc-100">
                    Buying criteria
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Structured rules per match across categories. CAT 3 front row is a YES flag.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => closeDialog()}
                    disabled={editorSaving || bulkSaving}
                    className="rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveBulkQty()}
                    disabled={bulkSaving || loading || bulkDirtyCount === 0}
                    className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                  >
                    {bulkSaving ? "Saving…" : bulkDirtyCount ? `Save qty (${bulkDirtyCount})` : "Save qty"}
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
                        const perEventRules = rulesByEventId[event.id] ?? { 1: [], 2: [], 3: [], 4: [] };
                        const frontRow = cat3FrontRowByEventId[event.id] ?? false;
                        const frontRowSaving = frontRowSavingByEventId[event.id] ?? false;
                        const cellDisabled = editorSaving || bulkSaving;
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
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={qtyDraftByKey[`${event.id}-1`]?.minQty ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 1, { minQty: e.target.value })}
                                    inputMode="numeric"
                                    placeholder="Qty"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[4.75rem]`}
                                  />
                                  <input
                                    value={qtyDraftByKey[`${event.id}-1`]?.maxPriceUsd ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 1, { maxPriceUsd: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="$"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[5.5rem]`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => openEditor(event.id, 1)}
                                    disabled={cellDisabled}
                                    className="shrink-0 rounded-md border border-white/12 bg-black/35 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                  >
                                    Rules
                                  </button>
                                </div>
                                <div className="text-[11px] leading-snug text-zinc-500">
                                  <span className="line-clamp-1">{summarizeRules(perEventRules[1] ?? [])}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={qtyDraftByKey[`${event.id}-2`]?.minQty ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 2, { minQty: e.target.value })}
                                    inputMode="numeric"
                                    placeholder="Qty"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[4.75rem]`}
                                  />
                                  <input
                                    value={qtyDraftByKey[`${event.id}-2`]?.maxPriceUsd ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 2, { maxPriceUsd: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="$"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[5.5rem]`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => openEditor(event.id, 2)}
                                    disabled={cellDisabled}
                                    className="shrink-0 rounded-md border border-white/12 bg-black/35 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                  >
                                    Rules
                                  </button>
                                </div>
                                <div className="text-[11px] leading-snug text-zinc-500">
                                  <span className="line-clamp-1">{summarizeRules(perEventRules[2] ?? [])}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top sm:px-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={qtyDraftByKey[`${event.id}-3`]?.minQty ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 3, { minQty: e.target.value })}
                                    inputMode="numeric"
                                    placeholder="Qty"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[4.75rem]`}
                                  />
                                  <input
                                    value={qtyDraftByKey[`${event.id}-3`]?.maxPriceUsd ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 3, { maxPriceUsd: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="$"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[5.5rem]`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => openEditor(event.id, 3)}
                                    disabled={cellDisabled}
                                    className="shrink-0 rounded-md border border-white/12 bg-black/35 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                  >
                                    Rules
                                  </button>
                                </div>
                                <div className="text-[11px] leading-snug text-zinc-500">
                                  <span className="line-clamp-1">{summarizeRules(perEventRules[3] ?? [])}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top text-center sm:px-4">
                              <button
                                type="button"
                                onClick={() => void toggleFrontRow(event.id)}
                                disabled={frontRowSaving || cellDisabled}
                                className={`inline-flex min-h-9 w-full items-center justify-center rounded-md border px-2.5 text-xs font-semibold shadow-inner shadow-black/25 ring-1 ring-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] ${
                                  frontRow
                                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                                    : "border-white/10 bg-black/35 text-zinc-400 hover:bg-white/[0.06]"
                                }`}
                                aria-pressed={frontRow}
                              >
                                {frontRow ? "YES" : ""}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 pr-4 align-top sm:px-4 sm:pr-5">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={qtyDraftByKey[`${event.id}-4`]?.minQty ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 4, { minQty: e.target.value })}
                                    inputMode="numeric"
                                    placeholder="Qty"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[4.75rem]`}
                                  />
                                  <input
                                    value={qtyDraftByKey[`${event.id}-4`]?.maxPriceUsd ?? ""}
                                    onChange={(e) => updateQtyDraft(event.id, 4, { maxPriceUsd: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="$"
                                    disabled={cellDisabled}
                                    className={`${inp} w-[5.5rem]`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => openEditor(event.id, 4)}
                                    disabled={cellDisabled}
                                    className="shrink-0 rounded-md border border-white/12 bg-black/35 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                                  >
                                    Rules
                                  </button>
                                </div>
                                <div className="text-[11px] leading-snug text-zinc-500">
                                  <span className="line-clamp-1">{summarizeRules(perEventRules[4] ?? [])}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Tip: type Qty + $ in the grid, then hit <span className="font-medium text-zinc-200">Save qty</span>.{" "}
                Use <span className="font-medium text-zinc-200">Rules</span> for together constraints.
              </p>
            </div>

            {editor ? (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget && !editorSaving) setEditor(null);
                }}
              >
                <div
                  className="w-full max-w-[44rem] overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/60 ring-1 ring-white/[0.05]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-zinc-100">
                          CAT {editor.categoryNum} rules
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          {eventsById.get(editor.eventId)?.matchLabel} · {eventsById.get(editor.eventId)?.name}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditor(null)}
                          disabled={editorSaving}
                          className="rounded-lg border border-white/12 bg-transparent px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEditor()}
                          disabled={editorSaving}
                          className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] disabled:opacity-50"
                        >
                          {editorSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                    {editorError ? (
                      <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                        {editorError}
                      </p>
                    ) : null}
                    {editorNote ? (
                      <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                        {editorNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="px-5 pb-5 pt-4">
                    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Current</p>
                      {draftRules.length ? (
                        <ul className="mt-2 space-y-2">
                          {draftRules.map((r, idx) => (
                            <li
                              key={`${r.kind}-${idx}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                            >
                              <span className="text-xs font-medium text-zinc-200">{summarizeDraftRule(r)}</span>
                              <button
                                type="button"
                                onClick={() => removeDraftRuleAt(idx)}
                                disabled={editorSaving}
                                className="rounded-md border border-white/12 bg-transparent px-2 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-500">No rules yet.</p>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Qty rule</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className="sr-only">Min qty</label>
                            <input
                              value={newQtyMin}
                              onChange={(e) => setNewQtyMin(e.target.value)}
                              inputMode="numeric"
                              className={inp}
                              placeholder="Min qty"
                            />
                          </div>
                          <div>
                            <label className="sr-only">Max price (USD)</label>
                            <input
                              value={newQtyPrice}
                              onChange={(e) => setNewQtyPrice(e.target.value)}
                              inputMode="decimal"
                              className={inp}
                              placeholder="Max $"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addQtyRule()}
                          disabled={editorSaving}
                          className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-white/12 bg-black/35 px-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          Add / replace qty rule
                        </button>
                      </div>

                      <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Together rule</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className="sr-only">Together count</label>
                            <select
                              value={newTogetherCount}
                              onChange={(e) => setNewTogetherCount(Number(e.target.value))}
                              className={inp}
                            >
                              <option value={2}>2 together</option>
                              <option value={3}>3 together</option>
                              <option value={4}>4 together</option>
                              <option value={5}>5 together</option>
                              <option value={6}>6+ together</option>
                            </select>
                          </div>
                          <div>
                            <label className="sr-only">Max price (USD)</label>
                            <input
                              value={newTogetherPrice}
                              onChange={(e) => setNewTogetherPrice(e.target.value)}
                              inputMode="decimal"
                              className={inp}
                              placeholder="Max $"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addTogetherRule()}
                          disabled={editorSaving}
                          className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-white/12 bg-black/35 px-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                        >
                          Add / replace together rule
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

