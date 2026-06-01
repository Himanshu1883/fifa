"use client";

import { ModalPortal } from "@/app/modal-portal";
import { useEffect, useId, useState } from "react";

const btnSecondary =
  "rounded-lg border border-white/12 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const pillIdle =
  "inline-flex min-h-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 shadow-sm shadow-black/35 transition-colors hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)] sm:min-h-11 sm:px-6";

const sectionTitle = "text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500";
const codeBlock =
  "overflow-x-auto rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/[0.04]";

type Props = {
  className?: string;
  /** Example event id for curl samples (defaults to 1). */
  sampleEventId?: number;
};

function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.08] ring-1 ring-white/[0.04]">
      <table className="w-full min-w-[20rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.08] bg-black/30">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold text-zinc-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.05] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiDocumentationControls({ className, sampleEventId = 1 }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const eventId = sampleEventId > 0 ? sampleEventId : 1;
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const apiPath = `/api/events/${eventId}/seat-offers-transformed`;

  useEffect(() => {
    if (!open) return;
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
        onClick={() => setOpen(true)}
        className={className ?? pillIdle}
        title="Seat-offers API documentation"
      >
        API docs
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
            className="flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_96%,transparent)] shadow-2xl shadow-black/55 ring-1 ring-white/[0.04]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-white/[0.06] px-5 py-4">
              <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
                API documentation
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Seat-offers transformation API for SeatsBrokers integration. Prices in the response include markup
                when configured in the Markup control (saved server-side).
              </p>
            </header>

            <div
              className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm text-zinc-300"
              style={{ scrollbarGutter: "stable" }}
            >
              <section className="space-y-2">
                <h3 className={sectionTitle}>Endpoint</h3>
                <p className="font-mono text-sm text-sky-300/95">
                  GET <span className="text-zinc-100">{apiPath}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  Loads sock_available rows for an event, groups by block + price + offer type, applies quantity rules,
                  returns trimmed seat lists and a summary of found vs sent counts.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Query parameters</h3>
                <DocTable
                  headers={["Parameter", "Required", "Description"]}
                  rows={[
                    [
                      "markupPercent",
                      "No",
                      "Markup % applied to priceUsd and priceRaw (e.g. 100 doubles prices). Omit to use the value saved from the Markup button. Use 0 for base prices.",
                    ],
                    [
                      "kind",
                      "No",
                      "Filter inventory: RESALE or LAST_MINUTE. Omit to include both kinds.",
                    ],
                  ]}
                />
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Quantity rules (per block, same price)</h3>
                <p className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">Together</span> = consecutive seats in the same row/block.
                  <span className="font-medium text-zinc-400"> Single</span> = non-contiguous seats in the same block.
                  Unlisted counts pass through unchanged.
                </p>
                <DocTable
                  headers={["Type", "Seats found", "Seats sent"]}
                  rows={[
                    ["Together", "4", "1"],
                    ["Together", "5", "2"],
                    ["Together", "6", "2"],
                    ["Together", "7", "4"],
                    ["Together", "10", "4"],
                    ["Single", "4", "1"],
                    ["Single", "5", "2"],
                    ["Single", "6", "2"],
                    ["Single", "7", "2"],
                  ]}
                />
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Response highlights</h3>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-400">
                  <li>
                    <code className="text-zinc-300">ok</code>, <code className="text-zinc-300">eventId</code>,{" "}
                    <code className="text-zinc-300">sbEventId</code>, <code className="text-zinc-300">eventName</code>
                  </li>
                  <li>
                    <code className="text-zinc-300">markupPercent</code> — markup applied to this response
                  </li>
                  <li>
                    <code className="text-zinc-300">offers[]</code> — each offer with originalCount, transformedCount,
                    priceUsd, seats[]
                  </li>
                  <li>
                    <code className="text-zinc-300">summary.grandTotals</code> — seatsFound, seatsSent, seatReduction
                    across all buckets
                  </li>
                  <li>
                    <code className="text-zinc-300">summary.transformations[]</code> — per price bucket: seatsFound vs
                    seatsSent, wasTransformed, skipped
                  </li>
                  <li>
                    <code className="text-zinc-300">rules</code> — human-readable rule summary
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Related UI features</h3>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-zinc-400">
                  <li>
                    <span className="font-medium text-zinc-300">Markup</span> — sets server-wide markup used by this API
                    when markupPercent is omitted
                  </li>
                  <li>
                    <span className="font-medium text-zinc-300">Add SB ID</span> — maps an event to SeatsBrokers; returned
                    as <code className="text-zinc-300">sbEventId</code> in the API
                  </li>
                  <li>
                    <span className="font-medium text-zinc-300">SB API</span> — popup to preview payloads, see SB
                    responses, and push to <code className="text-zinc-300">ticket/create</code>
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Push to SeatsBrokers</h3>
                <p className="font-mono text-sm text-sky-300/95">
                  POST <span className="text-zinc-100">/api/events/{eventId}/push-to-seatsbrokers</span>
                </p>
                <p className="text-xs text-zinc-500">
                  Maps each transformed offer to SeatsBrokers seller API <code>ticket/create</code> using{" "}
                  <code>sbEventId</code> as <code>match_id</code>. Requires{" "}
                  <code>SEATS_BROKERS_API_KEY</code> in server env.
                </p>
                <DocTable
                  headers={["Query", "Description"]}
                  rows={[
                    ["dryRun=1", "Preview mapped payloads without calling SeatsBrokers"],
                    ["limit=N", "Max offers to push (default: all, max 500)"],
                    ["kind=RESALE", "Only resale sock rows"],
                    ["markupPercent=N", "Override markup on prices (omit = UI saved value)"],
                  ]}
                />
                <pre className={codeBlock}>{`curl -sS -X POST "${baseUrl}/api/events/${eventId}/push-to-seatsbrokers?dryRun=1&limit=5"`}</pre>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}/api/seatsbrokers/status"`}</pre>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Example requests</h3>
                <p className="text-[10px] text-zinc-500">Replace host if needed. Uses event id {eventId}.</p>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}${apiPath}"`}</pre>
                <p className="text-[10px] font-medium text-zinc-500">With persisted markup (from Markup button)</p>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}${apiPath}" | python3 -m json.tool`}</pre>
                <p className="text-[10px] font-medium text-zinc-500">Base prices only (override markup)</p>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}${apiPath}?markupPercent=0"`}</pre>
                <p className="text-[10px] font-medium text-zinc-500">Resale inventory only</p>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}${apiPath}?kind=RESALE"`}</pre>
                <p className="text-[10px] font-medium text-zinc-500">Summary only (compact)</p>
                <pre className={codeBlock}>{`curl -sS "${baseUrl}${apiPath}" | python3 -c "
import sys, json
s = json.load(sys.stdin)['summary']
out = {k: s[k] for k in s if k != 'transformations'}
out['transformationsCount'] = len(s['transformations'])
print(json.dumps(out, indent=2))
"`}</pre>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitle}>Browser</h3>
                <a
                  href={`${apiPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-sky-300/95 underline-offset-2 hover:text-sky-200 hover:underline"
                >
                  Open JSON for event {eventId}
                </a>
              </section>
            </div>

            <footer className="shrink-0 border-t border-white/[0.06] px-5 py-3">
              <div className="flex justify-end">
                <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </footer>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
