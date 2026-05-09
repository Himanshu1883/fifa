"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type HomeSeatCategoryHierarchyItem = {
  categoryId: string;
  categoryName: string;
  blocks: { blockId: string; blockName: string }[];
};

type Props = {
  eventName: string;
  categoryCount: number;
  blockCount: number;
  hierarchy: HomeSeatCategoryHierarchyItem[];
};

const countBtn =
  "min-h-9 w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-right text-sm font-medium tabular-nums text-zinc-200 transition-colors hover:border-white/10 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070a09]";

export function HomeEventCategoryBlockCells({
  eventName,
  categoryCount,
  blockCount,
  hierarchy,
}: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
  }, [open]);

  const empty = hierarchy.length === 0;
  const summaryLabel = `Seat categories and blocks for ${eventName}`;

  return (
    <>
      <td className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
        <button
          type="button"
          className={countBtn}
          onClick={() => setOpen(true)}
          aria-label={`${summaryLabel}. ${categoryCount} distinct categories—open dialog`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          title={categoryCount === 0 ? "No categories in seat listings" : summaryLabel}
        >
          {categoryCount.toLocaleString("en-US")}
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
        <button
          type="button"
          className={countBtn}
          onClick={() => setOpen(true)}
          aria-label={`${summaryLabel}. ${blockCount} distinct blocks—open dialog`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          title={blockCount === 0 ? "No blocks in seat listings" : summaryLabel}
        >
          {blockCount.toLocaleString("en-US")}
        </button>
      </td>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                id={dialogId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/50"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-base font-semibold text-zinc-100">
                      Categories &amp; blocks
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      From seat listings for <span className="text-zinc-400">{eventName}</span>
                      {" · "}
                      <span className="tabular-nums text-zinc-400">
                        {categoryCount} categor{categoryCount === 1 ? "y" : "ies"}, {blockCount} block
                        {blockCount === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className="shrink-0 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                  >
                    Close
                  </button>
                </div>

                {empty ? (
                  <p className="mt-5 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3 text-sm text-zinc-400">
                    No seat listing rows for this event yet, so there are no categories or blocks to show.
                  </p>
                ) : (
                  <ul className="mt-5 list-none space-y-4 p-0">
                    {hierarchy.map((cat) => (
                      <li
                        key={cat.categoryId}
                        className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 ring-1 ring-white/[0.04]"
                      >
                        <div className="text-sm text-zinc-100">
                          <span className="font-semibold">{cat.categoryName || "—"}</span>
                          <span className="ml-2 font-mono text-xs text-emerald-300/90">{cat.categoryId}</span>
                        </div>
                        {cat.blocks.length === 0 ? (
                          <p className="mt-2 text-xs text-zinc-500">No blocks in listings for this category.</p>
                        ) : (
                          <ul className="mt-2 list-none space-y-1.5 border-t border-white/[0.06] pt-2 pl-0">
                            {cat.blocks.map((b) => (
                              <li key={`${cat.categoryId}-${b.blockId}`} className="text-xs text-zinc-300">
                                <span className="text-zinc-200">{b.blockName || "—"}</span>
                                <span className="ml-2 font-mono text-[11px] text-zinc-500">{b.blockId}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
