"use client";

import { SbPushPreviewModal } from "@/app/events/[eventId]/sb-push-preview-modal";
import type { SbPushSuccessResult } from "@/app/events/[eventId]/sb-push-result-types";
import { preferListingEntry, seatKeyFromSeatIds, type SbRowLookupMeta } from "@/lib/sb-listing-row-index";
import { extractSbTicketId } from "@/lib/sb-ticket-id";
import { useCallback, useEffect, useState } from "react";
import type { SbListingStatusEntry, SbListingUiStatus } from "@/lib/sb-listing-status";

export { seatKeyFromSeatIds } from "@/lib/sb-listing-row-index";

const pushBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2.5 py-1 text-xs font-semibold text-zinc-50 shadow-sm shadow-black/25 transition-[filter,background-color] hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] hover:brightness-[1.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:cursor-not-allowed disabled:opacity-50";

function statusBadge(status: SbListingUiStatus) {
  switch (status) {
    case "pushed":
      return (
        <span className="inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
          On SB
        </span>
      );
    case "deleted":
      return (
        <span className="inline-flex items-center rounded-full border border-zinc-500/40 bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          Deleted
        </span>
      );
    case "removed":
      return (
        <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
          Removing…
        </span>
      );
    case "delete_failed":
      return (
        <span className="inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-100">
          Delete failed
        </span>
      );
  }
}

function ListingIdDisplay(props: { sbTicketId: string }) {
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">SB listing</span>
      <code
        className="max-w-[14rem] break-all font-mono text-sm font-bold tabular-nums text-emerald-100"
        title={`SeatsBrokers listing id: ${props.sbTicketId}`}
      >
        {props.sbTicketId}
      </code>
    </div>
  );
}

type Props = {
  eventId: number;
  sbEventId: string | null;
  sbConfigured: boolean;
  seatIds: string[];
  kind: "RESALE" | "LAST_MINUTE";
  entry: SbListingStatusEntry | null;
  blockName?: string | null;
  rowLabel?: string | null;
  seatSpan?: string | null;
  onStatusChange: (entry: SbListingStatusEntry, meta: SbRowLookupMeta) => void;
  onDeleted?: (entry: SbListingStatusEntry, meta: SbRowLookupMeta) => void;
};

const deleteBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-100 shadow-sm shadow-black/20 transition-[filter,background-color] hover:bg-rose-500/18 hover:brightness-[1.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:cursor-not-allowed disabled:opacity-50";

export function SbListingRowActions(props: Props) {
  const {
    eventId,
    sbEventId,
    sbConfigured,
    seatIds,
    kind,
    entry,
    blockName,
    rowLabel,
    seatSpan,
    onStatusChange,
    onDeleted,
  } = props;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [instantEntry, setInstantEntry] = useState<SbListingStatusEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const seatKey = seatKeyFromSeatIds(seatIds);
  const isResale = kind === "RESALE";

  useEffect(() => {
    if (!entry) return;
    if (entry.status === "pushed" && entry.sbTicketId) setInstantEntry(null);
    if (entry.status === "deleted" || entry.status === "removed" || entry.status === "delete_failed") {
      setInstantEntry(null);
    }
  }, [entry]);

  const displayEntry = (() => {
    const candidates = [instantEntry, entry].filter(Boolean) as SbListingStatusEntry[];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return preferListingEntry(candidates[0], candidates[1]) ?? candidates[0];
  })();

  const isOnSeatsBrokers = displayEntry?.status === "pushed";

  const handlePushed = useCallback(
    (result: SbPushSuccessResult) => {
      const rowMeta: SbRowLookupMeta = { seatIds, blockName, row: rowLabel, seatSpan };
      const sbTicketId = result.sbTicketId ?? extractSbTicketId(result.response) ?? null;
      const next: SbListingStatusEntry = {
        logId: result.logId ?? displayEntry?.logId ?? 0,
        sbTicketId,
        status: "pushed",
        listingFingerprint: result.listingFingerprint || displayEntry?.listingFingerprint || "",
        seatKey,
        blockName: result.blockName ?? blockName ?? displayEntry?.blockName ?? null,
        row: result.row ?? rowLabel ?? displayEntry?.row ?? null,
        seatNumbers:
          result.seatNumbers?.length
            ? result.seatNumbers
            : seatSpan
              ? seatSpan.split(/[,\s–-]+/).map((s) => s.trim()).filter(Boolean)
              : displayEntry?.seatNumbers ?? [],
        sourceSeatIds: seatIds,
        inventoryRemovedAt: null,
        sbDeletedAt: null,
        sbDeleteError: null,
        pushedAt: new Date().toISOString(),
      };

      setInstantEntry(next);
      onStatusChange(next, rowMeta);

      window.dispatchEvent(
        new CustomEvent("sb-listing-row-pushed", {
          detail: { eventId, meta: rowMeta, entry: next },
        }),
      );
    },
    [blockName, displayEntry, eventId, onStatusChange, rowLabel, seatIds, seatKey, seatSpan],
  );

  const handleDelete = useCallback(async () => {
    const ticketId = displayEntry?.sbTicketId?.trim();
    if (!ticketId || displayEntry?.status !== "pushed") return;

    const label = ticketId;
    if (
      !window.confirm(
        `Delete SB listing ${label}?\n\nThis calls SeatsBrokers ticket/delete and marks the listing removed in this app.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    const rowMeta: SbRowLookupMeta = { seatIds, blockName, row: rowLabel, seatSpan };

    try {
      const res = await fetch(`/api/events/${eventId}/sb-delete-listing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sbTicketId: ticketId,
          ...(displayEntry.logId > 0 ? { logId: displayEntry.logId } : {}),
          blockName: blockName ?? undefined,
          row: rowLabel ?? undefined,
          seatIds,
        }),
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entry?: SbListingStatusEntry;
      };
      if (!res.ok || !json.ok || !json.entry) {
        setDeleteError(json.error ?? `Delete failed (${res.status})`);
        return;
      }

      setInstantEntry(json.entry);
      onStatusChange(json.entry, rowMeta);
      onDeleted?.(json.entry, rowMeta);

      window.dispatchEvent(
        new CustomEvent("sb-listing-row-deleted", {
          detail: { eventId, meta: rowMeta, entry: json.entry },
        }),
      );
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }, [displayEntry, eventId, onDeleted, onStatusChange, blockName, rowLabel, seatIds, seatSpan]);

  if (!isResale) return <span className="text-xs text-zinc-600">—</span>;

  if (!sbEventId) {
    return (
      <span className="text-[11px] leading-snug text-zinc-500" title="Link this event to a SeatsBrokers match id">
        No SB id
      </span>
    );
  }

  if (isOnSeatsBrokers) {
    return (
      <div className="flex min-w-0 flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statusBadge("pushed")}
          <button
            type="button"
            className={deleteBtnClass}
            disabled={!sbConfigured || deleting || !displayEntry.sbTicketId}
            title={
              !sbConfigured
                ? "Set SEATS_BROKERS_API_KEY in .env.local"
                : "Delete this listing on SeatsBrokers"
            }
            aria-label={`Delete SB listing ${displayEntry.sbTicketId ?? ""}`}
            onClick={() => void handleDelete()}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        {displayEntry.sbTicketId ? (
          <ListingIdDisplay sbTicketId={displayEntry.sbTicketId} />
        ) : (
          <span className="text-[11px] text-zinc-400">On SB (no listing id in log)</span>
        )}
        {deleteError ? (
          <span className="max-w-[12rem] truncate text-[10px] text-rose-300/90" title={deleteError}>
            {deleteError}
          </span>
        ) : null}
      </div>
    );
  }

  if (displayEntry && displayEntry.status !== "pushed") {
    return (
      <div className="flex min-w-0 flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statusBadge(displayEntry.status)}
        </div>
        {displayEntry.sbTicketId ? (
          <code className="max-w-[10rem] truncate font-mono text-[11px] text-zinc-400" title={displayEntry.sbTicketId}>
            was {displayEntry.sbTicketId}
          </code>
        ) : null}
        {displayEntry.status === "delete_failed" && displayEntry.sbDeleteError ? (
          <span className="max-w-[12rem] truncate text-[10px] text-rose-300/90" title={displayEntry.sbDeleteError}>
            {displayEntry.sbDeleteError}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={pushBtnClass}
        disabled={!sbConfigured}
        title={!sbConfigured ? "Set SEATS_BROKERS_API_KEY in .env.local" : "Preview payload and push to SeatsBrokers"}
        onClick={() => setPreviewOpen(true)}
        aria-label="Preview and push listing to SeatsBrokers"
      >
        Push to SB
      </button>

      {previewOpen ? (
        <SbPushPreviewModal
          open
          eventId={eventId}
          seatIds={seatIds}
          blockName={blockName}
          rowLabel={rowLabel}
          seatSpan={seatSpan}
          onClose={() => setPreviewOpen(false)}
          onPushed={handlePushed}
        />
      ) : null}
    </>
  );
}
