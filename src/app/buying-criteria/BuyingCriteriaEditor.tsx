"use client";

import { fetchBuyingCriteriaAction, setCat3FrontRowAction } from "@/app/actions/buying-criteria";
import {
  fetchBuyingCriteriaRulesAction,
  replaceBuyingCriteriaRulesAction,
  saveBuyingCriteriaQtyRulesBulkAction,
  type BuyingCriteriaRuleInput,
  type BuyingCriteriaRuleRow,
} from "@/app/actions/buying-criteria-rules";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

type EventStub = {
  id: number;
  matchLabel: string;
  name: string;
};

type QtyDraft = { minQty: string; maxPriceUsd: string };
type EditorTarget = { eventId: number; categoryNum: 1 | 2 | 3 | 4 };
type TogetherCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type TogetherDraft = { id: string; togetherCount: TogetherCount; maxPriceUsd: string };

const inp =
  "min-h-9 w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55";

const inpAccent =
  "font-bold tabular-nums text-[color:var(--ticketing-accent)] placeholder:font-medium placeholder:tabular-nums placeholder:text-zinc-600";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function usdInputFromCents(cents: number | null): string {
  if (cents === null) return "";
  const whole = cents % 100 === 0;
  const v = cents / 100;
  return whole ? v.toFixed(0) : v.toFixed(2);
}

function normalizeMoneyInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutDollar = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
  return withoutDollar.replaceAll(",", "").trim();
}

function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

function formatUsdFromInput(raw: string): string | null {
  const norm = normalizeMoneyInput(raw);
  if (!norm) return null;
  const n = Number(norm);
  if (!Number.isFinite(n)) return `$${norm}`;
  return Number.isInteger(n) ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function clampTogetherCount(n: number): TogetherCount {
  const clamped = Math.min(10, Math.max(1, Math.trunc(n)));
  return clamped as TogetherCount;
}

function renderTogetherSummary(rules: BuyingCriteriaRuleRow[]): ReactNode {
  const parts = rules
    .filter((r) => r.kind === "TOGETHER_UNDER_PRICE" && r.togetherCount != null && r.maxPriceUsdCents != null)
    .slice()
    .sort((a, b) => (a.togetherCount ?? 0) - (b.togetherCount ?? 0))
    .map((r) => {
      const t = r.togetherCount ?? 0;
      const price = formatUsdFromCents(r.maxPriceUsdCents ?? 0);
      return (
        <span
          key={`together-${r.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/25 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
        >
          <span className="tabular-nums text-zinc-100">{t}</span>
          <span className="text-zinc-500">together ≤</span>
          <span className="font-bold tabular-nums text-[color:var(--ticketing-accent)]">{price}</span>
        </span>
      );
    });

  if (parts.length === 0) return <span className="text-zinc-600">No together rules</span>;

  return <span className="inline-flex flex-wrap gap-x-2 gap-y-1">{parts}</span>;
}

function clampCategory(n: number): 1 | 2 | 3 | 4 | null {
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

export function BuyingCriteriaEditor({ events }: { events: EventStub[] }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [visibleEventIds, setVisibleEventIds] = useState<number[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [cat3FrontRowByEventId, setCat3FrontRowByEventId] = useState<Record<number, boolean>>({});
  const [frontRowSavingByEventId, setFrontRowSavingByEventId] = useState<Record<number, boolean>>({});

  const [rulesByEventId, setRulesByEventId] = useState<Record<number, Record<number, BuyingCriteriaRuleRow[]>>>({});
  const [qtyDraftByKey, setQtyDraftByKey] = useState<Record<string, QtyDraft>>({});
  const dirtyQtyKeysRef = useRef<Set<string>>(new Set());
  const [dirtyCount, setDirtyCount] = useState(0);

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [togetherDrafts, setTogetherDrafts] = useState<TogetherDraft[]>([]);
  const [newTogetherCount, setNewTogetherCount] = useState<TogetherCount>(2);
  const [newTogetherPrice, setNewTogetherPrice] = useState("600");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const draftSeqRef = useRef(0);

  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const addSearchId = useId();
  const addSearchRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const hasCriteriaByEventId = useMemo(() => {
    const next: Record<number, boolean> = {};
    for (const e of events) next[e.id] = false;

    for (const [eventIdRaw, perCat] of Object.entries(rulesByEventId)) {
      const eventId = Number(eventIdRaw);
      if (!Number.isFinite(eventId)) continue;
      if (!perCat) continue;
      if (
        (perCat[1]?.length ?? 0) > 0 ||
        (perCat[2]?.length ?? 0) > 0 ||
        (perCat[3]?.length ?? 0) > 0 ||
        (perCat[4]?.length ?? 0) > 0
      ) {
        next[eventId] = true;
      }
    }

    return next;
  }, [events, rulesByEventId]);

  const visibleEvents = useMemo(() => {
    const set = new Set(visibleEventIds);
    return events.filter((e) => set.has(e.id));
  }, [events, visibleEventIds]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleEvents;
    return visibleEvents.filter((e) => `${e.matchLabel} ${e.name}`.toLowerCase().includes(q));
  }, [visibleEvents, query]);

  const missingEvents = useMemo(() => {
    if (loading) return [];
    const visibleSet = new Set(visibleEventIds);
    return events.filter((e) => !(hasCriteriaByEventId[e.id] ?? false) && !visibleSet.has(e.id));
  }, [events, hasCriteriaByEventId, visibleEventIds, loading]);

  const filteredMissingEvents = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return missingEvents;
    return missingEvents.filter((e) => `${e.matchLabel} ${e.name}`.toLowerCase().includes(q));
  }, [missingEvents, addQuery]);

  const initState = (eventIds: number[]) => {
    const frontBase: Record<number, boolean> = {};
    const rulesBase: Record<number, Record<number, BuyingCriteriaRuleRow[]>> = {};
    const qtyBase: Record<string, QtyDraft> = {};
    for (const id of eventIds) {
      frontBase[id] = false;
      rulesBase[id] = { 1: [], 2: [], 3: [], 4: [] };
      for (const c of [1, 2, 3, 4]) qtyBase[`${id}-${c}`] = { minQty: "", maxPriceUsd: "" };
    }
    setCat3FrontRowByEventId(frontBase);
    setRulesByEventId(rulesBase);
    setQtyDraftByKey(qtyBase);
    dirtyQtyKeysRef.current = new Set();
    setDirtyCount(0);
  };

  useEffect(() => {
    const eventIds = events.map((e) => e.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local drafts when the events list changes
    initState(eventIds);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset visible list when the events list changes
    setVisibleEventIds([]);

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNote(null);
    void (async () => {
      const [frontRes, rulesRes] = await Promise.all([
        fetchBuyingCriteriaAction(eventIds),
        fetchBuyingCriteriaRulesAction(eventIds),
      ]);
      if (cancelled) return;
      setLoading(false);

      const seededHas: Record<number, boolean> = {};
      for (const id of eventIds) seededHas[id] = false;
      if (rulesRes.ok) for (const rule of rulesRes.rules) if (rule.maxPriceUsdCents != null) seededHas[rule.eventId] = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed visible events based on fetched buying criteria
      setVisibleEventIds(events.filter((e) => seededHas[e.id]).map((e) => e.id));

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
            // Treat rules without a max price as "not set" (ignore for visibility + summaries).
            if (rule.maxPriceUsdCents == null) continue;
            const cat = clampCategory(rule.categoryNum);
            if (cat === null) continue;
            const perEvent = (next[rule.eventId] ??= { 1: [], 2: [], 3: [], 4: [] });
            const perCat = (perEvent[cat] ??= []);
            perCat.push(rule);
          }
          return next;
        });

        setQtyDraftByKey((prev) => {
          const next = { ...prev };
          for (const rule of rulesRes.rules) {
            if (rule.kind !== "QTY_UNDER_PRICE") continue;
            if (rule.maxPriceUsdCents == null) continue;
            const cat = clampCategory(rule.categoryNum);
            if (cat === null) continue;
            const key = `${rule.eventId}-${cat}`;
            next[key] = {
              minQty: rule.minQty != null ? String(rule.minQty) : "",
              maxPriceUsd: usdInputFromCents(rule.maxPriceUsdCents),
            };
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [events]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    addSearchRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editorSaving || saving) return;
      setAddOpen(false);
      queueMicrotask(() => addButtonRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addOpen, editor, editorSaving, saving]);

  const markDirty = (key: string) => {
    if (!dirtyQtyKeysRef.current.has(key)) {
      dirtyQtyKeysRef.current.add(key);
      setDirtyCount(dirtyQtyKeysRef.current.size);
    }
  };

  const updateQtyDraft = (eventId: number, categoryNum: 1 | 2 | 3 | 4, patch: Partial<QtyDraft>) => {
    const key = `${eventId}-${categoryNum}`;
    setQtyDraftByKey((prev) => {
      const cur = prev[key] ?? { minQty: "", maxPriceUsd: "" };
      return { ...prev, [key]: { ...cur, ...patch } };
    });
    markDirty(key);
  };

  const clearRow = (eventId: number) => {
    setQtyDraftByKey((prev) => {
      const next = { ...prev };
      for (const c of [1, 2, 3, 4] as const) {
        next[`${eventId}-${c}`] = { minQty: "", maxPriceUsd: "" };
      }
      return next;
    });
    for (const c of [1, 2, 3, 4] as const) markDirty(`${eventId}-${c}`);
    setNote("Row cleared (not saved yet).");
  };

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  const clearAddSearch = () => {
    setAddQuery("");
    addSearchRef.current?.focus();
  };

  const openAddModal = () => {
    if (loading || editor || editorSaving || saving) return;
    setAddQuery("");
    setAddOpen(true);
  };

  const selectMissingEvent = (eventId: number) => {
    setVisibleEventIds((prev) => (prev.includes(eventId) ? prev : [...prev, eventId]));
    setQuery("");
    setNote("Event added (not saved yet).");
    setAddOpen(false);
    queueMicrotask(() => addButtonRef.current?.focus());
  };

  const clearAllQtyDrafts = () => {
    if (!confirm("Clear ALL Qty/Max $ inputs? (Together rules are unchanged unless you edit them.)")) return;
    setQtyDraftByKey((prev) => {
      const next = { ...prev };
      for (const ev of events) {
        for (const c of [1, 2, 3, 4] as const) next[`${ev.id}-${c}`] = { minQty: "", maxPriceUsd: "" };
      }
      return next;
    });
    for (const ev of events) for (const c of [1, 2, 3, 4] as const) markDirty(`${ev.id}-${c}`);
    setNote("All qty/price inputs cleared (not saved yet).");
  };

  const saveDirtyQty = async () => {
    if (saving || loading) return;
    const keys = [...dirtyQtyKeysRef.current.values()];
    if (keys.length === 0) return;

    setSaving(true);
    setError(null);
    setNote(null);

    const payload = keys
      .map((key) => {
        const [eventIdRaw, catRaw] = key.split("-");
        const eventId = Number(eventIdRaw);
        const categoryNum = clampCategory(Number(catRaw));
        if (!Number.isFinite(eventId) || categoryNum === null) return null;
        if (!eventsById.has(eventId)) return null;
        const draft = qtyDraftByKey[key] ?? { minQty: "", maxPriceUsd: "" };
        const minQty = draft.minQty.trim() === "" ? null : Number(draft.minQty);
        const money = normalizeMoneyInput(draft.maxPriceUsd);
        const maxPriceUsd = money === "" ? null : money;
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
      setSaving(false);
      setError(res.error);
      return;
    }

    const refreshedEventIds = [...new Set(payload.map((p) => p.eventId))];
    const refreshed = await fetchBuyingCriteriaRulesAction(refreshedEventIds);
    setSaving(false);
    if (!refreshed.ok) {
      setError(refreshed.error);
      return;
    }

    setRulesByEventId((prev) => {
      const next = { ...prev };
      const perEvent: Record<number, Record<number, BuyingCriteriaRuleRow[]>> = {};
      for (const eid of refreshedEventIds) perEvent[eid] = { 1: [], 2: [], 3: [], 4: [] };
      for (const rule of refreshed.rules) {
        const cat = clampCategory(rule.categoryNum);
        if (cat === null) continue;
        const e = (perEvent[rule.eventId] ??= { 1: [], 2: [], 3: [], 4: [] });
        const c = (e[cat] ??= []);
        c.push(rule);
      }
      for (const eid of Object.keys(perEvent)) next[Number(eid)] = perEvent[Number(eid)]!;
      return next;
    });

    dirtyQtyKeysRef.current = new Set();
    setDirtyCount(0);
    setLastSavedAt(Date.now());
    setNote(`Saved ${res.saved.toLocaleString("en-US")} cell${res.saved === 1 ? "" : "s"}.`);
  };

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
      return;
    }
    setLastSavedAt(Date.now());
    setNote("Saved.");
  };

  const openTogetherEditor = (eventId: number, categoryNum: 1 | 2 | 3 | 4) => {
    setEditor({ eventId, categoryNum });
    setEditorSaving(false);
    setEditorError(null);
    setNewTogetherCount(2);
    setNewTogetherPrice("600");

    const existing = (rulesByEventId[eventId]?.[categoryNum] ?? [])
      .filter((r) => r.kind === "TOGETHER_UNDER_PRICE" && r.togetherCount != null)
      .slice()
      .sort((a, b) => (a.togetherCount ?? 0) - (b.togetherCount ?? 0))
      .map(
        (r) =>
          ({
            id: `db-${r.id}`,
            togetherCount: clampTogetherCount(r.togetherCount ?? 2),
            maxPriceUsd: usdInputFromCents(r.maxPriceUsdCents),
          }) satisfies TogetherDraft,
      );
    setTogetherDrafts(existing);
  };

  const addTogetherDraft = (togetherCount: TogetherCount, maxPriceUsd: string) => {
    draftSeqRef.current += 1;
    const uuid = globalThis.crypto?.randomUUID?.();
    const id = uuid ? `draft-${uuid}` : `draft-${Date.now()}-${draftSeqRef.current}`;
    const nextDraft: TogetherDraft = { id, togetherCount, maxPriceUsd };
    setTogetherDrafts((prev) => [...prev, nextDraft].sort((a, b) => a.togetherCount - b.togetherCount));
  };

  const removeTogetherDraft = (id: TogetherDraft["id"]) => {
    setTogetherDrafts((prev) => prev.filter((x) => x.id !== id));
  };

  const saveTogetherEditor = async () => {
    if (!editor || editorSaving) return;
    setEditorSaving(true);
    setEditorError(null);

    const key = `${editor.eventId}-${editor.categoryNum}`;
    const qtyDraft = qtyDraftByKey[key] ?? { minQty: "", maxPriceUsd: "" };
    const qtyMin = qtyDraft.minQty.trim();
    const qtyMax = normalizeMoneyInput(qtyDraft.maxPriceUsd);

    const rules: BuyingCriteriaRuleInput[] = [];
    if (qtyMin !== "" && qtyMax === "") {
      setEditorSaving(false);
      setEditorError("Max $ is required when Qty is set (or leave both blank).");
      return;
    }
    if (qtyMax !== "") {
      let minQty = 1;
      if (qtyMin !== "") {
        const parsed = Number(qtyMin);
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
          setEditorSaving(false);
          setEditorError("Qty must be a positive whole number (or leave it blank).");
          return;
        }
        minQty = parsed;
      }
      rules.push({ kind: "QTY_UNDER_PRICE", minQty, maxPriceUsd: qtyMax });
    }

    for (const t of togetherDrafts) {
      const money = normalizeMoneyInput(t.maxPriceUsd);
      if (!money) continue;
      rules.push({ kind: "TOGETHER_UNDER_PRICE", togetherCount: t.togetherCount, maxPriceUsd: money });
    }

    const res = await replaceBuyingCriteriaRulesAction(editor.eventId, editor.categoryNum, rules);
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
        const cat = clampCategory(rule.categoryNum);
        if (cat === null) continue;
        const perCat = (perEvent[cat] ??= []);
        perCat.push(rule);
      }
      next[editor.eventId] = perEvent;
      return next;
    });

    setQtyDraftByKey((prev) => {
      const next = { ...prev };
      for (const c of [1, 2, 3, 4] as const) {
        next[`${editor.eventId}-${c}`] = next[`${editor.eventId}-${c}`] ?? { minQty: "", maxPriceUsd: "" };
      }
      for (const rule of refreshed.rules) {
        if (rule.kind !== "QTY_UNDER_PRICE") continue;
        const cat = clampCategory(rule.categoryNum);
        if (cat === null) continue;
        next[`${rule.eventId}-${cat}`] = {
          minQty: rule.minQty != null ? String(rule.minQty) : "",
          maxPriceUsd: usdInputFromCents(rule.maxPriceUsdCents),
        };
      }
      return next;
    });

    setLastSavedAt(Date.now());
    setNote("Saved.");
    setEditor(null);
  };

  const renderCatCell = (eventId: number, matchLabel: string, cat: 1 | 2 | 3 | 4) => {
    const key = `${eventId}-${cat}`;
    const disabled = saving || loading || editorSaving;
    const rules = rulesByEventId[eventId]?.[cat] ?? [];
    const togetherSummary = renderTogetherSummary(rules);
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-[5.1rem_6.2rem] gap-2">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Qty</div>
            <input
              value={qtyDraftByKey[key]?.minQty ?? ""}
              onChange={(e) => updateQtyDraft(eventId, cat, { minQty: e.target.value })}
              inputMode="numeric"
              placeholder="e.g. 2"
              aria-label={`${matchLabel} cat ${cat} qty`}
              disabled={disabled}
              className={`${inp} ${inpAccent} w-full`}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Max $</div>
            <input
              value={qtyDraftByKey[key]?.maxPriceUsd ?? ""}
              onChange={(e) => updateQtyDraft(eventId, cat, { maxPriceUsd: e.target.value })}
              inputMode="decimal"
              placeholder="e.g. 600"
              aria-label={`${matchLabel} cat ${cat} max price`}
              disabled={disabled}
              className={`${inp} ${inpAccent} w-full`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => openTogetherEditor(eventId, cat)}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/12 bg-black/35 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
          >
            Together rules
          </button>
          {cat === 3 ? (
            <button
              type="button"
              onClick={() => void toggleFrontRow(eventId)}
              disabled={disabled || (frontRowSavingByEventId[eventId] ?? false)}
              className={`inline-flex min-h-8 items-center justify-center rounded-md border px-2 text-[11px] font-semibold shadow-inner shadow-black/25 ring-1 ring-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55 ${
                cat3FrontRowByEventId[eventId]
                  ? "border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] text-zinc-100"
                  : "border-white/10 bg-black/35 text-zinc-400 hover:bg-white/[0.06]"
              }`}
              aria-pressed={cat3FrontRowByEventId[eventId] ?? false}
              aria-label={`${matchLabel} cat 3 front row`}
            >
              Front row
            </button>
          ) : null}
        </div>

        <p className="text-[11px] leading-snug text-zinc-500">{togetherSummary}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Preferences</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-[2.125rem] sm:leading-tight">
            Buying criteria
          </h1>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
            Set simple per-match limits. Fill <span className="font-medium text-zinc-200">Qty</span> and{" "}
            <span className="font-medium text-zinc-200">Max $</span> (USD). Leave blank to ignore. Together rules are optional.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1">
              Showing <span className="font-semibold text-zinc-200">{filteredEvents.length}</span>{" "}
              {query.trim() ? (
                <>
                  of <span className="font-semibold text-zinc-200">{visibleEvents.length}</span>
                </>
              ) : (
                <>
                  of <span className="font-semibold text-zinc-200">{visibleEvents.length}</span>
                </>
              )}{" "}
              matches with criteria
            </span>
            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1">
              Total events <span className="font-semibold text-zinc-200">{events.length}</span>
            </span>
            {missingEvents.length ? (
              <button
                type="button"
                onClick={() => openAddModal()}
                disabled={addOpen || loading || saving || !!editor || editorSaving}
                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
              >
                <span className="text-zinc-500">Missing</span>{" "}
                <span className="font-semibold text-zinc-200">{missingEvents.length}</span>
              </button>
            ) : (
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1">
                All events have criteria
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => openAddModal()}
            disabled={addOpen || loading || saving || !!editor || editorSaving || missingEvents.length === 0}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
          >
            Add buying criteria
          </button>
          <button
            type="button"
            onClick={() => void saveDirtyQty()}
            disabled={saving || loading || dirtyCount === 0}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
          >
            {saving ? "Saving…" : dirtyCount ? `Save (${dirtyCount})` : "Save"}
          </button>
          <div className="min-w-[12rem] text-right text-[11px] leading-tight text-zinc-500">
            <div className="flex items-center justify-end gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${
                  loading
                    ? "border-white/10 bg-black/20 text-zinc-500"
                    : dirtyCount
                      ? "border-amber-500/30 bg-amber-950/20 text-amber-200"
                      : "border-emerald-500/25 bg-emerald-950/15 text-emerald-200"
                }`}
                aria-live="polite"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    loading ? "bg-zinc-500" : dirtyCount ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                  aria-hidden
                />
                {loading ? "Loading…" : dirtyCount ? "Unsaved changes" : "Up to date"}
              </span>
            </div>
            <div className="mt-1">{lastSavedAt ? `Last saved ${formatTime(lastSavedAt)}` : "\u00A0"}</div>
          </div>
          <button
            type="button"
            onClick={() => clearAllQtyDrafts()}
            disabled={saving || loading || editorSaving}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/25 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
          >
            Clear all
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500 sm:hidden">
        Tip: <span className="font-medium text-zinc-200">Save</span> applies to Qty/Max $ cells. Together rules save per category.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor={searchId} className="sr-only">
            Search matches
          </label>
          <input
            ref={searchRef}
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search matches/events…"
            autoComplete="off"
            className={`${inp} max-w-xl`}
          />
          {query.trim() ? (
            <button
              type="button"
              onClick={() => clearSearch()}
              className="rounded-md border border-white/12 bg-black/35 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
            >
              Clear search
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-500">
          {query.trim() ? (
            <>
              Filtered <span className="font-semibold text-zinc-200">{filteredEvents.length}</span> /{" "}
              <span className="font-semibold text-zinc-200">{visibleEvents.length}</span>
            </>
          ) : (
            <>
              Showing <span className="font-semibold text-zinc-200">{visibleEvents.length}</span> /{" "}
              <span className="font-semibold text-zinc-200">{events.length}</span>
            </>
          )}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : null}
      {note ? (
        <p className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-sm text-zinc-100">
          {note}
        </p>
      ) : null}

      {!loading && visibleEvents.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-6 text-center ring-1 ring-white/[0.04]">
          <p className="text-sm font-semibold text-zinc-100">No buying criteria yet</p>
          <p className="mt-1 text-sm text-zinc-500">Add an event to start setting Qty/Max $ and Together rules.</p>
          <button
            type="button"
            onClick={() => openAddModal()}
            disabled={loading || saving || editorSaving || missingEvents.length === 0}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
          >
            Add buying criteria
          </button>
        </div>
      ) : null}

      <div className="sm:hidden">
        <div className="space-y-3">
          {filteredEvents.map((e) => (
            <section
              key={e.id}
              className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 ring-1 ring-white/[0.04]"
              aria-label={`${e.matchLabel} buying criteria`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]">
                    {e.matchLabel}
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-100">{e.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => clearRow(e.id)}
                  disabled={saving || loading || editorSaving}
                  className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/[0.10] disabled:opacity-55"
                >
                  Reset row
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {[1, 2, 3, 4].map((cat) => (
                  <div key={cat} className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      Cat {cat}
                    </div>
                    {renderCatCell(e.id, e.matchLabel, cat as 1 | 2 | 3 | 4)}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 ring-1 ring-white/[0.04]">
          <div className="max-h-[min(70vh,52rem)] overflow-auto overscroll-contain">
            <table className="w-full min-w-[78rem] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[8.5rem]" />
                <col className="w-[20rem]" />
                <col className="w-[16rem]" />
                <col className="w-[16rem]" />
                <col className="w-[16rem]" />
                <col className="w-[16rem]" />
                <col className="w-[10rem]" />
              </colgroup>
              <thead className="sticky top-0 z-20 border-b border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,white_3%)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[color:color-mix(in_oklab,var(--ticketing-surface)_88%,transparent)]">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-30 whitespace-nowrap border-r border-white/[0.08] px-3 py-3 pl-4 font-mono sm:px-4 sm:pl-5"
                  >
                    Match
                  </th>
                  <th
                    scope="col"
                    className="sticky left-[8.5rem] z-30 border-r border-white/[0.08] px-3 py-3 sm:px-4"
                  >
                    Event
                  </th>
                  <th scope="col" className="border-l border-white/[0.06] px-3 py-3 sm:px-4">
                    <span>Cat 1</span>
                    <span className="mt-0.5 block text-[9px] font-medium normal-case tracking-normal text-zinc-500">
                      Qty · Max $ · Together
                    </span>
                  </th>
                  <th scope="col" className="border-l border-white/[0.06] px-3 py-3 sm:px-4">
                    <span>Cat 2</span>
                    <span className="mt-0.5 block text-[9px] font-medium normal-case tracking-normal text-zinc-500">
                      Qty · Max $ · Together
                    </span>
                  </th>
                  <th scope="col" className="border-l border-white/[0.06] px-3 py-3 sm:px-4">
                    <span>Cat 3</span>
                    <span className="mt-0.5 block text-[9px] font-medium normal-case tracking-normal text-zinc-500">
                      Qty · Max $ · Together · Front row
                    </span>
                  </th>
                  <th scope="col" className="border-l border-white/[0.06] px-3 py-3 sm:px-4">
                    <span>Cat 4</span>
                    <span className="mt-0.5 block text-[9px] font-medium normal-case tracking-normal text-zinc-500">
                      Qty · Max $ · Together
                    </span>
                  </th>
                  <th scope="col" className="border-l border-white/[0.06] px-3 py-3 pr-4 text-right sm:px-4 sm:pr-5">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-zinc-200">
                {filteredEvents.map((event, idx) => {
                  const zebra = idx % 2 === 1 ? "bg-[color:var(--ticketing-elevated)]" : "bg-transparent";
                  const cellBg = `${zebra} group-hover:bg-[color:color-mix(in_oklab,white_9%,transparent)]`;
                  return (
                    <tr
                      key={event.id}
                      className="group border-t border-white/[0.06] align-top"
                    >
                      <td
                        className={`sticky left-0 z-10 whitespace-nowrap border-r border-white/[0.08] px-3 py-3 pl-4 font-mono text-[11px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] sm:px-4 sm:pl-5 ${cellBg}`}
                      >
                        {event.matchLabel}
                      </td>
                      <td
                        className={`sticky left-[8.5rem] z-10 border-r border-white/[0.08] px-3 py-3 text-xs text-zinc-200 sm:px-4 ${cellBg}`}
                      >
                        <span className="line-clamp-2 leading-snug">{event.name}</span>
                      </td>
                      <td className={`border-l border-white/[0.06] px-3 py-3 sm:px-4 ${cellBg}`}>
                        {renderCatCell(event.id, event.matchLabel, 1)}
                      </td>
                      <td className={`border-l border-white/[0.06] px-3 py-3 sm:px-4 ${cellBg}`}>
                        {renderCatCell(event.id, event.matchLabel, 2)}
                      </td>
                      <td className={`border-l border-white/[0.06] px-3 py-3 sm:px-4 ${cellBg}`}>
                        {renderCatCell(event.id, event.matchLabel, 3)}
                      </td>
                      <td className={`border-l border-white/[0.06] px-3 py-3 sm:px-4 ${cellBg}`}>
                        {renderCatCell(event.id, event.matchLabel, 4)}
                      </td>
                      <td className={`border-l border-white/[0.06] px-3 py-3 pr-4 text-right sm:px-4 sm:pr-5 ${cellBg}`}>
                        <button
                          type="button"
                          onClick={() => clearRow(event.id)}
                          disabled={saving || loading || editorSaving}
                          className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-55"
                        >
                          Reset row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          Hint: <span className="font-medium text-zinc-200">Qty</span> + <span className="font-medium text-zinc-200">Max $</span>{" "}
          saves in bulk with the Save button. Together rules save per category.
        </p>
      </div>

      {editor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editorSaving) setEditor(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Together rules"
            className="w-full max-w-[44rem] overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/60 ring-1 ring-white/[0.05]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100">Together rules · CAT {editor.categoryNum}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {eventsById.get(editor.eventId)?.matchLabel} · {eventsById.get(editor.eventId)?.name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor(null)}
                    disabled={editorSaving}
                    className="rounded-lg border border-white/12 bg-transparent px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-55"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTogetherEditor()}
                    disabled={editorSaving}
                    className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] disabled:opacity-55"
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
            </div>

            <div className="px-5 pb-5 pt-4">
              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Current</p>
                  <button
                    type="button"
                    onClick={() => setTogetherDrafts([])}
                    disabled={editorSaving}
                    className="rounded-md border border-white/12 bg-transparent px-2 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-55"
                  >
                    Clear all
                  </button>
                </div>
                {togetherDrafts.length ? (
                  <ul className="mt-2 space-y-2">
                    {togetherDrafts.map((r) => {
                      const price = formatUsdFromInput(r.maxPriceUsd);
                      return (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                      >
                        <span className="text-xs font-medium text-zinc-200">
                          {r.togetherCount} together ≤{" "}
                          <span className="font-bold tabular-nums text-[color:var(--ticketing-accent)]">{price ?? "—"}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTogetherDraft(r.id)}
                          disabled={editorSaving}
                          className="rounded-md border border-white/12 bg-transparent px-2 py-1 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-55"
                        >
                          Remove
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">No together rules yet.</p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Add / replace</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="sr-only">Together count</label>
                    <select
                      value={newTogetherCount}
                      onChange={(e) => setNewTogetherCount(Number(e.target.value) as TogetherCount)}
                      className={inp}
                      disabled={editorSaving}
                    >
                      <option value={1}>1 together</option>
                      <option value={2}>2 together</option>
                      <option value={3}>3 together</option>
                      <option value={4}>4 together</option>
                      <option value={5}>5 together</option>
                      <option value={6}>6 together</option>
                      <option value={7}>7 together</option>
                      <option value={8}>8 together</option>
                      <option value={9}>9 together</option>
                      <option value={10}>10 together</option>
                    </select>
                  </div>
                  <div>
                    <label className="sr-only">Max price (USD)</label>
                    <input
                      value={newTogetherPrice}
                      onChange={(e) => setNewTogetherPrice(e.target.value)}
                      inputMode="decimal"
                      className={`${inp} ${inpAccent}`}
                      placeholder="Max $"
                      disabled={editorSaving}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addTogetherDraft(newTogetherCount, newTogetherPrice)
                  }
                  disabled={editorSaving}
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-white/12 bg-black/35 px-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-55"
                >
                  Add together rule
                </button>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Prices are in USD. These rules apply only when that many tickets are together.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editorSaving && !saving) {
              setAddOpen(false);
              queueMicrotask(() => addButtonRef.current?.focus());
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add buying criteria"
            className="w-full max-w-[44rem] overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/60 ring-1 ring-white/[0.05]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100">Add buying criteria</h2>
                  <p className="mt-1 text-xs text-zinc-500">Pick an event that currently has no criteria.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    queueMicrotask(() => addButtonRef.current?.focus());
                  }}
                  disabled={saving || editorSaving}
                  className="rounded-lg border border-white/12 bg-transparent px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-55"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label htmlFor={addSearchId} className="sr-only">
                    Search missing events
                  </label>
                  <input
                    ref={addSearchRef}
                    id={addSearchId}
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Search missing events…"
                    autoComplete="off"
                    className={`${inp} max-w-xl`}
                  />
                  {addQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => clearAddSearch()}
                      className="rounded-md border border-white/12 bg-black/35 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Showing <span className="font-semibold text-zinc-200">{filteredMissingEvents.length}</span> /{" "}
                  <span className="font-semibold text-zinc-200">{missingEvents.length}</span>
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-4">
              {missingEvents.length === 0 ? (
                <p className="text-sm text-zinc-500">All events already have buying criteria.</p>
              ) : filteredMissingEvents.length === 0 ? (
                <p className="text-sm text-zinc-500">No matches.</p>
              ) : (
                <ul className="max-h-[min(60vh,28rem)] space-y-2 overflow-auto overscroll-contain pr-1">
                  {filteredMissingEvents.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => selectMissingEvent(e.id)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-left ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]">
                            {e.matchLabel}
                          </div>
                          <div className="mt-1 text-sm font-medium text-zinc-100">{e.name}</div>
                        </div>
                        <span className="shrink-0 rounded-md border border-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-zinc-100">
                          Add
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

