"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type HomeSeatCategoryHierarchyItem = {
  categoryId: string;
  categoryName: string;
  blocks: { blockId: string; blockName: string; availabilityResale: number | null }[];
};

type Props = {
  eventName: string;
  categoryCount: number;
  blockCount: number;
  hierarchy: HomeSeatCategoryHierarchyItem[];
  /** `"table"` renders `<td colSpan={2}>`; `"card"` renders a block for responsive card lists. */
  layout?: "table" | "card";
};

/** Surfaces aligned with home / event detail shell; focus rings use `--ticketing-accent`. */
const surfaceBorder = "border border-white/[0.08]";
const surfaceRing = "ring-1 ring-white/[0.04]";
const shellShadow = "shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]";
const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const compactTriggerBtn = [
  "inline-flex min-h-9 max-w-full items-center justify-end gap-1.5 rounded-lg px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-zinc-100",
  surfaceBorder,
  "border-white/[0.09] bg-black/25 transition-[border-color,background-color,box-shadow]",
  "hover:border-white/14 hover:bg-white/[0.05]",
  "shadow-md shadow-black/40",
  surfaceRing,
  focusRing,
].join(" ");

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HomeEventCategoryBlockCells({
  eventName,
  categoryCount,
  blockCount,
  hierarchy,
  layout = "table",
}: Props) {
  const [open, setOpen] = useState(false);
  const [dialogMaximized, setDialogMaximized] = useState(false);
  /** Multiple categories may be expanded at once (not exclusive accordion). */
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(() => new Set());
  const titleId = useId();
  const subtitleId = useId();
  const dialogId = useId();
  const categoryAccordionIdPrefix = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const collectFocusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter((el) => {
      if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
      if (typeof el.checkVisibility === "function") {
        return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      }
      const s = window.getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    });
  }, []);

  const closeDialog = useCallback(() => {
    setExpandedCategoryIds(new Set());
    setDialogMaximized(false);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key !== "Tab") return;

      const els = collectFocusables();
      if (els.length === 0) return;

      if (els.length === 1) {
        e.preventDefault();
        els[0].focus();
        return;
      }

      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !panelRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !panelRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, collectFocusables, closeDialog]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof Node && !panel.contains(t)) {
        collectFocusables()[0]?.focus();
      }
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open, collectFocusables]);

  const empty = hierarchy.length === 0;
  const summaryLabel = `Catalogue categories and blocks for ${eventName}`;
  // No visible "+" on the compact cell: the whole trigger (counts) opens the hierarchy dialog.
  const openDialog = () => {
    setDialogMaximized(false);
    setOpen(true);
  };
  const minimizeDialog = closeDialog;

  const dialogChromeBtn = [
    "rounded-xl border border-white/[0.09] bg-[color:var(--ticketing-elevated)] px-3 py-2 text-xs font-semibold text-zinc-200 shadow-sm shadow-black/30",
    "transition-[border-color,background-color,box-shadow] hover:border-white/14 hover:bg-white/[0.08]",
    surfaceRing,
    focusRing,
  ].join(" ");

  const trigger = (
    <button
      type="button"
      className={
        layout === "card"
          ? `${compactTriggerBtn} min-h-10 w-full max-w-full justify-center sm:w-auto sm:justify-end`
          : compactTriggerBtn
      }
      onClick={openDialog}
      aria-label={`Expand ${summaryLabel}: ${categoryCount} categories, ${blockCount} blocks`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? dialogId : undefined}
      title={`${summaryLabel} (${categoryCount} cat. · ${blockCount} blk.)`}
    >
      <span className="text-xs font-medium tabular-nums text-zinc-300">
        {categoryCount.toLocaleString("en-US")}
        <span className="mx-0.5 text-zinc-600" aria-hidden>
          ·
        </span>
        {blockCount.toLocaleString("en-US")}
      </span>
    </button>
  );

  return (
    <>
      {layout === "table" ? (
        <td colSpan={2} className="whitespace-nowrap px-3 py-3 text-right sm:px-4">
          {trigger}
        </td>
      ) : (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Categories · blocks
          </p>
          <div className="flex justify-end">{trigger}</div>
        </div>
      )}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black/75 via-black/60 to-black/70 p-4 backdrop-blur-md"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeDialog();
              }}
            >
              <div
                ref={panelRef}
                id={dialogId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={subtitleId}
                className={`flex w-full flex-col overflow-hidden rounded-2xl bg-[color:var(--ticketing-surface)] ${surfaceBorder} ${shellShadow} ${surfaceRing} ${
                  dialogMaximized
                    ? "max-h-[90vh] max-w-[min(96vw,72rem)]"
                    : "max-h-[min(90vh,46rem)] max-w-xl"
                }`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <header className="shrink-0 border-b border-white/[0.06] bg-black/25 px-5 pb-4 pt-5 backdrop-blur-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <h2 id={titleId} className="text-lg font-semibold tracking-tight text-zinc-50">
                        Categories &amp; blocks
                      </h2>
                      <p id={subtitleId} className="text-xs leading-relaxed text-zinc-500">
                        From the catalogue for <span className="font-medium text-zinc-400">{eventName}</span>
                        <span className="text-zinc-600"> · </span>
                        <span className="tabular-nums text-zinc-400">
                          {categoryCount} categor{categoryCount === 1 ? "y" : "ies"}, {blockCount} block
                          {blockCount === 1 ? "" : "s"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDialogMaximized((v) => !v)}
                        aria-pressed={dialogMaximized}
                        aria-label={dialogMaximized ? "Restore dialog size" : "Maximize dialog width"}
                        className={dialogChromeBtn}
                      >
                        {dialogMaximized ? "Shrink" : "Maximize"}
                      </button>
                      <button
                        type="button"
                        onClick={minimizeDialog}
                        aria-label="Minimize categories and blocks — return to compact row"
                        className={dialogChromeBtn}
                      >
                        Minimize
                      </button>
                      <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={minimizeDialog}
                        aria-label="Close categories and blocks dialog"
                        className={`${dialogChromeBtn} px-3.5`}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </header>

                <div
                  className="min-h-0 flex-1 overflow-y-auto scroll-smooth overscroll-contain px-5 py-4"
                  style={{ scrollbarGutter: "stable" }}
                >
                  {empty ? (
                    <div
                      role="status"
                      className={`rounded-xl px-4 py-6 text-center shadow-md shadow-black/35 ${surfaceBorder} bg-black/20 ${surfaceRing}`}
                    >
                      <p className="text-sm font-medium text-zinc-200">No catalogue structure yet</p>
                      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                        Once this match has inventory in the catalogue, categories and blocks will show here.
                      </p>
                    </div>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {hierarchy.map((cat, index) => {
                        const isExpanded = expandedCategoryIds.has(cat.categoryId);
                        const blocksRegionId = `${categoryAccordionIdPrefix}-blocks-${cat.categoryId}`;
                        const categoryRowLabelId = `${categoryAccordionIdPrefix}-label-${cat.categoryId}`;
                        const hasResaleTotal = cat.blocks.some((b) => b.availabilityResale != null);
                        const resaleTotal = cat.blocks.reduce(
                          (sum, b) => sum + (b.availabilityResale ?? 0),
                          0,
                        );
                        return (
                          <li
                            key={cat.categoryId}
                            className={`rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),inset_0_-1px_0_0_rgba(0,0,0,0.22)] ${surfaceBorder} bg-black/20 ${surfaceRing}`}
                          >
                            <button
                              type="button"
                              id={categoryRowLabelId}
                              aria-expanded={isExpanded}
                              aria-controls={blocksRegionId}
                              onClick={() =>
                                setExpandedCategoryIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(cat.categoryId)) next.delete(cat.categoryId);
                                  else next.add(cat.categoryId);
                                  return next;
                                })
                              }
                              className={`flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-white/[0.04] ${focusRing}`}
                            >
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-xs font-bold tabular-nums text-zinc-200 shadow-sm shadow-black/35"
                                aria-hidden
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-1">
                                  <span className="text-sm font-semibold text-zinc-100">
                                    {cat.categoryName || "—"}
                                  </span>
                                  {cat.blocks.length > 0 ? (
                                    <span className="inline-flex items-baseline gap-1.5 rounded-md border border-white/[0.1] bg-black/30 px-2 py-0.5 text-[11px] tabular-nums text-[color:color-mix(in_oklab,var(--ticketing-accent)_88%,white_8%)] shadow-sm shadow-black/30 ring-1 ring-white/[0.04]">
                                      <span className="opacity-80">Resale available tickets:</span>
                                      <span
                                        className={
                                          hasResaleTotal
                                            ? "font-semibold"
                                            : "font-medium opacity-60"
                                        }
                                      >
                                        {hasResaleTotal ? resaleTotal.toLocaleString("en-US") : "—"}
                                      </span>
                                    </span>
                                  ) : null}
                                  <code className="rounded-md bg-black/35 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
                                    {cat.categoryId}
                                  </code>
                                </div>
                              </div>
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-black/30 text-base font-bold leading-none text-zinc-300 shadow-sm shadow-black/35 ring-1 ring-white/[0.04]"
                                aria-hidden
                              >
                                {isExpanded ? "−" : "+"}
                              </span>
                            </button>

                            <div
                              id={blocksRegionId}
                              role="region"
                              aria-labelledby={categoryRowLabelId}
                              hidden={!isExpanded}
                              className="border-t border-white/[0.06] px-4 pb-4 pt-0"
                            >
                              <div className="pt-3">
                                {cat.blocks.length === 0 ? (
                                  <p className="text-xs text-zinc-500">No blocks catalogued under this category.</p>
                                ) : (
                                  <ul
                                    className="m-0 flex list-none flex-col gap-2 p-0"
                                    aria-label={`Blocks in ${cat.categoryName || cat.categoryId}`}
                                  >
                                    {cat.blocks.map((b) => {
                                      const availabilityResale = b.availabilityResale;
                                      const hasResale = availabilityResale != null;
                                      const resaleLabel =
                                        availabilityResale == null
                                          ? "—"
                                          : availabilityResale.toLocaleString("en-US");
                                      return (
                                        <li
                                          key={`${cat.categoryId}-${b.blockId}`}
                                          className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs shadow-sm shadow-black/35 ring-1 ring-white/[0.03]"
                                        >
                                          <span className="min-w-0">
                                            <span className="flex min-w-0 items-center gap-2">
                                              <span className="truncate font-medium text-zinc-200">
                                                {b.blockName || "—"}
                                              </span>
                                              <code className="shrink-0 font-mono text-[10px] text-zinc-500">
                                                {b.blockId}
                                              </code>
                                            </span>
                                          </span>
                                          <span
                                            className={`shrink-0 tabular-nums ${
                                              hasResale
                                                ? "text-[color:color-mix(in_oklab,var(--ticketing-accent)_88%,white_8%)]"
                                                : "text-zinc-500"
                                            }`}
                                          >
                                            <span className="opacity-80">Resale</span>
                                            <span className="px-1 opacity-60" aria-hidden>
                                              :
                                            </span>
                                            <span
                                              className={
                                                hasResale
                                                  ? "font-semibold"
                                                  : "font-medium opacity-60"
                                              }
                                            >
                                              {resaleLabel}
                                            </span>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
