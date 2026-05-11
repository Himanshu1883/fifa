"use client";

import { useEffect, useId, useState } from "react";
import { updateEventPrefs } from "@/app/actions/event-prefs";

const inpModal =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 font-mono text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

function cellText(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

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
  prefId: string;
  resalePrefId: string | null;
};

export function EventPrefsEditCell({ eventId, prefId, resalePrefId }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const resaleDisplay = cellText(resalePrefId);

  return (
    <>
      <div className="flex max-w-[min(22rem,100%)] flex-wrap items-center gap-2 sm:max-w-[22rem]">
        <div className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5 font-mono text-[12px] leading-snug text-zinc-200 ring-1 ring-white/[0.03]">
          <span className="text-zinc-500">Pref:</span>{" "}
          <span className="break-all text-zinc-100">{prefId}</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span className="text-zinc-500">Resale:</span>{" "}
          <span className="break-all text-zinc-300">{resaleDisplay}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-[color:var(--ticketing-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
          aria-label={`Edit pref and resale IDs for event ${eventId}`}
        >
          <PencilIcon />
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] p-5 shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              Edit catalogue IDs
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Event #{eventId} — pref and optional resale catalogue pref.
            </p>

            <form
              className="mt-4 flex flex-col gap-4"
              action={async (formData) => {
                await updateEventPrefs(formData);
                setOpen(false);
              }}
            >
              <input type="hidden" name="id" value={eventId} />

              <div className="flex flex-col gap-1">
                <label htmlFor={`pref-${eventId}`} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Pref ID <span className="text-emerald-400">*</span>
                </label>
                <input
                  id={`pref-${eventId}`}
                  name="prefId"
                  required
                  defaultValue={prefId}
                  autoComplete="off"
                  className={inpModal}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`resale-${eventId}`} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Resale pref ID
                </label>
                <input
                  id={`resale-${eventId}`}
                  name="resalePrefId"
                  defaultValue={resalePrefId ?? ""}
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-950/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
