"use client";

import { updateSbEventIdAction } from "@/app/actions/event-sb-id";
import { ModalPortal } from "@/app/modal-portal";
import { useEffect, useId, useRef, useState } from "react";

const inpModal =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

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
  /** `button` = standalone chip (event detail). `inline` = pencil or compact Add beside pref cell. */
  trigger?: "button" | "inline";
};

export function AddSbIdDialog({ eventId, eventName, sbEventId, className, trigger = "button" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = (sbEventId ?? "").trim();
  const hasSbId = Boolean(trimmed);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

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
          aria-label={hasSbId ? `Edit SB event id for ${eventName ?? `event ${eventId}`}` : `Add SB event id for ${eventName ?? `event ${eventId}`}`}
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
            className="w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] p-5 shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              {hasSbId ? "SB event id" : "Add SB ID"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Event #{eventId}
              {eventName ? ` · ${eventName}` : ""}. SeatsBrokers mapping; leave empty to clear.
            </p>

            {fieldErrors._form ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">
                {fieldErrors._form}
              </p>
            ) : null}

            <form
              className="mt-4 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                setFieldErrors({});
                const result = await updateSbEventIdAction(new FormData(e.currentTarget));
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
                <label htmlFor={`sb-event-id-${eventId}`} className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  SB event id
                </label>
                <input
                  ref={inputRef}
                  id={`sb-event-id-${eventId}`}
                  name="sbEventId"
                  defaultValue={trimmed}
                  placeholder="SeatsBrokers event id"
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.sbEventId ? true : undefined}
                />
                {fieldErrors.sbEventId ? (
                  <p className="text-xs text-red-400">{fieldErrors.sbEventId}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className={btnSecondary}>
                  Cancel
                </button>
                <button type="submit" disabled={pending} className={btnPrimary}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
