"use client";

import { updateEventAction } from "@/app/actions/update-event";
import { useEffect, useId, useRef, useState } from "react";

const inpModal =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

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

export type EditableEvent = {
  id: number;
  matchLabel: string;
  sortOrder: number;
  name: string;
  stage: string | null;
  venue: string | null;
  country: string | null;
  prefId: string;
  resalePrefId: string | null;
  isImportant: boolean;
};

type Props = {
  event: EditableEvent;
  venueOptions?: string[];
  /** Optional extra classes for the icon button. */
  className?: string;
};

export function EditEventDialog({ event, venueOptions = [], className }: Props) {
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
        className={
          className ??
          "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-[color:var(--ticketing-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
        }
        aria-label={`Edit event ${event.id}`}
        title="Edit event"
      >
        <PencilIcon />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/70 p-4 backdrop-blur-md"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] p-5 shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              Edit event
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Event #{event.id}. Updates the schedule row and revalidates the home page.
            </p>

            {fieldErrors._form ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/35 px-3 py-2 text-sm text-red-300">
                {fieldErrors._form}
              </p>
            ) : null}

            <form
              key={`${formId}-${event.id}`}
              id={formId}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                setFieldErrors({});
                const form = e.currentTarget;
                const result = await updateEventAction(new FormData(form));
                setPending(false);
                if (result.ok) {
                  setOpen(false);
                } else {
                  setFieldErrors(result.fieldErrors);
                }
              }}
            >
              <input type="hidden" name="id" value={event.id} />

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label
                  htmlFor={`edit-event-matchLabel-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Match label <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  ref={firstFieldRef}
                  id={`edit-event-matchLabel-${event.id}`}
                  name="matchLabel"
                  required
                  defaultValue={event.matchLabel}
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.matchLabel ? true : undefined}
                  aria-describedby={fieldErrors.matchLabel ? `edit-event-err-matchLabel-${event.id}` : undefined}
                />
                {fieldErrors.matchLabel ? (
                  <p id={`edit-event-err-matchLabel-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.matchLabel}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-sortOrder-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Sort order <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  id={`edit-event-sortOrder-${event.id}`}
                  name="sortOrder"
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  required
                  defaultValue={String(event.sortOrder)}
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.sortOrder ? true : undefined}
                  aria-describedby={fieldErrors.sortOrder ? `edit-event-err-sortOrder-${event.id}` : undefined}
                />
                {fieldErrors.sortOrder ? (
                  <p id={`edit-event-err-sortOrder-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.sortOrder}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-important-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Important
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-200 shadow-inner shadow-black/25 ring-1 ring-white/[0.03]">
                  <input
                    id={`edit-event-important-${event.id}`}
                    name="isImportant"
                    type="checkbox"
                    defaultChecked={event.isImportant}
                    disabled={pending}
                    className="h-4 w-4 accent-[color:var(--ticketing-accent)]"
                  />
                  <span className="text-sm">Mark as important</span>
                </label>
                {fieldErrors.isImportant ? (
                  <p className="text-xs text-red-400">{fieldErrors.isImportant}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label
                  htmlFor={`edit-event-name-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Event name <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  id={`edit-event-name-${event.id}`}
                  name="name"
                  required
                  defaultValue={event.name}
                  placeholder="e.g. Team A vs Team B"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={fieldErrors.name ? `edit-event-err-name-${event.id}` : undefined}
                />
                {fieldErrors.name ? (
                  <p id={`edit-event-err-name-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-stage-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Stage
                </label>
                <input
                  id={`edit-event-stage-${event.id}`}
                  name="stage"
                  defaultValue={event.stage ?? ""}
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.stage ? true : undefined}
                  aria-describedby={fieldErrors.stage ? `edit-event-err-stage-${event.id}` : undefined}
                />
                {fieldErrors.stage ? (
                  <p id={`edit-event-err-stage-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.stage}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-country-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Country
                </label>
                <input
                  id={`edit-event-country-${event.id}`}
                  name="country"
                  defaultValue={event.country ?? ""}
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.country ? true : undefined}
                  aria-describedby={fieldErrors.country ? `edit-event-err-country-${event.id}` : undefined}
                />
                {fieldErrors.country ? (
                  <p id={`edit-event-err-country-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.country}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label
                  htmlFor={`edit-event-venue-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Venue
                </label>
                <input
                  id={`edit-event-venue-${event.id}`}
                  name="venue"
                  list={`edit-event-venues-${event.id}`}
                  defaultValue={event.venue ?? ""}
                  placeholder="Optional"
                  autoComplete="off"
                  className={inpModal}
                  aria-invalid={fieldErrors.venue ? true : undefined}
                  aria-describedby={fieldErrors.venue ? `edit-event-err-venue-${event.id}` : undefined}
                />
                {venueOptions.length > 0 ? (
                  <datalist id={`edit-event-venues-${event.id}`}>
                    {venueOptions.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                ) : null}
                {fieldErrors.venue ? (
                  <p id={`edit-event-err-venue-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.venue}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-prefId-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Pref ID <span className="text-emerald-400/90">*</span>
                </label>
                <input
                  id={`edit-event-prefId-${event.id}`}
                  name="prefId"
                  required
                  defaultValue={event.prefId}
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.prefId ? true : undefined}
                  aria-describedby={fieldErrors.prefId ? `edit-event-err-prefId-${event.id}` : undefined}
                />
                {fieldErrors.prefId ? (
                  <p id={`edit-event-err-prefId-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.prefId}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`edit-event-resalePrefId-${event.id}`}
                  className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Resale pref ID
                </label>
                <input
                  id={`edit-event-resalePrefId-${event.id}`}
                  name="resalePrefId"
                  defaultValue={event.resalePrefId ?? ""}
                  placeholder="Optional"
                  autoComplete="off"
                  className={`${inpModal} font-mono text-xs`}
                  aria-invalid={fieldErrors.resalePrefId ? true : undefined}
                  aria-describedby={
                    fieldErrors.resalePrefId ? `edit-event-err-resalePrefId-${event.id}` : undefined
                  }
                />
                {fieldErrors.resalePrefId ? (
                  <p id={`edit-event-err-resalePrefId-${event.id}`} className="text-xs text-red-400">
                    {fieldErrors.resalePrefId}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-950/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

