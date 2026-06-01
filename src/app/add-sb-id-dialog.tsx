"use client";

import { updateSbEventIdAction } from "@/app/actions/event-sb-id";
import { ModalPortal } from "@/app/modal-portal";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const inpModal =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const sectionTitle = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";

type SbMatchOption = {
  matchId: string;
  label: string;
  raw: Record<string, unknown>;
};

type SbTournamentOption = { id: string; name: string };

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
  events?: unknown;
  eventsRaw?: string;
  tournament?: unknown;
  tournamentError?: string;
};

type MatchDetailResponse = {
  ok?: boolean;
  matchId?: string;
  tickets?: unknown;
  ticketsError?: string;
  ticketsRaw?: string;
};

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

type Props = {
  eventId: number;
  eventName?: string;
  sbEventId: string | null;
  className?: string;
  trigger?: "button" | "inline";
};

export function AddSbIdDialog({ eventId, eventName, sbEventId, className, trigger = "button" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sbInput, setSbInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sbData, setSbData] = useState<SbEventsFetchResponse | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<SbMatchOption | null>(null);
  const [matchDetail, setMatchDetail] = useState<MatchDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRawEvents, setShowRawEvents] = useState(false);
  const [tournamentId, setTournamentId] = useState("64");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const detailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = (sbEventId ?? "").trim();
  const hasSbId = Boolean(trimmed);

  const loadMatchDetail = useCallback(async (matchId: string) => {
    setDetailLoading(true);
    setMatchDetail(null);
    try {
      const res = await fetch(`/api/seatsbrokers/events?matchId=${encodeURIComponent(matchId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as MatchDetailResponse;
      setMatchDetail(data);
    } catch (e) {
      setMatchDetail({ ok: false, ticketsError: e instanceof Error ? e.message : String(e) });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadSbEvents = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    setSbData(null);
    setSelectedMatch(null);
    setMatchDetail(null);

    const params = new URLSearchParams();
    params.set("tournamentId", tournamentId);
    if (eventName?.trim()) params.set("eventName", eventName.trim());

    try {
      const res = await fetch(`/api/seatsbrokers/events?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as SbEventsFetchResponse;
      if (!res.ok || !data.ok) {
        setFetchError(data.error ?? `Failed to load SB events (${res.status})`);
        setSbData(data);
        return;
      }

      setSbData(data);

      if (!trimmed && data.suggested?.matchId) {
        const fd = new FormData();
        fd.set("id", String(eventId));
        fd.set("sbEventId", data.suggested.matchId);
        const saveResult = await updateSbEventIdAction(fd);
        if (saveResult.ok) {
          router.refresh();
          setSbInput(data.suggested.matchId);
          setSelectedMatch(data.suggested);
          if (data.suggestedDetail) {
            setMatchDetail({
              ok: true,
              matchId: data.suggested.matchId,
              tickets: data.suggestedDetail.tickets,
              ticketsError: data.suggestedDetail.ticketsError,
            });
          } else {
            void loadMatchDetail(data.suggested.matchId);
          }
          return;
        }
      }

      const initialId = trimmed || data.suggested?.matchId || "";
      if (initialId) {
        setSbInput(initialId);
        const match =
          data.matches?.find((m) => m.matchId === initialId) ??
          data.suggested ??
          null;
        if (match) {
          setSelectedMatch(match);
          void loadMatchDetail(match.matchId);
        } else if (initialId) {
          void loadMatchDetail(initialId);
        }
      } else if (data.suggested) {
        setSbInput(data.suggested.matchId);
        setSelectedMatch(data.suggested);
        if (data.suggestedDetail) {
          setMatchDetail({
            ok: true,
            matchId: data.suggested.matchId,
            tickets: data.suggestedDetail.tickets,
            ticketsError: data.suggestedDetail.ticketsError,
          });
        } else {
          void loadMatchDetail(data.suggested.matchId);
        }
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }, [eventName, trimmed, loadMatchDetail, tournamentId, eventId]);

  useEffect(() => {
    if (!open) return;
    setSbInput(trimmed);
    setFieldErrors({});
    void loadSbEvents();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loadSbEvents, pending, trimmed, tournamentId]);

  const selectMatch = (match: SbMatchOption) => {
    setSelectedMatch(match);
    setSbInput(match.matchId);
    void loadMatchDetail(match.matchId);
    inputRef.current?.focus();
  };

  const onCustomIdChange = (value: string) => {
    setSbInput(value);
    setSelectedMatch(null);
    if (detailDebounceRef.current) clearTimeout(detailDebounceRef.current);
    const id = value.trim();
    if (!id) {
      setMatchDetail(null);
      return;
    }
    detailDebounceRef.current = setTimeout(() => void loadMatchDetail(id), 400);
  };

  const label = hasSbId ? `SB: ${trimmed}` : "Add SB ID";
  const openDialog = () => {
    setFieldErrors({});
    setOpen(true);
  };

  const inlineTriggerClass =
    className ??
    "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-[color:var(--ticketing-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

  const addSbInlineClass =
    className ??
    "inline-flex shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

  const buttonTriggerClass =
    className ??
    (hasSbId
      ? "inline-flex shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-2 py-1 font-mono text-[11px] font-medium text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
      : "inline-flex shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]");

  const matches = sbData?.matches ?? [];

  return (
    <>
      {trigger === "inline" ? (
        hasSbId ? (
          <button
            type="button"
            onClick={openDialog}
            className={inlineTriggerClass}
            title={`SeatsBrokers event id: ${trimmed}`}
            aria-label={`Edit SB event id for ${eventName ?? `event ${eventId}`}`}
          >
            <PencilIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={openDialog}
            className={addSbInlineClass}
            title="Add SeatsBrokers event id"
            aria-label={`Add SB event id for ${eventName ?? `event ${eventId}`}`}
          >
            Add SB ID
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className={buttonTriggerClass}
          title={hasSbId ? `SeatsBrokers event id: ${trimmed}` : "Add SeatsBrokers event id"}
          aria-label={
            hasSbId
              ? `Edit SB event id for ${eventName ?? `event ${eventId}`}`
              : `Add SB event id for ${eventName ?? `event ${eventId}`}`
          }
        >
          {label}
        </button>
      )}

      {open ? (
        <ModalPortal
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-white/[0.06] px-5 py-4">
              <h2 id={titleId} className="text-base font-semibold text-zinc-100">
                {hasSbId ? "SB event id" : "Add SB ID"}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Event #{eventId}
                {eventName ? ` · ${eventName}` : ""}. Fetches match ids from SeatsBrokers or enter a custom{" "}
                <code className="text-zinc-400">match_id</code>.
              </p>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
              <div className="flex flex-col gap-1">
                <label htmlFor={`sb-tournament-${eventId}`} className={sectionTitle}>
                  SB tournament
                </label>
                <select
                  id={`sb-tournament-${eventId}`}
                  value={tournamentId}
                  disabled={fetching}
                  onChange={(e) => {
                    setTournamentId(e.target.value);
                  }}
                  className="rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100"
                >
                  {(sbData?.tournaments?.length ? sbData.tournaments : [{ id: tournamentId, name: `Tournament ${tournamentId}` }]).map(
                    (t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (id {t.id})
                      </option>
                    ),
                  )}
                </select>
                <p className="text-[10px] text-zinc-600">
                  Default: Football World Cup 2026 (id 64). Change tournament then use Refresh.
                </p>
              </div>

              {fetching ? (
                <p className="text-xs text-zinc-500">Loading matches from SeatsBrokers…</p>
              ) : null}

              {fetchError ? (
                <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2.5 text-xs text-amber-100">
                  <p className="font-medium text-amber-50">Could not load matches from SeatsBrokers</p>
                  <p className="mt-1 text-amber-100/90">{fetchError}</p>
                  <p className="mt-2 text-amber-200/75">
                    You can still type a known <code className="text-amber-100">match_id</code> below and save it
                    without waiting for the API.
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-medium text-amber-200 underline underline-offset-2 hover:text-white"
                    onClick={() => void loadSbEvents()}
                  >
                    Retry fetch
                  </button>
                </div>
              ) : null}

              {sbData?.suggested && !fetching ? (
                <div className="rounded-lg border border-sky-500/25 bg-sky-950/20 px-3 py-2 text-xs text-sky-100">
                  Suggested match for &quot;{eventName}&quot;:{" "}
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-2 hover:text-white"
                    onClick={() => selectMatch(sbData.suggested!)}
                  >
                    {sbData.suggested.label}
                  </button>
                </div>
              ) : null}

              {!fetching && matches.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={sectionTitle}>SeatsBrokers matches ({matches.length})</h3>
                    <button
                      type="button"
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                      onClick={() => void loadSbEvents()}
                    >
                      Refresh matches
                    </button>
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/25 p-1 ring-1 ring-white/[0.04]">
                    {matches.map((m) => {
                      const active = sbInput.trim() === m.matchId;
                      return (
                        <li key={m.matchId}>
                          <button
                            type="button"
                            onClick={() => selectMatch(m)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                              active
                                ? "bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] text-zinc-100"
                                : "text-zinc-300 hover:bg-white/[0.06]"
                            }`}
                          >
                            <span className="min-w-0 truncate">{m.label}</span>
                            <span className="shrink-0 font-mono text-[10px] text-zinc-500">{m.matchId}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {!fetching && sbData && matches.length === 0 && !fetchError ? (
                <p className="text-xs text-zinc-500">
                  No matches parsed from SB response — use custom id below or check raw JSON.
                </p>
              ) : null}

              {fieldErrors._form ? (
                <p className="rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">
                  {fieldErrors._form}
                </p>
              ) : null}

              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPending(true);
                  setFieldErrors({});
                  const fd = new FormData(e.currentTarget);
                  fd.set("sbEventId", sbInput.trim());
                  const result = await updateSbEventIdAction(fd);
                  setPending(false);
                  if (result.ok) {
                    setOpen(false);
                  } else {
                    setFieldErrors(result.fieldErrors);
                  }
                }}
              >
                <input type="hidden" name="id" value={eventId} />
                <div className="flex flex-col gap-1">
                  <label htmlFor={`sb-event-id-${eventId}`} className={sectionTitle}>
                    SB match_id (custom or selected)
                  </label>
                  <input
                    ref={inputRef}
                    id={`sb-event-id-${eventId}`}
                    name="sbEventId"
                    value={sbInput}
                    onChange={(e) => onCustomIdChange(e.target.value)}
                    placeholder="e.g. 6756"
                    autoComplete="off"
                    className={`${inpModal} font-mono text-xs`}
                    aria-invalid={fieldErrors.sbEventId ? true : undefined}
                  />
                  {fieldErrors.sbEventId ? (
                    <p className="text-xs text-red-400">{fieldErrors.sbEventId}</p>
                  ) : (
                    <p className="text-[10px] text-zinc-600">Leave empty to clear the saved SB id.</p>
                  )}
                </div>

                {(selectedMatch || sbInput.trim()) && (
                  <section className="space-y-2">
                    <h3 className={sectionTitle}>SeatsBrokers response for this match</h3>
                    {detailLoading ? (
                      <p className="text-xs text-zinc-500">Loading ticket list…</p>
                    ) : (
                      <>
                        {selectedMatch ? (
                          <pre className="max-h-28 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-[10px] text-zinc-400">
                            {JSON.stringify(selectedMatch.raw, null, 2)}
                          </pre>
                        ) : null}
                        {matchDetail?.ticketsError ? (
                          <p className="text-xs text-amber-200/90">{matchDetail.ticketsError}</p>
                        ) : null}
                        {matchDetail?.tickets != null ? (
                          <pre className="max-h-36 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-[10px] text-zinc-300">
                            {JSON.stringify(matchDetail.tickets, null, 2)}
                          </pre>
                        ) : null}
                      </>
                    )}
                  </section>
                )}

                {sbData?.events != null && (
                  <div>
                    <button
                      type="button"
                      className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                      onClick={() => setShowRawEvents((v) => !v)}
                    >
                      {showRawEvents ? "Hide" : "Show"} full SB events response
                    </button>
                    {showRawEvents ? (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-2 text-[10px] text-zinc-400">
                        {JSON.stringify(sbData.events, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3">
                  <button type="button" disabled={pending} onClick={() => setOpen(false)} className={btnSecondary}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pending || fetching} className={btnPrimary}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
