"use client";

import { SbPushPreviewModal } from "@/app/events/[eventId]/sb-push-preview-modal";
import type { SbPushSuccessResult } from "@/app/events/[eventId]/sb-push-result-types";
import { extractSbTicketId } from "@/lib/sb-ticket-id";
import { useCallback, useState } from "react";
import type { SbListingStatusEntry, SbListingUiStatus } from "@/lib/sb-listing-status";

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

export function seatKeyFromSeatIds(seatIds: string[]): string {
  return seatIds
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(",");
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
  onStatusChange: (seatKey: string, entry: SbListingStatusEntry | null) => void;
  onRefreshStatus: () => void;
};

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
    onRefreshStatus,
  } = props;
  const [previewOpen, setPreviewOpen] = useState(false);

  const seatKey = seatKeyFromSeatIds(seatIds);
  const isResale = kind === "RESALE";

  const handlePushed = useCallback(
    (result: SbPushSuccessResult) => {
      const sbTicketId = result.sbTicketId ?? extractSbTicketId(result.response) ?? null;
      const next: SbListingStatusEntry = {
        logId: result.logId ?? entry?.logId ?? 0,
        sbTicketId,
        status: "pushed",
        listingFingerprint: result.listingFingerprint || entry?.listingFingerprint || "",
        seatKey,
        blockName: result.blockName ?? blockName ?? entry?.blockName ?? null,
        row: result.row ?? rowLabel ?? entry?.row ?? null,
        seatNumbers:
          result.seatNumbers?.length
            ? result.seatNumbers
            : seatSpan
              ? seatSpan.split(/[,\s–-]+/).map((s) => s.trim()).filter(Boolean)
              : entry?.seatNumbers ?? [],
        inventoryRemovedAt: null,
        sbDeletedAt: null,
        sbDeleteError: null,
        pushedAt: new Date().toISOString(),
      };
      onStatusChange(seatKey, next);
      void onRefreshStatus();
    },
    [blockName, entry, onRefreshStatus, onStatusChange, rowLabel, seatKey, seatSpan],
  );

  if (!isResale) return <span className="text-xs text-zinc-600">—</span>;

  if (!sbEventId) {
    return (
      <span className="text-[11px] leading-snug text-zinc-500" title="Link this event to a SeatsBrokers match id">
        No SB id
      </span>
    );
  }

  if (entry) {
    return (
      <div className="flex min-w-0 flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statusBadge(entry.status)}
        </div>
        {entry.sbTicketId && entry.status === "pushed" ? <ListingIdDisplay sbTicketId={entry.sbTicketId} /> : null}
        {entry.sbTicketId && entry.status !== "pushed" ? (
          <code className="max-w-[10rem] truncate font-mono text-[11px] text-zinc-400" title={entry.sbTicketId}>
            was {entry.sbTicketId}
          </code>
        ) : null}
        {entry.status === "delete_failed" && entry.sbDeleteError ? (
          <span className="max-w-[12rem] truncate text-[10px] text-rose-300/90" title={entry.sbDeleteError}>
            {entry.sbDeleteError}
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

      <SbPushPreviewModal
        open={previewOpen}
        eventId={eventId}
        seatIds={seatIds}
        blockName={blockName}
        rowLabel={rowLabel}
        seatSpan={seatSpan}
        onClose={() => setPreviewOpen(false)}
        onPushed={handlePushed}
      />
    </>
  );
}
