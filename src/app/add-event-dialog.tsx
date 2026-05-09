"use client";

import { createEventAction } from "@/app/actions/create-event";
import { useEffect, useId, useRef, useState } from "react";

const inpModal =
  "w-full rounded-md border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

type Props = {
  suggestedSortOrder: number;
};

export function AddEventDialog({ suggestedSortOrder }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const titleId = useId();
  const formId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFieldErrors({});
          setOpen(true);
        }}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-950/30 transition-[filter] hover:brightness-[1.06] active:brightness-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c0b]"
      >
        Add event
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              New event
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              All editable Event fields — leave sort order blank to append after the highest order.
            </p>

            {fieldErrors._form ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">
                {fieldErrors._form}
              </p>
            ) : null}

            <form
              key={`${formId}-${suggestedSortOrder}`}
              id={formId}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                setFieldErrors({});
                const form = e.currentTarget;
                const result = await createEventAction(new FormData(form));
                setPending(false);
                if (result.ok) {
                  setOpen(false);
                  form.reset();
                } else {
                  setFieldErrors(result.fieldErrors);
                }
              }}
            >
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="add-event-matchLabel" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Match label <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  ref={firstFieldRef}
                  id="add-event-matchLabel"
                  name="matchLabel"
                  required
                  placeholder={`e.g. Match${suggestedSortOrder}`}
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.matchLabel ? true : undefined}
                  aria-describedby={fieldErrors.matchLabel ? "add-event-err-matchLabel" : undefined}
                />
                {fieldErrors.matchLabel ? (
                  <p id="add-event-err-matchLabel" className="text-xs text-red-400">
                    {fieldErrors.matchLabel}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="add-event-sortOrder" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Sort order
                </label>
                <input
                  id="add-event-sortOrder"
                  name="sortOrder"
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  defaultValue=""
                  placeholder={String(suggestedSortOrder)}
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.sortOrder ? true : undefined}
                  aria-describedby={fieldErrors.sortOrder ? "add-event-err-sortOrder" : undefined}
                />
                {fieldErrors.sortOrder ? (
                  <p id="add-event-err-sortOrder" className="text-xs text-red-400">
                    {fieldErrors.sortOrder}
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-600">Empty = use next ({suggestedSortOrder}).</p>
                )}
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="add-event-name" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Event name <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  id="add-event-name"
                  name="name"
                  required
                  placeholder="e.g. Team A vs Team B"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={fieldErrors.name ? "add-event-err-name" : undefined}
                />
                {fieldErrors.name ? (
                  <p id="add-event-err-name" className="text-xs text-red-400">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="add-event-stage" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Stage
                </label>
                <input
                  id="add-event-stage"
                  name="stage"
                  placeholder="e.g. Group stage"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.stage ? true : undefined}
                  aria-describedby={fieldErrors.stage ? "add-event-err-stage" : undefined}
                />
                {fieldErrors.stage ? (
                  <p id="add-event-err-stage" className="text-xs text-red-400">
                    {fieldErrors.stage}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="add-event-country" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Country
                </label>
                <input
                  id="add-event-country"
                  name="country"
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.country ? true : undefined}
                  aria-describedby={fieldErrors.country ? "add-event-err-country" : undefined}
                />
                {fieldErrors.country ? (
                  <p id="add-event-err-country" className="text-xs text-red-400">
                    {fieldErrors.country}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="add-event-venue" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Venue
                </label>
                <input
                  id="add-event-venue"
                  name="venue"
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.venue ? true : undefined}
                  aria-describedby={fieldErrors.venue ? "add-event-err-venue" : undefined}
                />
                {fieldErrors.venue ? (
                  <p id="add-event-err-venue" className="text-xs text-red-400">
                    {fieldErrors.venue}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="add-event-prefId" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Pref ID <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  id="add-event-prefId"
                  name="prefId"
                  required
                  placeholder="Primary catalogue pref"
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.prefId ? true : undefined}
                  aria-describedby={fieldErrors.prefId ? "add-event-err-prefId" : undefined}
                />
                {fieldErrors.prefId ? (
                  <p id="add-event-err-prefId" className="text-xs text-red-400">
                    {fieldErrors.prefId}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="add-event-resalePrefId" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Resale pref ID
                </label>
                <input
                  id="add-event-resalePrefId"
                  name="resalePrefId"
                  placeholder="Optional"
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.resalePrefId ? true : undefined}
                  aria-describedby={fieldErrors.resalePrefId ? "add-event-err-resalePrefId" : undefined}
                />
                {fieldErrors.resalePrefId ? (
                  <p id="add-event-err-resalePrefId" className="text-xs text-red-400">
                    {fieldErrors.resalePrefId}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Create event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
