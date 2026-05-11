"use client";

import { useMemo, useState } from "react";
import { formatUsd, priceToNumber } from "@/lib/format-usd";

const searchInpClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[#0c1010] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-emerald-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e]";

export type SockAvailableDTO = {
  id: number;
  amount: string | null;
  areaName: string;
  blockName: string;
  contingentId: string;
  row: string;
  seatNumber: string;
  seatId: string;
  resaleMovementId: string;
  categoryName: string;
  categoryId: string;
  areaId: string;
  blockId: string;
  createdAt: string;
  updatedAt: string;
};

function norm(s: string): string {
  return String(s ?? "").trim();
}

function formatSockUsd(amount: string | null): string {
  if (!amount) return "—";
  const n = priceToNumber(amount);
  if (!Number.isFinite(n)) return "—";

  // User data uses "amount" in units that should be displayed as USD via /1000.
  // formatUsd expects minor units (cents), so convert: dollars = n/1000 => cents = n/10.
  const cents = n / 10;
  return formatUsd(String(cents));
}

export function SockAvailablePanel(props: { rows: SockAvailableDTO[]; embedInParentCard?: boolean }) {
  const { rows, embedInParentCard = false } = props;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.amount ?? "",
        r.areaName,
        r.blockName,
        r.contingentId,
        r.row,
        r.seatNumber,
        r.seatId,
        r.resaleMovementId,
        r.categoryName,
        r.categoryId,
        r.areaId,
        r.blockId,
        r.createdAt,
        r.updatedAt,
      ]
        .map((s) => norm(s))
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const sectionPad = embedInParentCard ? "px-4 sm:px-7" : "";

  return (
    <section className={`relative flex flex-col gap-3 sm:gap-4 ${sectionPad}`} aria-label="Sock available table">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            sock_available
          </p>
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Sock available rows
          </h2>
        </div>
        <p className="text-[11px] font-medium tabular-nums text-zinc-500">
          <span className="text-zinc-300">{filtered.length.toLocaleString("en-US")}</span>
          <span> shown</span>
          <span className="text-zinc-600"> / </span>
          <span className="text-zinc-400">{rows.length.toLocaleString("en-US")}</span>
          <span> loaded</span>
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-white/[0.12] bg-[#0c1010]/90 px-6 py-10 text-center shadow-inner shadow-black/40 ring-1 ring-white/[0.04]"
          role="status"
        >
          <p className="text-base font-medium text-zinc-100">No sock_available rows</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            When this event has sock availability data, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 rounded-xl border border-white/[0.07] bg-zinc-900/25 p-3.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <label
                htmlFor="sock-available-search"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
              >
                Search rows
              </label>
              <input
                id="sock-available-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Seat, row, category, movement, area…"
                className={searchInpClass}
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div
              className="rounded-xl border border-white/[0.07] bg-[#0c1010]/80 px-6 py-10 text-center ring-1 ring-white/[0.04]"
              role="status"
            >
              <p className="text-base font-medium text-zinc-100">No matching rows</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                Try a shorter search query.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#080c0b] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]">
              <div className="max-h-[70vh] overflow-auto [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[110rem] border-collapse text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0f1513]/95 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Area
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Block
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Contingent
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Row
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Seat #
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Amount
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Seat ID
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Resale movement
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Category
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Category ID
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Area ID
                      </th>
                      <th scope="col" className="px-4 py-3 pr-5 font-medium text-zinc-400 sm:pr-6">
                        Block ID
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Created
                      </th>
                      <th scope="col" className="px-4 py-3 pr-5 font-medium text-zinc-400 sm:pr-6">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {filtered.map((r) => (
                      <tr key={r.id} className="text-zinc-200 transition-colors hover:bg-emerald-500/[0.06]">
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.areaName}</td>
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.blockName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {r.contingentId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {r.row}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {r.seatNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-emerald-300">
                          {formatSockUsd(r.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500">
                          {r.seatId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500">
                          {r.resaleMovementId}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-200">{r.categoryName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500">
                          {r.categoryId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500">
                          {r.areaId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 pr-5 font-mono text-[11px] text-zinc-500 sm:pr-6">
                          {r.blockId}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500" title={r.createdAt}>
                          {r.createdAt}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 pr-5 font-mono text-[11px] text-zinc-500 sm:pr-6"
                          title={r.updatedAt}
                        >
                          {r.updatedAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

