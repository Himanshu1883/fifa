"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export type HomeSortKey = "match" | "price" | "tickets";

const sel =
  "min-h-9 rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-xs text-zinc-100 shadow-inner shadow-black/35 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

function buildQuery(base: URLSearchParams, sort: HomeSortKey, order: "asc" | "desc"): string {
  const params = new URLSearchParams(base.toString());
  const next = new URLSearchParams();

  for (const key of ["prefsErr"]) {
    const v = params.get(key);
    if (v != null && v !== "") next.set(key, v);
  }

  if (sort === "match" && order === "asc") {
    // default: omit sort & order
  } else {
    next.set("sort", sort);
    if (order === "desc") {
      next.set("order", "desc");
    }
  }

  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function HomeEventSortControls({
  sort,
  order,
}: {
  sort: HomeSortKey;
  order: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (nextSort: HomeSortKey, nextOrder: "asc" | "desc") => {
      const href = `${pathname}${buildQuery(searchParams, nextSort, nextOrder)}`;
      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2 ring-1 ring-white/[0.04]"
      aria-busy={pending}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Sort</span>
      <label className="sr-only" htmlFor="home-sort-field">
        Sort by
      </label>
      <select
        id="home-sort-field"
        className={sel}
        value={sort}
        onChange={(e) => {
          const v = e.target.value as HomeSortKey;
          navigate(v, v === sort ? order : "asc");
        }}
      >
        <option value="match">Match order</option>
        <option value="price">Lowest price</option>
        <option value="tickets">Ticket count</option>
      </select>
      <label className="sr-only" htmlFor="home-sort-order">
        Sort direction
      </label>
      <select
        id="home-sort-order"
        className={sel}
        value={order}
        onChange={(e) => navigate(sort, e.target.value === "desc" ? "desc" : "asc")}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
  );
}
