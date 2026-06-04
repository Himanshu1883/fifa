"use client";

import { updateSbEventIdAction } from "@/app/actions/event-sb-id";
import { syncEventDateAction } from "@/app/actions/sync-event-date";
import { ModalPortal } from "@/app/modal-portal";
import { SbListingHistoryModal } from "@/app/sb-listing-history-modal";
import { computeDateToShip } from "@/lib/sb-date-to-ship";
import { DEFAULT_SB_TICKET_TYPE_ID, SB_TICKET_TYPES } from "@/lib/sb-ticket-types";
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

/** SB push/preview only includes SockAvailable RESALE rows (not LAST_MINUTE). */
const SB_PUSH_KIND = "RESALE";

function appendSbPushQueryParams(params: URLSearchParams, ticketType: string) {
  params.set("kind", SB_PUSH_KIND);
  params.set("ticketType", ticketType);
}

type LimitMode = { mode: "all" } | { mode: "exact"; count: number };

function computeDateToShipLabel(eventDateIso: string): string {
  return computeDateToShip(eventDateIso) ?? "—";
}

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
  eventDate?: string | null;
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

type SbBlockOption = { rowId: string; blockId: string };

type TicketPayload = {
  offerIndex?: number;
  sbBlockOptions?: SbBlockOption[];
  fields: Record<string, string>;
  summary: {
    offerType: string;
    quantity: number;
    priceUsd: number | null;
    priceRaw?: string | null;
    fifaCategoryId?: string;
    sbCategoryId?: string;
    categoryName?: string;
    categoryNum?: number | null;
    categoryLabel?: string;
    fifaBlockId?: string;
    sbBlockId?: string;
    sbBlockCode?: string;
    sbBlockMatched?: boolean;
    sbBlockOptions?: SbBlockOption[];
    blockName?: string;
    row: string;
    seatNumbers: string[];
    faceValueDefaultedToPrice?: boolean;
  };
};

type PreviewOfferRow = {
  id: string;
  offerIndex: number;
  ticket: TicketPayload;
  included: boolean;
  editing: boolean;
};

function ticketRowId(offerIndex: number, t: TicketPayload): string {
  return `${offerIndex}-${t.summary.fifaBlockId ?? t.summary.sbBlockId ?? ""}-${t.summary.seatNumbers.join("|")}`;
}

function formatPreviewPrice(summary: TicketPayload["summary"]): string {
  if (summary.priceUsd != null && Number.isFinite(summary.priceUsd) && summary.priceUsd > 0) {
    return `$${summary.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (summary.priceRaw) return `— (raw ${summary.priceRaw})`;
  return "— (no price)";
}

function applyTicketFieldUpdate(ticket: TicketPayload, field: string, value: string): TicketPayload {
  const fields = { ...ticket.fields, [field]: value };
  const summary = { ...ticket.summary };
  if (field === "price") {
    const n = Number.parseFloat(value);
    summary.priceUsd = Number.isFinite(n) ? n : null;
  }
  if (field === "quantity") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) summary.quantity = n;
  }
  if (field === "ticket_details") {
    summary.seatNumbers = value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (field === "ticket_row") summary.row = value;
  if (field === "ticket_block") {
    const opt = ticket.sbBlockOptions?.find((b) => b.rowId === value || b.blockId === value);
    const rowId = opt?.rowId ?? value;
    fields.ticket_block = rowId;
    summary.sbBlockId = rowId;
    summary.sbBlockCode = opt?.blockId ?? "";
    summary.sbBlockMatched = Boolean(rowId.trim());
  }
  if (field === "ticket_category") {
    summary.sbCategoryId = value;
    const n = Number.parseInt(value, 10);
    if (n === 13 || n === 14 || n === 15 || n === 16) {
      const numMap: Record<number, 1 | 2 | 3 | 4> = { 16: 1, 15: 2, 14: 3, 13: 4 };
      summary.categoryNum = numMap[n] ?? null;
    } else {
      summary.categoryNum = n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
    }
    summary.categoryLabel =
      summary.categoryNum != null ? `Category ${summary.categoryNum}` : (summary.categoryName ?? "—");
  }
  return { ...ticket, fields, summary };
}

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
  inventoryKind?: string;
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
  eventDate?: string | null;
  dateToShip?: string | null;
  created?: number;
  failed?: number;
  skipped?: number;
  tickets?: TicketPayload[];
  results?: Array<{
    offerIndex: number;
    ok: boolean;
    status?: number;
    sbTicketId?: string | null;
    fields?: Record<string, string>;
    summary: TicketPayload["summary"];
    response?: unknown;
    error?: string;
    skipped?: boolean;
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
  const [previewRows, setPreviewRows] = useState<PreviewOfferRow[]>([]);
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
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const [autoPushToggling, setAutoPushToggling] = useState(false);
  const [eventAutoPushEligible, setEventAutoPushEligible] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState(DEFAULT_SB_TICKET_TYPE_ID);
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
  const ticketTypeIdRef = useRef(DEFAULT_SB_TICKET_TYPE_ID);
  const sbEventIdFromPropsRef = useRef<string | null>(null);

  const resolvedEventId = fixedEventId ?? (typeof selectedEventId === "number" ? selectedEventId : null);
  const selectedFromList = eventOptions?.find((e) => e.id === resolvedEventId);
  const eventName = fixedEventName ?? selectedFromList?.name ?? "";
  const sbEventIdFromProps = fixedSbId ?? selectedFromList?.sbEventId ?? null;
  const sbEventId = localSbEventId ?? sbEventIdFromProps;
  const hasSbId = Boolean((sbEventId ?? "").trim());

  eventNameRef.current = eventName;
  tournamentIdRef.current = tournamentId;
  ticketTypeIdRef.current = ticketTypeId;
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

  const loadAutoPushState = useCallback(async () => {
    if (!resolvedEventId) {
      setEventAutoPushEligible(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/seatsbrokers/auto-push?eventId=${encodeURIComponent(String(resolvedEventId))}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        enabled?: boolean;
        eventEligible?: boolean;
        ticketType?: string;
      };
      if (res.ok) {
        setAutoPushEnabled(Boolean(data.enabled));
        setEventAutoPushEligible(Boolean(data.eventEligible));
        if (data.ticketType) {
          setTicketTypeId(data.ticketType);
        }
      }
    } catch {
      /* ignore */
    }
  }, [resolvedEventId]);

  const setAutoPush = useCallback(
    async (enabled: boolean) => {
      setAutoPushToggling(true);
      try {
        const body: { enabled: boolean; eventId?: number } = { enabled };
        if (enabled && resolvedEventId != null) {
          body.eventId = resolvedEventId;
        }
        const res = await fetch("/api/seatsbrokers/auto-push", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          enabled?: boolean;
          error?: string;
          autoPushRun?: { ran?: boolean; created?: number; skippedReason?: string };
        };
        if (!res.ok) {
          setError(data.error ?? "Could not update auto-push setting.");
          return;
        }
        setAutoPushEnabled(Boolean(data.enabled));
        if (enabled && data.autoPushRun?.ran && (data.autoPushRun.created ?? 0) > 0) {
          void loadStatus();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setAutoPushToggling(false);
      }
    },
    [resolvedEventId, loadStatus],
  );

  const patchPreviewTicketType = useCallback((typeId: string) => {
    setPreviewRows((prev) =>
      prev.map((r) => ({
        ...r,
        ticket: {
          ...r.ticket,
          fields: { ...r.ticket.fields, ticket_type: typeId },
        },
      })),
    );
  }, []);

  const saveTicketType = useCallback(
    async (typeId: string) => {
      setTicketTypeId(typeId);
      patchPreviewTicketType(typeId);
      try {
        await fetch("/api/seatsbrokers/auto-push", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketType: typeId }),
        });
      } catch {
        /* ignore */
      }
    },
    [patchPreviewTicketType],
  );

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
        appendSbPushQueryParams(params, ticketTypeIdRef.current);

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
        const newRows: PreviewOfferRow[] = batch.map((t, i) => {
          const offerIndex = t.offerIndex ?? offset + i;
          return {
            id: ticketRowId(offerIndex, t),
            offerIndex,
            ticket: {
              ...t,
              offerIndex,
              sbBlockOptions: t.sbBlockOptions ?? t.summary?.sbBlockOptions ?? [],
            },
            included: true,
            editing: false,
          };
        });
        setPreviewMeta(data);
        setPreviewRows((prev) => (append ? [...prev, ...newRows] : newRows));
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

    const selected = previewRows.filter((r) => r.included).map((r) => r.ticket);
    if (selected.length === 0) {
      setError("Select at least one listing to push (checkboxes in preview).");
      return;
    }

    setPushing(true);
    setPushResult(null);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("dryRun", "0");
      appendSbPushQueryParams(params, ticketTypeIdRef.current);
      const res = await fetch(`/api/events/${resolvedEventId}/push-to-seatsbrokers?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: selected.map((t) => ({
            offerIndex: t.offerIndex,
            fields: t.fields,
            summary: t.summary,
          })),
        }),
      });
      const data = (await res.json()) as PushResponse;
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        setPushResult(data);
        return;
      }
      setPushResult(data);
      if (data.created && data.created > 0) {
        void loadAutoPushState();
        void applyLimitSave(false);
        window.dispatchEvent(
          new CustomEvent("sb-listing-pushed", { detail: { eventId: resolvedEventId } }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }, [resolvedEventId, savedLimit, previewRows, loadAutoPushState, applyLimitSave]);

  const buildCountOnlyParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("dryRun", "1");
    params.set("countOnly", "1");
    appendSbPushQueryParams(params, ticketTypeIdRef.current);
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

              const sbEventDate = suggested.eventDate?.trim();
              if (sbEventDate && resolvedEventId) {
                const synced = await syncEventDateAction(resolvedEventId, sbEventDate);
                if (synced.ok) {
                  const shipLabel = computeDateToShipLabel(sbEventDate);
                  setResolveNote(
                    (note) =>
                      `${note ?? `Matched: ${suggested.label}`} · Event date ${sbEventDate} (ship ${shipLabel})`,
                  );
                }
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

  const panelBusy = previewing || pushing || resolving;
  const busy = panelBusy || autoPushToggling;

  useEffect(() => {
    if (!open) return;
    void loadAutoPushState();
  }, [open, loadAutoPushState]);

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
    setPreviewRows([]);
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
      if (e.key !== "Escape" || busy) return;
      if (historyOpen) {
        setHistoryOpen(false);
        return;
      }
      if (pushConfirmOpen) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, historyOpen, pushConfirmOpen]);

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

  const displayResult = pushResult ?? null;
  const mappableTotal = previewMeta?.mappableCount ?? capacity?.mappableCount ?? 0;
  const canShowMore = previewPaged && previewRows.length < mappableTotal;
  const limitDirty = savedLimit === null || limitDraft.trim() !== savedLimit;
  const hasPreview = savedLimit !== null && (previewRows.length > 0 || previewMeta != null);
  const includedCount = previewRows.filter((r) => r.included).length;
  const excludedCount = previewRows.length - includedCount;

  const pushBatchCount = includedCount > 0 ? includedCount : 0;

  const setAllIncluded = (included: boolean) => {
    setPreviewRows((rows) => rows.map((r) => ({ ...r, included })));
  };

  const updatePreviewRow = (id: string, patch: Partial<PreviewOfferRow> | ((row: PreviewOfferRow) => PreviewOfferRow)) => {
    setPreviewRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        return typeof patch === "function" ? patch(r) : { ...r, ...patch };
      }),
    );
  };

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
            if (e.target === e.currentTarget && !busy && !historyOpen) setOpen(false);
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
                    Preview transformed <strong className="font-medium text-zinc-400">RESALE</strong> offers mapped to{" "}
                    <code className="text-zinc-400">POST ticket/create</code>, then push live to the sandbox seller
                    API. Duplicate listings are never pushed twice (manual or auto).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {resolvedEventId ? (
                    <button
                      type="button"
                      disabled={panelBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistoryOpen(true);
                      }}
                      className="rounded-lg border border-violet-500/35 bg-violet-950/25 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-950/40 disabled:opacity-50"
                    >
                      Listing history
                    </button>
                  ) : null}
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

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-zinc-200">Auto-push to SeatsBrokers</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoPushEnabled}
                    disabled={panelBusy || autoPushToggling}
                    onClick={() => void setAutoPush(!autoPushEnabled)}
                    className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                      autoPushEnabled
                        ? "border-emerald-500/50 bg-emerald-600/80"
                        : "border-white/15 bg-zinc-700/80"
                    } ${panelBusy || autoPushToggling ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        autoPushEnabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-zinc-500">{autoPushEnabled ? "On" : "Off"}</span>
                  {autoPushEnabled ? (
                    <span className="text-[10px] text-emerald-400/90">· every 3s while this app is open</span>
                  ) : null}
                </div>
                {eventAutoPushEligible ? (
                  <span className="rounded-full border border-sky-500/30 bg-sky-950/20 px-2 py-0.5 text-[10px] text-sky-200">
                    Auto-push eligible
                  </span>
                ) : (
                  <span className="max-w-md text-[10px] text-zinc-600">
                    Push once manually to enable auto-push for this event
                  </span>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
              {/* Event + settings */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label htmlFor="sb-api-ticket-type" className={sectionTitle}>
                    Ticket type
                  </label>
                  <select
                    id="sb-api-ticket-type"
                    value={ticketTypeId}
                    disabled={busy}
                    onChange={(e) => void saveTicketType(e.target.value)}
                    className="rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                  >
                    {SB_TICKET_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (id {t.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-600">
                    Sent as <code className="text-zinc-500">ticket_type</code> on create · default Mobile Ticket (4)
                  </p>
                </div>

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
                  {previewMeta?.eventDate ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-500">Event date</dt>
                      <dd className="font-mono text-zinc-300">{previewMeta.eventDate}</dd>
                    </div>
                  ) : null}
                  {previewMeta?.dateToShip ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-500">date_to_ship</dt>
                      <dd className="font-mono text-emerald-300/90">{previewMeta.dateToShip}</dd>
                    </div>
                  ) : null}
                  {previewMeta?.markupPercent != null ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-zinc-500">Markup applied</dt>
                      <dd className="font-mono text-zinc-300">+{previewMeta.markupPercent}%</dd>
                    </div>
                  ) : null}
                </dl>
                {!previewMeta?.dateToShip && hasSbId ? (
                  <p className="text-[10px] text-amber-200/90">
                    Set event date on this event (Edit event) — SB listings need date_to_ship = event date − 2 days.
                  </p>
                ) : null}

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
                    empty (Push all) and Save to preview {PREVIEW_PAGE_SIZE} at a time with More. Uncheck listings you do
                    not want; use <strong className="text-zinc-400">Edit</strong> to change price or seats before push.
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">
                      <strong className="text-zinc-300">{previewRows.length}</strong> in preview
                      {mappableTotal > previewRows.length ? (
                        <>
                          {" "}
                          of <strong className="text-zinc-300">{mappableTotal.toLocaleString()}</strong>
                        </>
                      ) : null}
                      {" · "}
                      <strong className="text-emerald-300/90">{includedCount}</strong> selected
                      {excludedCount > 0 ? (
                        <span className="text-zinc-600"> · {excludedCount} excluded</span>
                      ) : null}
                      {previewing ? <span className="ml-1 text-zinc-600">· loading…</span> : null}
                    </p>
                    {previewRows.length > 0 ? (
                      <div className="flex gap-2 text-[10px]">
                        <button
                          type="button"
                          className="text-sky-300/90 hover:text-sky-200"
                          disabled={busy}
                          onClick={() => setAllIncluded(true)}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-zinc-300"
                          disabled={busy}
                          onClick={() => setAllIncluded(false)}
                        >
                          Exclude all
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : previewing ? (
                  <p className="text-xs text-zinc-500">Loading preview…</p>
                ) : null}

                <div className={`space-y-3 ${previewing ? "opacity-70" : ""}`}>
                  {previewRows.length === 0 && hasPreview && !previewing ? (
                    <p className="text-xs text-zinc-500">No offers to push for this event.</p>
                  ) : null}
                  {previewRows.map((row, i) => {
                    const t = row.ticket;
                    const priceWarn =
                      t.summary.priceUsd == null ||
                      !Number.isFinite(t.summary.priceUsd) ||
                      t.summary.priceUsd <= 0;
                    const categoryWarn = !String(t.fields.ticket_category ?? "").trim();
                    const blockOptions = row.ticket.sbBlockOptions ?? [];
                    const blockWarn =
                      blockOptions.length > 0 &&
                      !t.summary.sbBlockMatched &&
                      !String(t.fields.ticket_block ?? "").trim();
                    const shipDateWarn = !String(t.fields.date_to_ship ?? "").trim();
                    const faceValueWarn =
                      !String(t.fields.face_value ?? "").trim() &&
                      (t.summary.priceUsd == null ||
                        !Number.isFinite(t.summary.priceUsd) ||
                        t.summary.priceUsd <= 0);
                    const faceValueDefaultedNote = Boolean(t.summary.faceValueDefaultedToPrice);
                    return (
                      <article
                        key={row.id}
                        className={`rounded-xl border p-3 ring-1 ${
                          row.included
                            ? "border-white/[0.08] bg-black/30 ring-white/[0.04]"
                            : "border-white/[0.04] bg-black/15 opacity-60 ring-white/[0.02]"
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-start gap-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.included}
                              disabled={busy}
                              className="size-4 rounded border-white/20 bg-black/40"
                              onChange={(e) => updatePreviewRow(row.id, { included: e.target.checked })}
                            />
                            <span className="text-xs font-semibold text-zinc-200">
                              Offer #{row.offerIndex + 1}
                              <span className="font-normal text-zinc-500">
                                {" "}
                                · {t.summary.categoryLabel ?? `Cat ${t.fields.ticket_category ?? "?"}`} ·{" "}
                                {t.summary.offerType} · qty {t.summary.quantity} · row {t.summary.row || "—"} · seats{" "}
                                {t.summary.seatNumbers.join(",") || "—"} · {formatPreviewPrice(t.summary)}
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            className="ml-auto text-[10px] font-medium text-sky-300/90 hover:text-sky-200"
                            disabled={busy}
                            onClick={() => updatePreviewRow(row.id, { editing: !row.editing })}
                          >
                            {row.editing ? "Done" : "Edit"}
                          </button>
                        </div>
                        {priceWarn ? (
                          <p className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                            Missing or zero price — edit before push or exclude this listing.
                          </p>
                        ) : null}
                        {categoryWarn ? (
                          <p className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                            Missing SB <strong>ticket_category</strong> — refresh preview after match_id is set.
                          </p>
                        ) : null}
                        {blockWarn ? (
                          <p className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                            No SB block auto-match for FIFA block &quot;{t.summary.blockName ?? "—"}&quot; — pick{" "}
                            <strong>ticket_block</strong> in Edit ({blockOptions.length} options from SB).
                          </p>
                        ) : null}
                        {blockOptions.length > 0 && !row.editing ? (
                          <p className="mb-2 text-[10px] text-zinc-600">
                            SB blocks for cat {t.fields.ticket_category}:{" "}
                            {blockOptions
                              .slice(0, 12)
                              .map((b) => b.blockId)
                              .join(", ")}
                            {blockOptions.length > 12 ? ` … +${blockOptions.length - 12} more` : ""}
                          </p>
                        ) : null}
                        {shipDateWarn ? (
                          <p className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                            Missing <strong>date_to_ship</strong> — set event date on the event, then Save preview
                            again.
                          </p>
                        ) : null}
                        {faceValueWarn ? (
                          <p className="mb-2 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                            Missing <strong>face_value</strong> — listing price is zero and no shop/catalogue match;
                            set a valid price or sync face-value sources, then refresh preview.
                          </p>
                        ) : null}
                        {faceValueDefaultedNote ? (
                          <p className="mb-2 rounded border border-sky-500/25 bg-sky-950/20 px-2 py-1 text-[10px] text-sky-100">
                            <strong>face_value</strong> defaulted to listing price (no shop/catalogue match for this
                            category × block).
                          </p>
                        ) : null}
                        {row.editing ? (
                          <div className="mb-2 grid gap-2 sm:grid-cols-2">
                            {(
                              [
                                ["date_to_ship", "date_to_ship (YYYY-MM-DD)"],
                                ["ticket_category", "SB ticket_category id"],
                                ["face_value", "Face value (USD)"],
                                ["price", "Price (USD)"],
                                ["quantity", "Quantity"],
                                ["ticket_row", "Row"],
                                ["ticket_details", "Seats (comma-separated)"],
                                ["split_type", "Split type"],
                              ] as const
                            ).map(([field, label]) => (
                              <label key={field} className="flex flex-col gap-0.5 text-[10px]">
                                <span className="font-medium text-zinc-500">{label}</span>
                                <input
                                  value={t.fields[field] ?? ""}
                                  disabled={busy}
                                  className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-100"
                                  onChange={(e) =>
                                    updatePreviewRow(row.id, (r) => ({
                                      ...r,
                                      ticket: applyTicketFieldUpdate(r.ticket, field, e.target.value),
                                    }))
                                  }
                                />
                              </label>
                            ))}
                            <label className="flex flex-col gap-0.5 text-[10px] sm:col-span-2">
                              <span className="font-medium text-zinc-500">
                                SB ticket_block (row id from POST ticket_block, e.g. 1060776)
                              </span>
                              {blockOptions.length > 0 ? (
                                <select
                                  value={t.fields.ticket_block ?? ""}
                                  disabled={busy}
                                  className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-100"
                                  onChange={(e) =>
                                    updatePreviewRow(row.id, (r) => ({
                                      ...r,
                                      ticket: applyTicketFieldUpdate(r.ticket, "ticket_block", e.target.value),
                                    }))
                                  }
                                >
                                  <option value="">— Select SB block —</option>
                                  {blockOptions.map((b) => (
                                    <option key={b.rowId} value={b.rowId}>
                                      {b.blockId} ({b.rowId})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={t.fields.ticket_block ?? ""}
                                  disabled={busy}
                                  placeholder="Load preview to fetch SB blocks"
                                  className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-100"
                                  onChange={(e) =>
                                    updatePreviewRow(row.id, (r) => ({
                                      ...r,
                                      ticket: applyTicketFieldUpdate(r.ticket, "ticket_block", e.target.value),
                                    }))
                                  }
                                />
                              )}
                            </label>
                          </div>
                        ) : null}
                        <dl className="space-y-1">
                          <FieldRow label="match_id" value={t.fields.match_id ?? ""} />
                          <FieldRow label="date_to_ship" value={t.fields.date_to_ship ?? ""} />
                          <FieldRow label="quantity" value={t.fields.quantity ?? ""} />
                          <FieldRow label="price" value={`${t.fields.price ?? ""} ${t.fields.price_type ?? ""}`} />
                          <FieldRow label="face_value" value={t.fields.face_value ?? ""} />
                          <FieldRow label="SB ticket_category" value={t.fields.ticket_category ?? ""} />
                          <FieldRow
                            label="FIFA category"
                            value={t.summary.fifaCategoryId ?? "—"}
                          />
                          <FieldRow
                            label="SB ticket_block (row id)"
                            value={t.fields.ticket_block ?? ""}
                          />
                          {t.summary.sbBlockCode ? (
                            <FieldRow label="SB section" value={t.summary.sbBlockCode} />
                          ) : null}
                          <FieldRow label="FIFA block" value={t.summary.fifaBlockId ?? "—"} />
                          {t.summary.blockName ? (
                            <FieldRow label="Block name" value={t.summary.blockName} />
                          ) : null}
                          <FieldRow label="ticket_row" value={t.fields.ticket_row ?? ""} />
                          <FieldRow label="ticket_details" value={t.fields.ticket_details ?? ""} />
                          <FieldRow label="split_type" value={t.fields.split_type ?? ""} />
                          <FieldRow label="ticket_type" value={t.fields.ticket_type ?? ""} />
                        </dl>
                      </article>
                    );
                  })}
                  {canShowMore ? (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50"
                      disabled={busy || previewing}
                      onClick={() => void applyLimitSave(true)}
                    >
                      {previewing
                        ? "Loading…"
                        : `More (${Math.min(PREVIEW_PAGE_SIZE, mappableTotal - previewRows.length)} next)`}
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
                    {(displayResult.skipped ?? 0) > 0 ? (
                      <>
                        {" "}
                        · Skipped (duplicate):{" "}
                        <span className="font-semibold text-zinc-400">{displayResult.skipped}</span>
                      </>
                    ) : null}
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
                        {r.ok && r.sbTicketId ? (
                          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-200">
                            SB listing id: {r.sbTicketId}
                          </p>
                        ) : null}
                        {r.fields ? (
                          <p className="mt-1 font-mono text-[10px] opacity-90">
                            SB ticket_block: {r.fields.ticket_block ?? "—"}
                            {r.summary.sbBlockCode ? ` (${r.summary.sbBlockCode})` : ""} · ticket_category:{" "}
                            {r.fields.ticket_category ?? "—"}
                          </p>
                        ) : null}
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
                    {JSON.stringify(
                      pushResult ?? {
                        ...previewMeta,
                        tickets: previewRows.map((r) => ({ ...r.ticket, included: r.included })),
                      },
                      null,
                      2,
                    )}
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
                  disabled={busy || !hasSbId || !resolvedEventId || savedLimit === null || includedCount === 0}
                  onClick={() => setPushConfirmOpen(true)}
                >
                  {pushing ? "Pushing to SB…" : `Push to SB (${includedCount})`}
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

      <SbListingHistoryModal
        open={historyOpen}
        eventId={resolvedEventId}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}
