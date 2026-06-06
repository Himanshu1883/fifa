"use client";

import type { SbBlockMappingRow, SbBlockMatchSource } from "@/lib/seatsbrokers-catalog";

function matchSourceLabel(source: SbBlockMatchSource): string {
  switch (source) {
    case "primary":
      return "Matched";
    case "cross_category":
      return "Cross-category";
    case "single_option":
      return "Only option";
    case "unmatched":
      return "Missing";
    default:
      return source;
  }
}

function matchSourceClass(source: SbBlockMatchSource): string {
  switch (source) {
    case "primary":
      return "border-emerald-500/30 bg-emerald-950/25 text-emerald-200";
    case "cross_category":
      return "border-sky-500/30 bg-sky-950/25 text-sky-200";
    case "single_option":
      return "border-amber-500/30 bg-amber-950/25 text-amber-200";
    case "unmatched":
      return "border-red-500/35 bg-red-950/25 text-red-200";
    default:
      return "border-white/10 bg-black/30 text-zinc-300";
  }
}

type Props = {
  rows: SbBlockMappingRow[];
  className?: string;
};

export function SbBlockMappingTable({ rows, className }: Props) {
  if (rows.length === 0) return null;

  const matched = rows.filter((r) => r.matched).length;
  const unmatched = rows.length - matched;

  return (
    <section className={className}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            FIFA → SB block mapping
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
            How FIFA resale blocks map to SeatsBrokers <code className="text-zinc-400">ticket_block</code> for this
            match. T-prefix blocks (e.g. T1-06) resolve to SB section numbers (06).
          </p>
        </div>
        <p className="text-[10px] text-zinc-500">
          <span className="font-mono text-emerald-300/90">{matched}</span> mapped ·{" "}
          <span className={`font-mono ${unmatched > 0 ? "text-red-300/90" : "text-zinc-500"}`}>{unmatched}</span>{" "}
          missing
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] ring-1 ring-white/[0.04]">
        <table className="min-w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.08] bg-black/40 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-semibold">FIFA block</th>
              <th className="px-3 py-2 font-semibold">FIFA category</th>
              <th className="px-3 py-2 font-semibold">SB section</th>
              <th className="px-3 py-2 font-semibold">SB category</th>
              <th className="px-3 py-2 font-semibold">ticket_block</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold text-right">Seats</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.fifaCategoryName}|${row.fifaBlockId}`}
                className={`border-b border-white/[0.05] ${row.matched ? "bg-black/20" : "bg-red-950/10"}`}
              >
                <td className="px-3 py-2 font-mono text-zinc-100">{row.fifaBlockName}</td>
                <td className="px-3 py-2 text-zinc-300">{row.fifaCategoryName}</td>
                <td className="px-3 py-2 font-mono text-zinc-200">{row.sbBlockCode ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-zinc-300">{row.sbCategoryId}</span>
                  <span className="ml-1 text-zinc-600">({row.sbCategoryLabel})</span>
                </td>
                <td className="px-3 py-2 font-mono text-sky-300/90">{row.sbBlockRowId ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${matchSourceClass(row.matchSource)}`}
                  >
                    {matchSourceLabel(row.matchSource)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">{row.seatCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmatched > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-200">
          Rows marked <strong>Missing</strong> need a manual <strong>ticket_block</strong> in the listing preview below,
          or SB may not list that section for this match.
        </p>
      ) : null}
    </section>
  );
}
