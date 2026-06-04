"use client";

import { memo } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function ShopSearchInner({ value, onChange }: Props) {
  return (
    <div className="border-b border-white/[0.06] px-2 py-1 sm:px-3">
      <label className="relative block">
        <span className="sr-only">Search events</span>
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
          aria-hidden
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search events…"
          className="h-8 w-full rounded-md border border-white/[0.08] bg-black/35 py-0 pl-8 pr-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
        />
      </label>
    </div>
  );
}

export const ShopSearch = memo(ShopSearchInner);
