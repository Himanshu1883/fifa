"use client";

import { ModalPortal } from "@/app/modal-portal";
import { useReportEventOverlay } from "@/app/use-event-overlay";
import { parseMarkupPercentInput } from "@/lib/markup";
import { useMarkup } from "@/app/markup-context";
import { useEffect, useId, useRef, useState } from "react";

const inpModal =
  "w-full rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_48%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

const btnPrimary =
  "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_52%,transparent)] bg-[color:var(--ticketing-accent)] px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] disabled:opacity-50";

type Props = {
  className?: string;
};

export function MarkupControls({ className }: Props) {
  const { markupPercent, setMarkupPercent, clearMarkup } = useMarkup();
  const [open, setOpen] = useState(false);
  useReportEventOverlay(open);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const active = markupPercent > 0;

  useEffect(() => {
    if (!open) return;
    setInputValue(active ? String(markupPercent) : "");
    setError(null);
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, active, markupPercent]);

  const label = active ? `Markup +${markupPercent}%` : "Markup";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          (active
            ? "inline-flex min-h-10 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:var(--ticketing-accent)] px-5 text-sm font-semibold text-zinc-950 shadow-sm shadow-black/35 transition-[filter] hover:brightness-[1.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:min-h-11 sm:px-6"
            : "inline-flex min-h-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:min-h-11 sm:px-6")
        }
        title={
          active
            ? `Seat-offers API applies +${markupPercent}% (saved server-side)`
            : "Set markup for seat-offers-transformed API"
        }
      >
        {label}
      </button>

      {open ? (
        <ModalPortal
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_94%,transparent)] p-5 shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold text-zinc-100">
              Ticket markup
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Enter a percentage for the seat-offers API (e.g. 100 doubles prices). UI prices stay unmarked. Saved
              server-wide; curl without <code className="text-zinc-400">?markupPercent</code> uses this value. Use{" "}
              <code className="text-zinc-400">?markupPercent=0</code> to override for testing.
            </p>

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseMarkupPercentInput(inputValue);
                if (!parsed.ok) {
                  setError(parsed.message);
                  return;
                }
                if (parsed.value === 0) clearMarkup();
                else setMarkupPercent(parsed.value);
                setOpen(false);
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="markup-percent-input" className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Markup %
                </label>
                <input
                  ref={inputRef}
                  id="markup-percent-input"
                  type="text"
                  inputMode="decimal"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 50"
                  autoComplete="off"
                  className={`${inpModal} font-mono tabular-nums`}
                  aria-invalid={error ? true : undefined}
                />
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {active ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      clearMarkup();
                      setOpen(false);
                    }}
                  >
                    Clear markup
                  </button>
                ) : null}
                <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={btnPrimary}>
                  Apply
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
