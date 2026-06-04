"use client";

import { ModalPortal, stackedModalBackdropClass } from "@/app/modal-portal";
import type { SbCatalogListing } from "@/lib/sb-listings-catalog-types";
import { useEffect, useId } from "react";

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
  listing: SbCatalogListing | null;
  eventName: string;
  onClose: () => void;
};

export function SbCatalogListingDetailsModal({ open, listing, eventName, onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !listing) return null;

  const hasResponse = listing.responseBody != null;
  const responseText = listing.errorMessage
    ? listing.errorMessage
    : hasResponse
      ? prettyJson(listing.responseBody)
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
              {eventName} · ticket {listing.sbTicketId ?? "—"} · log #{listing.logId}
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
          <section className="mb-4 rounded-xl border border-white/[0.06] bg-black/25 p-3">
            <p className={sectionTitle}>Push log metadata</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {listing.pushApiUrl ? (
                <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/35 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Push API
                  </dt>
                  <dd className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-200 break-all">
                    POST {listing.pushApiUrl}
                  </dd>
                  <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-zinc-500">
                    <span>
                      Base{" "}
                      <span className="text-zinc-400">{listing.sbApiBaseUrl ?? "—"}</span>
                    </span>
                    <span>
                      Endpoint <span className="text-zinc-400">{listing.pushEndpoint}</span>
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
              {listing.deleteApiUrl ? (
                <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/35 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Delete API
                  </dt>
                  <dd className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-200 break-all">
                    POST {listing.deleteApiUrl}
                  </dd>
                  <dd className="mt-1.5 font-mono text-[10px] text-zinc-500">
                    Endpoint{" "}
                    <span className="text-zinc-400">{listing.deleteEndpoint ?? "ticket/delete"}</span>
                  </dd>
                </div>
              ) : null}
              <MetaRow label="Match ID" value={listing.matchId} />
              <MetaRow label="Trigger" value={listing.trigger} />
              <MetaRow label="HTTP status" value={listing.httpStatus != null ? String(listing.httpStatus) : null} />
              <MetaRow label="SB ticket ID" value={listing.sbTicketId} />
              <MetaRow label="Offer index" value={listing.offerIndex != null ? String(listing.offerIndex) : null} />
              <MetaRow label="Fingerprint" value={listing.listingFingerprint} />
              <MetaRow label="Pushed at" value={formatWhen(listing.pushedAt)} />
              <MetaRow label="Status" value={listing.status} />
              <MetaRow label="Inventory removed" value={formatWhen(listing.inventoryRemovedAt)} />
              <MetaRow label="SB deleted at" value={formatWhen(listing.sbDeletedAt)} />
              <MetaRow
                label="Delete HTTP"
                value={listing.sbDeleteHttpStatus != null ? String(listing.sbDeleteHttpStatus) : null}
              />
              {listing.sbDeleteError ? (
                <div className="sm:col-span-2">
                  <MetaRow label="Delete error" value={listing.sbDeleteError} />
                </div>
              ) : null}
              {listing.errorMessage ? (
                <div className="sm:col-span-2">
                  <MetaRow label="Error message" value={listing.errorMessage} />
                </div>
              ) : null}
            </dl>
          </section>

          <div className="space-y-4">
            <div>
              <p className={sectionTitle}>
                Request — POST {listing.pushEndpoint}
                {listing.pushApiUrl ? (
                  <span className="mt-0.5 block font-mono text-[9px] font-normal normal-case tracking-normal text-zinc-600">
                    {listing.pushApiUrl}
                  </span>
                ) : null}
              </p>
              <pre className={preClass}>{prettyJson(listing.requestFields)}</pre>
            </div>

            <div>
              <p className={sectionTitle}>Request summary (app)</p>
              <pre className={preClass}>{prettyJson(listing.requestSummary)}</pre>
            </div>

            <div>
              <p className={sectionTitle}>API response</p>
              <pre className={preClass}>{responseText}</pre>
            </div>
          </div>
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
