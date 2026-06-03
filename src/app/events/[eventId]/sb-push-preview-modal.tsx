"use client";

import { ModalPortal } from "@/app/modal-portal";
import {
  SB_PUSH_SINGLE_QUANTITY_RULES,
  SB_PUSH_TOGETHER_QUANTITY_RULES,
  SB_PUSH_TRANSFORM_RULES_DOC,
} from "@/lib/sb-push-transform-rules";
import type { SbPushSuccessResult } from "@/app/events/[eventId]/sb-push-result-types";
import { extractSbTicketId } from "@/lib/sb-ticket-id";
import type { SbOfferPreviewResult } from "@/lib/sb-offer-preview-service";
import { useCallback, useEffect, useId, useState } from "react";

const sectionTitle = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

type Props = {
  open: boolean;
  eventId: number;
  seatIds: string[];
  onClose: () => void;
  onPushed: (result: SbPushSuccessResult) => void;
  rowLabel?: string | null;
  blockName?: string | null;
  seatSpan?: string | null;
};

function RulesTable(props: {
  title: string;
  rows: ReadonlyArray<{ input: number; output: number }>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-300">{props.title}</p>
      <table className="w-full text-left text-[11px] text-zinc-400">
        <thead>
          <tr className="border-b border-white/[0.06] text-zinc-500">
            <th className="py-1 pr-3 font-medium">Seats in bucket</th>
            <th className="py-1 font-medium">SB quantity</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.input} className="border-b border-white/[0.04]">
              <td className="py-1 pr-3 font-mono tabular-nums text-zinc-200">{r.input}</td>
              <td className="py-1 font-mono tabular-nums text-zinc-200">{r.output}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1 pr-3 text-zinc-500" colSpan={2}>
              Other counts → sent unchanged (e.g. 10 singles same price → quantity 10)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SbPushPreviewModal(props: Props) {
  const { open, eventId, seatIds, onClose, onPushed, rowLabel, blockName, seatSpan } = props;
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<SbOfferPreviewResult, { ok: true }> | null>(null);
  const [pushSuccess, setPushSuccess] = useState<SbPushSuccessResult | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!open || seatIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/push-to-seatsbrokers/offer/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds }),
        cache: "no-store",
      });
      const json = (await res.json()) as SbOfferPreviewResult;
      if (!res.ok || !json.ok) {
        setPreview(null);
        setError(!json.ok ? json.error : `Preview failed (${res.status})`);
        return;
      }
      setPreview(json);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [open, eventId, seatIds]);

  useEffect(() => {
    if (open) void loadPreview();
    else {
      setPreview(null);
      setPushSuccess(null);
      setError(null);
      setShowRaw(false);
    }
  }, [open, loadPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleConfirmPush = async () => {
    if (!preview) return;
    setPushing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/events/${eventId}/push-to-seatsbrokers/offer?offerIndex=${preview.offerIndex}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatIds }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        sbTicketId?: string | null;
        logId?: number;
        httpStatus?: number;
        listingFingerprint?: string;
        fields?: Record<string, string>;
        summary?: { blockName?: string; row?: string; seatNumbers?: string[] };
        response?: unknown;
        skipped?: boolean;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Push failed (${res.status})`);
        return;
      }
      const sbTicketId = json.sbTicketId ?? extractSbTicketId(json.response) ?? null;
      const success: SbPushSuccessResult = {
        sbTicketId,
        logId: json.logId,
        httpStatus: json.httpStatus,
        listingFingerprint: json.listingFingerprint ?? "",
        fields: json.fields ?? preview.ticket.fields,
        response: json.response,
        blockName: json.summary?.blockName ?? preview.ticket.summary.blockName ?? blockName ?? null,
        row: json.summary?.row ?? preview.ticket.summary.row ?? rowLabel ?? null,
        seatNumbers:
          json.summary?.seatNumbers ??
          preview.ticket.summary.seatNumbers ??
          (seatSpan ? [seatSpan] : []),
      };
      setPushSuccess(success);
      onPushed(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  };

  if (!open) return null;

  const canPush = Boolean(preview && !preview.alreadyPushed && !pushSuccess);

  const handleDone = () => {
    setPushSuccess(null);
    onClose();
  };

  return (
    <ModalPortal
      onBackdropMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          <p id={titleId} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Push to SeatsBrokers
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
            {pushSuccess ? "Listing created on SB" : preview?.eventName ?? "Loading preview…"}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {pushSuccess
              ? "Listing id is saved on this row in the table."
              : "Review transform rules and the exact payload before creating the SB listing."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 [-webkit-overflow-scrolling:touch]">
          {pushSuccess ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4 ring-1 ring-emerald-400/25">
                <p className={sectionTitle}>SB listing id</p>
                <p className="mt-2 break-all font-mono text-xl font-bold tabular-nums text-emerald-100">
                  {pushSuccess.sbTicketId ?? "— (SB did not return ticket_id)"}
                </p>
                <p className="mt-2 text-xs text-emerald-200/80">
                  HTTP {pushSuccess.httpStatus ?? "—"}
                  {pushSuccess.logId != null ? ` · log #${pushSuccess.logId}` : null}
                </p>
              </div>
              {(pushSuccess.blockName || pushSuccess.row || pushSuccess.seatNumbers?.length) ? (
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  {pushSuccess.blockName ? (
                    <div>
                      <dt className="text-zinc-500">Block</dt>
                      <dd className="text-zinc-200">{pushSuccess.blockName}</dd>
                    </div>
                  ) : null}
                  {pushSuccess.row ? (
                    <div>
                      <dt className="text-zinc-500">Row</dt>
                      <dd className="font-mono text-zinc-200">{pushSuccess.row}</dd>
                    </div>
                  ) : null}
                  {pushSuccess.seatNumbers?.length ? (
                    <div className="sm:col-span-2">
                      <dt className="text-zinc-500">Seats in SB payload</dt>
                      <dd className="font-mono text-zinc-200">{pushSuccess.seatNumbers.join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {pushSuccess.fields ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className={sectionTitle}>Sent to SB</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Object.entries(pushSuccess.fields).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <dt className="truncate text-[10px] font-medium text-zinc-500">{key}</dt>
                        <dd className="break-all font-mono text-xs text-zinc-100">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                <p className={sectionTitle}>SeatsBrokers response</p>
                <pre className="mt-2 max-h-52 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-300">
                  {JSON.stringify(pushSuccess.response ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : loading ? (
            <p className="text-sm text-zinc-400">Building preview from current resale inventory…</p>
          ) : error && !preview ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-100">
              {error}
            </p>
          ) : preview ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3 ring-1 ring-white/[0.04]">
                <p className={sectionTitle}>Transform applied</p>
                <p className="mt-2 text-sm font-medium text-zinc-100">{preview.quantityRule}</p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Clicked seats</dt>
                    <dd className="font-mono text-zinc-200">{preview.clickedSeatCount}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Offer seats (in payload)</dt>
                    <dd className="font-mono text-zinc-200">{preview.offer.seats.length}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">SB quantity field</dt>
                    <dd className="font-mono text-[color:var(--ticketing-accent)]">
                      {preview.ticket.fields.quantity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Offer type</dt>
                    <dd className="font-mono text-zinc-200">{preview.offer.offerType}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Match id</dt>
                    <dd className="font-mono text-zinc-300">{preview.matchId}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Markup</dt>
                    <dd className="font-mono text-zinc-300">+{preview.markupPercent}%</dd>
                  </div>
                </dl>
                {preview.bundledOfferNote ? (
                  <p className="mt-3 rounded border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 text-[11px] leading-relaxed text-amber-100">
                    {preview.bundledOfferNote}
                  </p>
                ) : null}
              </div>

              {preview.warnings.length > 0 ? (
                <ul className="space-y-1.5">
                  {preview.warnings.map((w) => (
                    <li
                      key={w}
                      className="rounded border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-100"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                <p className={sectionTitle}>Seats in SB payload</p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px]">
                  {preview.offer.seats.map((s) => (
                    <li key={s.seatId} className="font-mono text-zinc-300">
                      {s.categoryName} · {s.blockName} · row {s.row} · seat {s.seatNumber}
                      <span className="text-zinc-600"> · {s.seatId}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                <p className={sectionTitle}>POST ticket/create fields</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {Object.entries(preview.ticket.fields).map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="truncate text-[10px] font-medium text-zinc-500">{key}</dt>
                      <dd className="break-all font-mono text-xs text-zinc-100">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                <p className={sectionTitle}>Summary</p>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-300">
                  {JSON.stringify(preview.ticket.summary, null, 2)}
                </pre>
              </div>

              <div>
                <button
                  type="button"
                  className="text-xs font-semibold text-sky-300/90 hover:text-sky-200"
                  onClick={() => setShowRules((v) => !v)}
                  aria-expanded={showRules}
                >
                  {showRules ? "Hide" : "Show"} all push conditions & quantity rules
                </button>
                {showRules ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[11px] leading-relaxed text-zinc-400">
                    <ul className="list-disc space-y-1 pl-4">
                      {Object.values(SB_PUSH_TRANSFORM_RULES_DOC).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <RulesTable title="Together (consecutive, same block + price)" rows={SB_PUSH_TOGETHER_QUANTITY_RULES} />
                    <RulesTable title="Single (non-consecutive, same block + price)" rows={SB_PUSH_SINGLE_QUANTITY_RULES} />
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? "Hide" : "Show"} raw preview JSON
              </button>
              {showRaw ? (
                <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] text-zinc-400">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              ) : null}

              {error ? (
                <p className="rounded border border-rose-500/30 bg-rose-950/25 px-2 py-1.5 text-xs text-rose-100">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3 sm:px-5">
          {pushSuccess ? (
            <button type="button" className={btnPrimary} onClick={handleDone}>
              Done — view on row
            </button>
          ) : (
            <>
              <button type="button" className={btnSecondary} disabled={pushing} onClick={onClose}>
                Cancel
              </button>
              {preview ? (
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={loading || pushing}
                  onClick={() => void loadPreview()}
                >
                  Refresh
                </button>
              ) : null}
              <button
                type="button"
                className={btnPrimary}
                disabled={!canPush || loading || pushing}
                title={preview?.alreadyPushed ? "Already pushed" : undefined}
                onClick={() => void handleConfirmPush()}
              >
                {pushing ? "Pushing…" : preview?.alreadyPushed ? "Already on SB" : "Confirm push to SB"}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
