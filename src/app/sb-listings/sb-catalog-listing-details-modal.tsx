"use client";

import { ModalPortal, stackedModalBackdropClass } from "@/app/modal-portal";
import type { SbCatalogListing } from "@/lib/sb-listings-catalog-types";
import { useEffect, useId, useState } from "react";

const sectionTitle = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";

const preClass =
  "mt-1 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[10px] leading-relaxed text-zinc-300";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function prettyJson(value: unknown): string {
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function MetaRow(props: { label: string; value: string | null | undefined }) {
  const v = props.value?.trim() ? props.value : "—";
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      <dt className="shrink-0 font-medium text-zinc-500">{props.label}</dt>
      <dd className="min-w-0 font-mono text-[11px] text-zinc-200 break-all">{v}</dd>
    </div>
  );
}

type Props = {
  open: boolean;
  logId: number | null;
  eventName: string;
  preview?: SbCatalogListing | null;
  onClose: () => void;
};

export function SbCatalogListingDetailsModal({ open, logId, eventName, preview, onClose }: Props) {
  const titleId = useId();
  const [listing, setListing] = useState<SbCatalogListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || logId == null) {
      setListing(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setListing(preview ?? null);
    setLoadError(null);
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/sb-listings-catalog?logId=${logId}`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          listing?: SbCatalogListing;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.listing) {
          setLoadError(json.error ?? `Failed to load details (${res.status})`);
          return;
        }
        setListing(json.listing);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, logId, preview]);

  if (!open || logId == null) return null;

  const display = listing;
  const hasResponse = display?.responseBody != null;
  const responseText = display?.errorMessage
    ? display.errorMessage
    : hasResponse
      ? prettyJson(display?.responseBody)
      : "No response body stored for this push log.";

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
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
              SB push details
            </h2>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {eventName} · ticket {display?.sbTicketId ?? preview?.sbTicketId ?? "—"} · log #{logId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" }}>
          {loading && !display ? (
            <p className="text-sm text-zinc-400">Loading push log details…</p>
          ) : loadError && !display ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 py-2 text-sm text-rose-100">
              {loadError}
            </p>
          ) : !display ? (
            <p className="text-sm text-zinc-500">No details available.</p>
          ) : (
          <>
          <section className="mb-4 rounded-xl border border-white/[0.06] bg-black/25 p-3">
            <p className={sectionTitle}>Push log metadata</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {display.pushApiUrl ? (
                <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/35 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Push API
                  </dt>
                  <dd className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-200 break-all">
                    POST {display.pushApiUrl}
                  </dd>
                  <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-zinc-500">
                    <span>
                      Base{" "}
                      <span className="text-zinc-400">{display.sbApiBaseUrl ?? "—"}</span>
                    </span>
                    <span>
                      Endpoint <span className="text-zinc-400">{display.pushEndpoint}</span>
                    </span>
                  </dd>
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <MetaRow
                    label="Push API"
                    value="SeatsBrokers not configured (set SEATS_BROKERS_API_KEY)"
                  />
                </div>
              )}
              {display.deleteApiUrl ? (
                <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/35 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Delete API
                  </dt>
                  <dd className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-200 break-all">
                    POST {display.deleteApiUrl}
                  </dd>
                  <dd className="mt-1.5 font-mono text-[10px] text-zinc-500">
                    Endpoint{" "}
                    <span className="text-zinc-400">{display.deleteEndpoint ?? "ticket/delete"}</span>
                  </dd>
                </div>
              ) : null}
              <MetaRow label="Match ID" value={display.matchId} />
              <MetaRow label="Trigger" value={display.trigger} />
              <MetaRow label="HTTP status" value={display.httpStatus != null ? String(display.httpStatus) : null} />
              <MetaRow label="SB ticket ID" value={display.sbTicketId} />
              <MetaRow label="Offer index" value={display.offerIndex != null ? String(display.offerIndex) : null} />
              <MetaRow label="Fingerprint" value={display.listingFingerprint} />
              <MetaRow label="Pushed at" value={formatWhen(display.pushedAt)} />
              <MetaRow label="Status" value={display.status} />
              <MetaRow label="Inventory removed" value={formatWhen(display.inventoryRemovedAt)} />
              <MetaRow label="SB deleted at" value={formatWhen(display.sbDeletedAt)} />
              <MetaRow
                label="Delete HTTP"
                value={display.sbDeleteHttpStatus != null ? String(display.sbDeleteHttpStatus) : null}
              />
              {display.sbDeleteError ? (
                <div className="sm:col-span-2">
                  <MetaRow label="Delete error" value={display.sbDeleteError} />
                </div>
              ) : null}
              {display.errorMessage ? (
                <div className="sm:col-span-2">
                  <MetaRow label="Error message" value={display.errorMessage} />
                </div>
              ) : null}
            </dl>
          </section>

          <div className="space-y-4">
            <div>
              <p className={sectionTitle}>
                Request — POST {display.pushEndpoint}
                {display.pushApiUrl ? (
                  <span className="mt-0.5 block font-mono text-[9px] font-normal normal-case tracking-normal text-zinc-600">
                    {display.pushApiUrl}
                  </span>
                ) : null}
              </p>
              <pre className={preClass}>{prettyJson(display.requestFields)}</pre>
            </div>

            <div>
              <p className={sectionTitle}>Request summary (app)</p>
              <pre className={preClass}>{prettyJson(display.requestSummary)}</pre>
            </div>

            <div>
              <p className={sectionTitle}>API response</p>
              <pre className={preClass}>{responseText}</pre>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

export function SbCatalogListingInfoButton(props: {
  onClick: () => void;
  label?: string;
}) {
  const { onClick, label = "View push request and response" } = props;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.10] bg-black/30 text-zinc-400 transition-colors hover:border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] hover:text-[color:var(--ticketing-accent)]"
    >
      <InfoIcon />
    </button>
  );
}
