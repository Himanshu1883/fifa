"use client";

import { useId, useOptimistic, useTransition } from "react";
import { setEventImportant } from "@/app/actions/event-important";

type Props = {
  eventId: number;
  eventName: string;
  isImportant: boolean;
  /** Compact pills work well in both the table + card layouts. */
  size?: "sm" | "md";
  /** Hide the Yes/No label; renders a small icon-only control. */
  hideLabel?: boolean;
};

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

export function EventImportantToggle({ eventId, eventName, isImportant, size = "sm", hideLabel = false }: Props) {
  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(
    isImportant,
    (_prev: boolean, next: boolean) => next,
  );

  const pill = hideLabel
    ? [
        "inline-flex items-center justify-center rounded-full border shadow-sm shadow-black/35 ring-1 ring-white/[0.04] transition-[border-color,background-color,filter,opacity]",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        "border-white/[0.10] bg-black/25 text-zinc-300",
        "peer-checked:border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)]",
        "peer-checked:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)]",
        "peer-checked:text-[color:color-mix(in_oklab,var(--ticketing-accent)_90%,white_8%)]",
        pending ? "cursor-wait opacity-70" : "cursor-pointer hover:brightness-[1.05]",
        focusRing,
      ].join(" ")
    : [
        "inline-flex items-center justify-center rounded-full border text-xs font-semibold tabular-nums shadow-sm shadow-black/35 ring-1 ring-white/[0.04] transition-[border-color,background-color,filter,opacity]",
        size === "sm" ? "h-8 min-w-[3.25rem] px-2.5" : "h-9 min-w-[3.75rem] px-3",
        "border-white/[0.10] bg-black/25 text-zinc-300",
        "peer-checked:border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)]",
        "peer-checked:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)]",
        "peer-checked:text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)]",
        pending ? "cursor-wait opacity-70" : "cursor-pointer hover:brightness-[1.05]",
        focusRing,
      ].join(" ");

  return (
    <label
      className="inline-flex items-center"
      aria-label={`Mark ${eventName} as important`}
      title={checked ? "Important: Yes" : "Important: No"}
      aria-busy={pending}
    >
      <input
        id={inputId}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          startTransition(async () => {
            await setEventImportant(eventId, next);
          });
        }}
      />
      <span className={pill} aria-hidden>
        {hideLabel ? (checked ? "★" : "☆") : checked ? "Yes" : "No"}
      </span>
      <span className="sr-only">{checked ? "Important" : "Not important"}</span>
    </label>
  );
}

