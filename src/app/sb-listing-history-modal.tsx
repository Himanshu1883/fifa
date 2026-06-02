"use client";

import { ModalPortal, stackedModalBackdropClass } from "@/app/modal-portal";
import { useCallback, useEffect, useId, useState } from "react";

const sectionTitle = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";

type ListingRow = {
  id: number;
  createdAt: string;
  trigger: string;
  ok: boolean;
  httpStatus: number | null;
  sbTicketId: string | null;
  offerIndex: number | null;
  listingFingerprint: string;
  matchId: string;
  requestFields: Record<string, string>;
  requestSummary: Record<string, unknown>;
  responseBody: unknown;
  errorMessage: string | null;
};

type HistoryResponse = {
  ok?: boolean;
  error?: string;
  eventName?: string;
  matchId?: string | null;
  total?: number;
  listings?: ListingRow[];
};

type Props = {
  open: boolean;
  eventId: number | null;
  onClose: () => void;
};

export function SbListingHistoryModal({ open, eventId, onClose }: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/seatsbrokers/listing-history?limit=200`, {
        cache: "no-store",
      });
      const json = (await res.json()) as HistoryResponse;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (open && eventId) void load();
    if (!open) {
      setExpandedId(null);
      setData(null);
      setError(null);
    }
  }, [open, eventId, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const listings = data?.listings ?? [];

  return (
    <ModalPortal
      className={stackedModalBackdropClass}
      onBackdropMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[61] flex max-h-[min(92vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/55"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
              SB listing history
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {data?.eventName ?? "Event"} · match {data?.matchId ?? "—"} · {data?.total ?? 0} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
          {loading ? <p className="text-sm text-zinc-500">Loading history…</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {!loading && !error && listings.length === 0 ? (
            <p className="text-sm text-zinc-500">No listings pushed yet for this event.</p>
          ) : null}

          <ul className="space-y-2">
            {listings.map((row) => {
              const expanded = expandedId === row.id;
              const summary = row.requestSummary as {
                blockName?: string;
                sbBlockCode?: string;
                categoryLabel?: string;
                row?: string;
                seatNumbers?: string[];
                priceUsd?: number | null;
              };
              return (
                <li
                  key={row.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    row.ok
                      ? "border-emerald-500/25 bg-emerald-950/10"
                      : "border-red-500/25 bg-red-950/10"
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                  >
                    <span className="font-semibold text-zinc-100">
                      {row.ok ? "Created" : "Failed"} · {row.trigger}
                      {row.sbTicketId ? ` · ticket ${row.sbTicketId}` : ""}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </button>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {summary.categoryLabel ?? "—"} · block {summary.sbBlockCode ?? "—"} · row{" "}
                    {summary.row ?? "—"} · seats {(summary.seatNumbers ?? []).join(",") || "—"} · $
                    {summary.priceUsd ?? "—"}
                  </p>
                  {expanded ? (
                    <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                      <div>
                        <p className={sectionTitle}>Request (ticket/create)</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-300">
                          {JSON.stringify(row.requestFields, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className={sectionTitle}>Summary</p>
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-300">
                          {JSON.stringify(row.requestSummary, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className={sectionTitle}>Response</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-300">
                          {row.errorMessage
                            ? row.errorMessage
                            : JSON.stringify(row.responseBody ?? null, null, 2)}
                        </pre>
                      </div>
                      <p className="font-mono text-[10px] text-zinc-600">
                        HTTP {row.httpStatus ?? "—"} · fingerprint {row.listingFingerprint}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-zinc-600">Click to expand full request/response</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ModalPortal>
  );
}
