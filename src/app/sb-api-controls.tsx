"use client";

import { updateSbEventIdAction } from "@/app/actions/event-sb-id";
import { ModalPortal } from "@/app/modal-portal";
import { countSbTicketListings } from "@/lib/seatsbrokers-parse";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const pillIdle =
  "inline-flex min-h-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:min-h-11 sm:px-6";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const sectionTitle = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";

/** Page size when max offers is empty (push all). */
const PREVIEW_PAGE_SIZE = 20;

type LimitMode = { mode: "all" } | { mode: "exact"; count: number };

function parseLimitDraft(draft: string): LimitMode {
  const t = draft.trim();
  if (!t) return { mode: "all" };
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) return { mode: "all" };
  return { mode: "exact", count: n };
}

export type SbApiEventOption = {
  id: number;
  name: string;
  sbEventId: string | null;
};

type Props = {
  className?: string;
  /** Fixed event (event detail page). */
  eventId?: number;
  eventName?: string;
  sbEventId?: string | null;
  /** Pick event on home page. */
  eventOptions?: SbApiEventOption[];
};

type SbStatusResponse = {
  ok?: boolean;
  configured?: boolean;
  baseUrl?: string;
  error?: string;
  tournament?: unknown;
};

type SbTournamentOption = { id: string; name: string };

type SbMatchOption = {
  matchId: string;
  label: string;
  raw: Record<string, unknown>;
};

type SbEventsFetchResponse = {
  ok?: boolean;
  error?: string;
  tournamentId?: string;
  defaultTournamentId?: string;
  tournaments?: SbTournamentOption[];
  matches?: SbMatchOption[];
  suggested?: SbMatchOption | null;
  suggestedDetail?: {
    match: SbMatchOption;
    tickets: unknown;
    ticketsError?: string;
  };
};

type TicketPayload = {
  fields: Record<string, string>;
  summary: {
    offerType: string;
    quantity: number;
    priceUsd: number | null;
    categoryId: string;
    blockId: string;
    row: string;
    seatNumbers: string[];
  };
};

type PushCapacity = {
  offerCount: number;
  mappableCount: number;
  pushCount: number;
  limit: number | null;
  existingOnSb: number | null;
};

type PushResponse = {
  ok?: boolean;
  dryRun?: boolean;
  countOnly?: boolean;
  error?: string;
  eventId?: number;
  eventName?: string;
  matchId?: string;
  markupPercent?: number;
  offerCount?: number;
  mappableCount?: number;
  pushCount?: number;
  limit?: number | null;
  offset?: number;
  hasMore?: boolean;
  created?: number;
  failed?: number;
  tickets?: TicketPayload[];
  results?: Array<{
    offerIndex: number;
    ok: boolean;
    status?: number;
    summary: TicketPayload["summary"];
    response?: unknown;
    error?: string;
  }>;
};

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-snug">
      <dt className="w-28 shrink-0 font-medium text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-zinc-200">{value || "—"}</dd>
    </div>
  );
}

export function SbApiControls({ className, eventId: fixedEventId, eventName: fixedEventName, sbEventId: fixedSbId, eventOptions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const [savedLimit, setSavedLimit] = useState<string | null>(null);
  const [displayedTickets, setDisplayedTickets] = useState<TicketPayload[]>([]);
  const [previewMeta, setPreviewMeta] = useState<PushResponse | null>(null);
  const [previewPaged, setPreviewPaged] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [capacity, setCapacity] = useState<PushCapacity | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<number | "">(
    fixedEventId ?? eventOptions?.[0]?.id ?? "",
  );
  const [tournamentId, setTournamentId] = useState("64");
  const [tournaments, setTournaments] = useState<SbTournamentOption[]>([]);
  const [localSbEventId, setLocalSbEventId] = useState<string | null>(null);
  const [sbMatchDetail, setSbMatchDetail] = useState<unknown>(null);
  const [sbMatchDetailError, setSbMatchDetailError] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const [sbStatus, setSbStatus] = useState<SbStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pushResult, setPushResult] = useState<PushResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const titleId = useId();
  const pushConfirmTitleId = useId();
  const didInitOpenRef = useRef(false);
  const lastPanelLoadKeyRef = useRef<string | null>(null);
  const panelLoadInFlightRef = useRef(false);
  const panelLoadSeqRef = useRef(0);
  const previewSeqRef = useRef(0);
  const needsPageRefreshRef = useRef(false);
  const eventNameRef = useRef("");
  const tournamentIdRef = useRef("64");
  const sbEventIdFromPropsRef = useRef<string | null>(null);

  const resolvedEventId = fixedEventId ?? (typeof selectedEventId === "number" ? selectedEventId : null);
  const selectedFromList = eventOptions?.find((e) => e.id === resolvedEventId);
  const eventName = fixedEventName ?? selectedFromList?.name ?? "";
  const sbEventIdFromProps = fixedSbId ?? selectedFromList?.sbEventId ?? null;
  const sbEventId = localSbEventId ?? sbEventIdFromProps;
  const hasSbId = Boolean((sbEventId ?? "").trim());

  eventNameRef.current = eventName;
  tournamentIdRef.current = tournamentId;
  sbEventIdFromPropsRef.current = sbEventIdFromProps;

  const saveSbMatchId = useCallback(
    async (matchId: string) => {
      if (!resolvedEventId) return false;
      const fd = new FormData();
      fd.set("id", String(resolvedEventId));
      fd.set("sbEventId", matchId);
      const result = await updateSbEventIdAction(fd);
      if (result.ok) {
        setLocalSbEventId(matchId);
        needsPageRefreshRef.current = true;
        return true;
      }
      setError(result.fieldErrors._form ?? result.fieldErrors.sbEventId ?? "Could not save SB match_id.");
      return false;
    },
    [resolvedEventId],
  );

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const url = hasSbId
        ? `/api/seatsbrokers/status?matchId=${encodeURIComponent(sbEventId!.trim())}`
        : "/api/seatsbrokers/status";
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as SbStatusResponse;
      setSbStatus(data);
    } catch (e) {
      setSbStatus({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setStatusLoading(false);
    }
  }, [hasSbId, sbEventId]);

  const buildLivePushParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("dryRun", "0");
    const parsed = parseLimitDraft(savedLimit ?? "");
    if (parsed.mode === "exact") {
      params.set("limit", String(parsed.count));
    }
    return params;
  }, [savedLimit]);

  const applyLimitSave = useCallback(
    async (append = false) => {
      if (!resolvedEventId || !hasSbId) return;

      const draftForMode = append ? (savedLimit ?? "") : limitDraft;
      const parsed = parseLimitDraft(draftForMode);
      const requestId = ++previewSeqRef.current;
      setPreviewing(true);
      setError(null);

      if (!append) {
        setSavedLimit(limitDraft.trim());
      }

      const offset = append && previewPaged ? previewOffset : 0;
      const pageLimit = parsed.mode === "exact" ? parsed.count : PREVIEW_PAGE_SIZE;

      try {
        const params = new URLSearchParams();
        params.set("dryRun", "1");
        params.set("limit", String(pageLimit));
        params.set("offset", String(offset));

        const res = await fetch(`/api/events/${resolvedEventId}/push-to-seatsbrokers?${params.toString()}`, {
          method: "POST",
        });
        const data = (await res.json()) as PushResponse;
        if (requestId !== previewSeqRef.current) return;

        if (!res.ok) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }

        const batch = data.tickets ?? [];
        setPreviewMeta(data);
        setDisplayedTickets((prev) => (append ? [...prev, ...batch] : batch));
        setPreviewOffset(offset + batch.length);
        setPreviewPaged(parsed.mode === "all");
      } catch (e) {
        if (requestId !== previewSeqRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (requestId !== previewSeqRef.current) return;
        setPreviewing(false);
      }
    },
    [resolvedEventId, hasSbId, limitDraft, savedLimit, previewPaged, previewOffset],
  );

  const runLivePush = useCallback(async () => {
    if (!resolvedEventId) {
      setError("Select an event first.");
      return;
    }
    if (savedLimit === null) {
      setError("Set max offers and click Save before pushing.");
      return;
    }

    setPushing(true);
    setPushResult(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/events/${resolvedEventId}/push-to-seatsbrokers?${buildLivePushParams().toString()}`,
        { method: "POST" },
      );
      const data = (await res.json()) as PushResponse;
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        setPushResult(data);
        return;
      }
      setPushResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }, [resolvedEventId, savedLimit, buildLivePushParams]);

  const buildCountOnlyParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("dryRun", "1");
    params.set("countOnly", "1");
    return params;
  }, []);

  const refreshPanel = useCallback(
    async (opts?: { force?: boolean; previewOnly?: boolean }) => {
      const eventId = resolvedEventId;
      const name = eventNameRef.current.trim();
      const tourId = tournamentIdRef.current;
      if (!eventId || !name) return;

      const loadKey = `${eventId}:${tourId}`;
      if (!opts?.force && lastPanelLoadKeyRef.current === loadKey && !opts?.previewOnly) {
        return;
      }
      if (panelLoadInFlightRef.current) return;

      panelLoadInFlightRef.current = true;
      const loadSeq = ++panelLoadSeqRef.current;

      if (!opts?.previewOnly) {
        lastPanelLoadKeyRef.current = loadKey;
        setResolving(true);
        setResolveNote(null);
      }

      let existingOnSb: number | null = null;
      let canPreview = Boolean((localSbEventId ?? sbEventIdFromPropsRef.current ?? "").trim());

      try {
        if (!opts?.previewOnly) {
          const params = new URLSearchParams();
          params.set("tournamentId", tourId);
          params.set("eventName", name);

          const res = await fetch(`/api/seatsbrokers/events?${params.toString()}`, { cache: "no-store" });
          if (loadSeq !== panelLoadSeqRef.current) return;

          const data = (await res.json()) as SbEventsFetchResponse;
          if (data.tournaments?.length) setTournaments(data.tournaments);

          if (!res.ok || !data.ok) {
            setResolveNote(data.error ?? `Could not load SB events (${res.status})`);
            canPreview = Boolean((sbEventIdFromPropsRef.current ?? "").trim());
          } else {
            const suggested = data.suggested;
            if (!suggested) {
              setResolveNote(
                data.matches?.length
                  ? `No auto-match for "${name}" among ${data.matches.length} matches — set SB ID manually.`
                  : `No matches in tournament ${data.tournamentId}.`,
              );
              canPreview = Boolean((sbEventIdFromPropsRef.current ?? "").trim());
            } else {
              setResolveNote(`Matched: ${suggested.label}`);

              if (data.suggestedDetail?.tickets != null) {
                setSbMatchDetail(data.suggestedDetail.tickets);
                setSbMatchDetailError(data.suggestedDetail.ticketsError ?? null);
                existingOnSb = countSbTicketListings(data.suggestedDetail.tickets);
              }

              const currentId = (sbEventIdFromPropsRef.current ?? "").trim();
              if (currentId !== suggested.matchId) {
                const saved = await saveSbMatchId(suggested.matchId);
                if (saved) {
                  setResolveNote(`Saved SB match_id ${suggested.matchId} (${suggested.label})`);
                  sbEventIdFromPropsRef.current = suggested.matchId;
                  canPreview = true;
                }
              } else {
                setLocalSbEventId(suggested.matchId);
                canPreview = true;
              }
            }
          }
        }

        if (!canPreview) return;

        setCapacityLoading(true);
        const countRes = await fetch(
          `/api/events/${eventId}/push-to-seatsbrokers?${buildCountOnlyParams().toString()}`,
          { method: "POST" },
        );
        const countData = (await countRes.json()) as PushResponse;
        if (loadSeq === panelLoadSeqRef.current && countRes.ok && countData.ok) {
          setCapacity({
            offerCount: countData.offerCount ?? 0,
            mappableCount: countData.mappableCount ?? countData.offerCount ?? 0,
            pushCount: countData.mappableCount ?? countData.pushCount ?? 0,
            limit: countData.limit ?? null,
            existingOnSb: existingOnSb ?? countSbTicketListings(sbMatchDetail),
          });
        }
        setCapacityLoading(false);
      } catch (e) {
        if (loadSeq === panelLoadSeqRef.current) {
          setResolveNote(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (loadSeq === panelLoadSeqRef.current) {
          setResolving(false);
          panelLoadInFlightRef.current = false;
        }
      }
    },
    [resolvedEventId, saveSbMatchId, buildCountOnlyParams, localSbEventId, sbMatchDetail],
  );

  const busy = previewing || pushing || resolving;

  useEffect(() => {
    if (!open) {
      didInitOpenRef.current = false;
      return;
    }
    if (didInitOpenRef.current) return;
    didInitOpenRef.current = true;
    setError(null);
    setPushResult(null);
    setLimitDraft("");
    setSavedLimit(null);
    setDisplayedTickets([]);
    setPreviewMeta(null);
    setPreviewPaged(false);
    setPreviewOffset(0);
    setLocalSbEventId(null);
    setResolveNote(null);
    setSbMatchDetail(null);
    setCapacity(null);
    lastPanelLoadKeyRef.current = null;
    panelLoadInFlightRef.current = false;
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per open
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  useEffect(() => {
    if (!open || !resolvedEventId) return;
    const loadKey = `${resolvedEventId}:${tournamentId}`;
    if (lastPanelLoadKeyRef.current === loadKey) return;
    void refreshPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event/tournament id only
  }, [open, resolvedEventId, tournamentId]);

  useEffect(() => {
    if (open || !needsPageRefreshRef.current) return;
    needsPageRefreshRef.current = false;
    router.refresh();
  }, [open, router]);

  const tickets = displayedTickets;
  const displayResult = pushResult ?? null;
  const mappableTotal = previewMeta?.mappableCount ?? capacity?.mappableCount ?? 0;
  const canShowMore = previewPaged && tickets.length < mappableTotal;
  const limitDirty = savedLimit === null || limitDraft.trim() !== savedLimit;
  const hasPreview = savedLimit !== null && (tickets.length > 0 || previewMeta != null);

  const pushBatchCount = (() => {
    const parsed = parseLimitDraft(savedLimit ?? "");
    if (parsed.mode === "exact") {
      return Math.min(parsed.count, capacity?.mappableCount ?? parsed.count);
    }
    return capacity?.mappableCount ?? previewMeta?.mappableCount ?? "all available";
  })();

  useEffect(() => {
    if (!pushConfirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pushing) setPushConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pushConfirmOpen, pushing]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? pillIdle}
        title="SeatsBrokers seller API — preview payloads and push listings"
      >
        SB API
      </button>

      {open ? (
        <ModalPortal
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[min(92vh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-white/[0.06] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
                    SeatsBrokers API
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                    Preview transformed offers mapped to{" "}
                    <code className="text-zinc-400">POST ticket/create</code>, then push live to the sandbox seller
                    API. Uses the same seat rules and markup as our internal API.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sbStatus?.configured === false ? (
                    <span className="rounded-full border border-red-500/40 bg-red-950/30 px-2.5 py-1 text-[10px] font-semibold text-red-200">
                      Not configured
                    </span>
                  ) : sbStatus?.ok ? (
                    <span className="rounded-full border border-emerald-500/35 bg-emerald-950/25 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                      SB connected
                    </span>
                  ) : statusLoading ? (
                    <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] text-zinc-400">
                      Checking…
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/35 bg-amber-950/25 px-2.5 py-1 text-[10px] font-semibold text-amber-200">
                      SB unreachable
                    </span>
                  )}
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
              {/* Event + settings */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label htmlFor="sb-api-tournament" className={sectionTitle}>
                    SB tournament
                  </label>
                  <select
                    id="sb-api-tournament"
                    value={tournamentId}
                    disabled={busy}
                    onChange={(e) => {
                      setTournamentId(e.target.value);
                      lastPanelLoadKeyRef.current = null;
                    }}
                    className="rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                  >
                    {(tournaments.length ? tournaments : [{ id: tournamentId, name: `Tournament ${tournamentId}` }]).map(
                      (t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (id {t.id})
                        </option>
                      ),
                    )}
                  </select>
                  <p className="text-[10px] text-zinc-600">
                    Loads matches via POST /events · default World Cup 2026 (64)
                  </p>
                </div>

                {eventOptions && !fixedEventId ? (
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label htmlFor="sb-api-event" className={sectionTitle}>
                      Event
                    </label>
                    <select
                      id="sb-api-event"
                      value={selectedEventId}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        setSelectedEventId(Number.isFinite(v) ? v : "");
                        lastPanelLoadKeyRef.current = null;
                      }}
                      className="rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                    >
                      {eventOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} (id {e.id}
                          {e.sbEventId ? ` · SB ${e.sbEventId}` : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <dl className="space-y-1 rounded-xl border border-white/[0.08] bg-black/25 p-3 text-xs ring-1 ring-white/[0.04]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Event</dt>
                    <dd className="text-right font-medium text-zinc-200">{eventName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">Internal id</dt>
                    <dd className="font-mono text-zinc-300">{resolvedEventId ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-zinc-500">SB match_id</dt>
                    <dd className="font-mono text-sky-300/90">{hasSbId ? sbEventId : "—"}</dd>
                  </div>
                  {previewMeta?.markupPercent != null ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-500">Markup applied</dt>
                      <dd className="font-mono text-zinc-300">+{previewMeta.markupPercent}%</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-black/25 p-3 ring-1 ring-white/[0.04] sm:col-span-2">
                  <p className={sectionTitle}>Listing capacity</p>
                  {capacityLoading && !capacity ? (
                    <p className="text-xs text-zinc-500">Counting pushable offers…</p>
                  ) : capacity ? (
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-3 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-emerald-200/70">
                          Can create from inventory
                        </dt>
                        <dd className="mt-1 font-mono text-lg font-semibold text-emerald-100">
                          {capacity.mappableCount.toLocaleString()}
                        </dd>
                        <dd className="text-[10px] text-emerald-200/60">
                          {capacity.offerCount.toLocaleString()} transformed offer buckets
                        </dd>
                      </div>
                      <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Already on SB match</dt>
                        <dd className="mt-1 font-mono text-lg font-semibold text-zinc-200">
                          {capacity.existingOnSb != null ? capacity.existingOnSb.toLocaleString() : "—"}
                        </dd>
                        <dd className="text-[10px] text-zinc-600">From SB ticket list API</dd>
                      </div>
                    </dl>
                  ) : hasSbId ? (
                    <button
                      type="button"
                      className="text-left text-xs text-sky-300/90 hover:text-sky-200"
                      onClick={() => void refreshPanel({ force: true })}
                    >
                      Load offer counts
                    </button>
                  ) : (
                    <p className="text-xs text-zinc-600">Set match_id to see how many listings you can push.</p>
                  )}

                  <div className="mt-1 flex flex-wrap items-end gap-2">
                    <div className="min-w-[8rem] flex-1">
                      <label htmlFor="sb-api-limit" className={sectionTitle}>
                        Max offers per push (optional)
                      </label>
                      <input
                        id="sb-api-limit"
                        type="number"
                        min={1}
                        max={500}
                        placeholder="All"
                        value={limitDraft}
                        disabled={busy}
                        onChange={(e) => setLimitDraft(e.target.value)}
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                      />
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setLimitDraft("")}
                    >
                      Push all
                    </button>
                    {limitDirty ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={busy || !hasSbId || !resolvedEventId}
                        onClick={() => void applyLimitSave(false)}
                      >
                        {previewing && !canShowMore ? "Saving…" : "Save"}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[10px] leading-relaxed text-zinc-600">
                    Type a number and click <strong className="text-zinc-400">Save</strong> to preview that many. Leave
                    empty (Push all) and Save to preview {PREVIEW_PAGE_SIZE} at a time with More for the next batch.
                  </p>
                </div>
              </section>

              {resolving ? (
                <p className="text-xs text-zinc-500">Resolving match_id from SeatsBrokers (tournament {tournamentId})…</p>
              ) : null}

              {resolveNote ? (
                <p className="rounded-lg border border-sky-500/25 bg-sky-950/20 px-3 py-2 text-xs text-sky-100">
                  {resolveNote}
                </p>
              ) : null}

              {!hasSbId && !resolving ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  No <strong>match_id</strong> yet — we try to match this event name against SB events for the selected
                  tournament.
                </p>
              ) : null}

              {(sbMatchDetail != null || sbMatchDetailError) && (
                <section className="space-y-2">
                  <h3 className={sectionTitle}>SeatsBrokers match response (ticket list)</h3>
                  {sbMatchDetailError ? (
                    <p className="text-xs text-amber-200/90">{sbMatchDetailError}</p>
                  ) : null}
                  {sbMatchDetail != null ? (
                    <pre className="max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-[10px] text-zinc-300">
                      {JSON.stringify(sbMatchDetail, null, 2)}
                    </pre>
                  ) : null}
                </section>
              )}

              {error ? (
                <p className="rounded-lg border border-red-500/30 bg-red-950/25 px-3 py-2 text-xs text-red-200">{error}</p>
              ) : null}

              {/* What we send */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={sectionTitle}>What we send (ticket/create)</h3>
                  {hasPreview && !limitDirty ? (
                    <button
                      type="button"
                      className="text-[10px] font-medium text-sky-300/90 hover:text-sky-200 disabled:opacity-50"
                      disabled={busy || !hasSbId || !resolvedEventId}
                      onClick={() => void applyLimitSave(false)}
                    >
                      {previewing ? "Refreshing…" : "Refresh preview"}
                    </button>
                  ) : null}
                </div>

                {!hasPreview && !previewing ? (
                  <p className="text-xs text-zinc-500">Set max offers and click Save to load a preview.</p>
                ) : null}

                {hasPreview ? (
                  <p className="text-xs text-zinc-500">
                    Showing <strong className="text-zinc-300">{tickets.length}</strong> listing
                    {tickets.length === 1 ? "" : "s"} in preview
                    {mappableTotal > tickets.length ? (
                      <>
                        {" "}
                        of <strong className="text-zinc-300">{mappableTotal.toLocaleString()}</strong>
                      </>
                    ) : null}{" "}
                    · dry run
                    {previewing ? <span className="ml-1 text-zinc-600">· loading…</span> : null}
                  </p>
                ) : previewing ? (
                  <p className="text-xs text-zinc-500">Loading preview…</p>
                ) : null}

                <div className={`space-y-3 ${previewing ? "opacity-70" : ""}`}>
                  {tickets.length === 0 && hasPreview && !previewing ? (
                    <p className="text-xs text-zinc-500">No offers to push for this event.</p>
                  ) : null}
                  {tickets.map((t, i) => (
                    <article
                      key={i}
                      className="rounded-xl border border-white/[0.08] bg-black/30 p-3 ring-1 ring-white/[0.04]"
                    >
                      <p className="mb-2 text-xs font-semibold text-zinc-200">
                        Offer #{i + 1}{" "}
                        <span className="font-normal text-zinc-500">
                          · {t.summary.offerType} · qty {t.summary.quantity} · ${t.summary.priceUsd ?? "—"}
                        </span>
                      </p>
                      <dl className="space-y-1">
                        <FieldRow label="match_id" value={t.fields.match_id ?? ""} />
                        <FieldRow label="quantity" value={t.fields.quantity ?? ""} />
                        <FieldRow label="price" value={`${t.fields.price ?? ""} ${t.fields.price_type ?? ""}`} />
                        <FieldRow label="ticket_category" value={t.fields.ticket_category ?? ""} />
                        <FieldRow label="ticket_block" value={t.fields.ticket_block ?? ""} />
                        <FieldRow label="ticket_row" value={t.fields.ticket_row ?? ""} />
                        <FieldRow label="ticket_details" value={t.fields.ticket_details ?? ""} />
                        <FieldRow label="split_type" value={t.fields.split_type ?? ""} />
                        <FieldRow label="ticket_type" value={t.fields.ticket_type ?? ""} />
                      </dl>
                    </article>
                  ))}
                  {canShowMore ? (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50"
                      disabled={busy || previewing}
                      onClick={() => void applyLimitSave(true)}
                    >
                      {previewing ? "Loading…" : `More (${Math.min(PREVIEW_PAGE_SIZE, mappableTotal - tickets.length)} next)`}
                    </button>
                  ) : null}
                </div>
              </section>

              {/* Response */}
              {displayResult && !displayResult.dryRun ? (
                <section className="space-y-2">
                  <h3 className={sectionTitle}>SeatsBrokers response</h3>
                  <p className="text-xs text-zinc-400">
                    Created: <span className="font-semibold text-emerald-400">{displayResult.created ?? 0}</span> ·
                    Failed: <span className="font-semibold text-red-400">{displayResult.failed ?? 0}</span>
                  </p>
                  <div className="space-y-2">
                    {displayResult.results?.map((r, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          r.ok
                            ? "border-emerald-500/25 bg-emerald-950/15 text-emerald-100"
                            : "border-red-500/25 bg-red-950/15 text-red-100"
                        }`}
                      >
                        <p className="font-semibold">
                          Offer #{r.offerIndex + 1} · HTTP {r.status ?? "—"} · {r.ok ? "OK" : "Failed"}
                        </p>
                        {!r.ok && r.error ? <p className="mt-1 opacity-90">{r.error}</p> : null}
                        {r.response != null ? (
                          <pre className="mt-2 max-h-24 overflow-auto text-[10px] opacity-80">
                            {typeof r.response === "string" ? r.response : JSON.stringify(r.response, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {(previewMeta || pushResult) && showRaw ? (
                <section className="space-y-2">
                  <h3 className={sectionTitle}>Raw JSON</h3>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-3 text-[10px] text-zinc-300">
                    {JSON.stringify(pushResult ?? { ...previewMeta, tickets }, null, 2)}
                  </pre>
                </section>
              ) : null}

              <button
                type="button"
                className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide" : "Show"} raw JSON
              </button>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-zinc-300"
                disabled={statusLoading}
                onClick={() => void loadStatus()}
              >
                {statusLoading ? "Checking SB…" : "Recheck SB connection"}
              </button>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => setOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !hasSbId || !resolvedEventId || savedLimit === null}
                  onClick={() => setPushConfirmOpen(true)}
                >
                  {pushing ? "Pushing to SB…" : "Push to SB"}
                </button>
              </div>
            </footer>
          </div>
        </ModalPortal>
      ) : null}

      {pushConfirmOpen ? (
        <ModalPortal
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/75 p-4 backdrop-blur-md"
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget && !pushing) setPushConfirmOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={pushConfirmTitleId}
            className="w-full max-w-md rounded-2xl border border-amber-500/25 bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] p-5 shadow-2xl shadow-black/55 ring-1 ring-amber-500/20"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={pushConfirmTitleId} className="text-base font-semibold text-zinc-100">
              Push listings to SeatsBrokers?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This will call <code className="text-zinc-300">POST ticket/create</code> on the{" "}
              <strong className="text-zinc-200">live sandbox</strong> seller API. Listings are created on SB and cannot
              be undone from this app.
            </p>
            <dl className="mt-4 space-y-2 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Event</dt>
                <dd className="text-right font-medium text-zinc-200">{eventName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">SB match_id</dt>
                <dd className="font-mono text-sky-300/90">{sbEventId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Listings to push</dt>
                <dd className="font-mono font-semibold text-amber-200/95">{String(pushBatchCount)}</dd>
              </div>
              {capacity?.mappableCount != null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Total pushable</dt>
                  <dd className="font-mono text-zinc-300">{capacity.mappableCount.toLocaleString()}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={pushing}
                onClick={() => setPushConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={pushing}
                onClick={() => {
                  setPushConfirmOpen(false);
                  void runLivePush();
                }}
              >
                {pushing ? "Pushing…" : "Yes, push to SB"}
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
