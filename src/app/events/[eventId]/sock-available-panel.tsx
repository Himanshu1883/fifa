"use client";

import { ModalPortal } from "@/app/modal-portal";
import { SbRemovedListingsSection } from "@/app/events/[eventId]/sb-removed-listings-section";
import { SbBulkPushBar, type SbBulkPushQueueState } from "@/app/events/[eventId]/sb-bulk-push-bar";
import { SbListingRowActions } from "@/app/events/[eventId]/sb-listing-row-actions";
import {
  isSbRowDeletable,
  isSbRowDeletedForFilter,
  isSbRowPushed,
  isSbRowPushable,
  isSbRowUnpushedForFilter,
  type SbBulkDeleteItem,
  type SbBulkPushItem,
} from "@/lib/sb-bulk-push-utils";
import type { SbListingStatusEntry, SbListingStatusPayload } from "@/lib/sb-listing-status";
import {
  applyPinnedOverrides,
  findSbListingEntryForRow,
  indexSbListingEntry,
  loadPinnedSbListings,
  mergeSbListingBySeatKey,
  payloadFromBySeatKey,
  pinSbListingEntries,
  unpinSbListingEntries,
  type SbRowLookupMeta,
} from "@/lib/sb-listing-row-index";
import { resolvePlainSbCategoryNum, type SbCategoryNum } from "@/lib/sb-category";
import {
  bulkDeleteJobToQueueState,
  bulkPushJobToQueueState,
} from "@/lib/sb-bulk-job-queue-state";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatUsd, priceToNumber } from "@/lib/format-usd";
import { DEFAULT_SB_TICKET_TYPE_ID } from "@/lib/sb-ticket-types";

const SB_CATEGORY_FILTER_NUMS = [1, 2, 3, 4] as const satisfies readonly SbCategoryNum[];

type SbStatusFilter = "all" | "pushed" | "unpushed" | "deleted";

type BulkJobApi = {
  status?: "running" | "complete" | "failed" | "cancelled";
  current?: number;
  total?: number;
  succeeded?: number;
  failed?: number;
  lastError?: string | null;
  label?: string;
};

function pushJobToQueue(job: BulkJobApi, fallbackTotal = 0): SbBulkPushQueueState {
  return bulkPushJobToQueueState({
    id: 0,
    eventId: 0,
    status: job.status ?? "running",
    current: job.current ?? 0,
    total: job.total ?? fallbackTotal,
    succeeded: job.succeeded ?? 0,
    failed: job.failed ?? 0,
    lastError: job.lastError ?? null,
    label: job.label ?? "Starting…",
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  });
}

function deleteJobToQueue(job: BulkJobApi, fallbackTotal = 0): SbBulkPushQueueState {
  return bulkDeleteJobToQueueState({
    id: 0,
    eventId: 0,
    status: job.status ?? "running",
    current: job.current ?? 0,
    total: job.total ?? fallbackTotal,
    succeeded: job.succeeded ?? 0,
    failed: job.failed ?? 0,
    lastError: job.lastError ?? null,
    label: job.label ?? "Starting…",
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  });
}

function defaultCategoryNumFilter(): Set<SbCategoryNum> {
  return new Set(SB_CATEGORY_FILTER_NUMS);
}

function isDefaultCategoryNumFilter(selected: Set<SbCategoryNum>): boolean {
  return (
    selected.size === SB_CATEGORY_FILTER_NUMS.length &&
    SB_CATEGORY_FILTER_NUMS.every((n) => selected.has(n))
  );
}

function isDefaultCategoryFilter(
  selectedNums: Set<SbCategoryNum>,
  selectedCustomNames: Set<string>,
  addedCustomNames: Set<string>,
): boolean {
  return (
    isDefaultCategoryNumFilter(selectedNums) &&
    selectedCustomNames.size === 0 &&
    addedCustomNames.size === 0
  );
}

const searchInpClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const controlClass =
  "min-h-10 w-full rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-2.5 py-1.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-500 transition-[border-color,box-shadow] focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";

const BATCH_SELECT_SIZES = [1, 5, 10, 15, 20] as const;
type BatchSelectSize = (typeof BATCH_SELECT_SIZES)[number];

const batchSelectClass =
  "w-full rounded border border-white/20 bg-black/40 px-0.5 py-0.5 text-[9px] text-zinc-300 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type SockAvailableDTO = {
  id: number;
  amount: string | null;
  areaName: string;
  blockName: string;
  contingentId: string;
  row: string;
  seatNumber: string;
  seatId: string;
  resaleMovementId: string | null;
  categoryName: string;
  categoryId: string;
  areaId: string;
  blockId: string;
  kind: "RESALE" | "LAST_MINUTE";
  createdAt: string;
  updatedAt: string;
};

type SockAvailableKind = SockAvailableDTO["kind"];

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function listingKeyForSockAvailableRow(r: Pick<SockAvailableDTO, "resaleMovementId" | "seatId">): string {
  return r.resaleMovementId ? `m:${r.resaleMovementId}` : `s:${r.seatId}`;
}

function formatSockUsd(amount: string | null): string {
  if (!amount) return "—";
  const n = priceToNumber(amount);
  if (!Number.isFinite(n)) return "—";

  // User data uses "amount" in units that should be displayed as USD via /1000.
  // formatUsd expects minor units (cents), so convert: dollars = n/1000 => cents = n/10.
  return formatUsd(String(n / 10));
}

function amountRawToUsdNumber(amount: string | null): number {
  if (!amount) return Number.NaN;
  const n = priceToNumber(amount);
  if (!Number.isFinite(n)) return Number.NaN;
  return n / 1000;
}

function compareAmountUsdNullsLast(
  aAmount: string | null,
  bAmount: string | null,
  dir: "asc" | "desc",
): number {
  const av = amountRawToUsdNumber(aAmount);
  const bv = amountRawToUsdNumber(bAmount);
  const aOk = Number.isFinite(av);
  const bOk = Number.isFinite(bv);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  if (av === bv) return 0;
  return dir === "asc" ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
}

function formatTsCompact(ts: string): string {
  // "2026-05-11T18:22:33.123Z" -> "2026-05-11 18:22:33"
  if (!ts) return "—";
  const s = String(ts);
  return s.length >= 19 ? s.slice(0, 19).replace("T", " ") : s;
}

function formatAgeFromMs(ms: number, nowMs = Date.now()): string {
  if (!Number.isFinite(ms)) return "—";
  const diff = nowMs - ms;
  if (!Number.isFinite(diff)) return "—";
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(diff / (60 * 60_000));
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(diff / (24 * 60 * 60_000));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatAgeFromIso(iso: string): string {
  const ms = Date.parse(iso);
  return formatAgeFromMs(ms);
}

function parseStrictInt(s: string): number | null {
  const v = norm(s);
  if (!/^\d+$/.test(v)) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

type SockAvailableGroup = {
  id: string;
  kind: SockAvailableDTO["kind"];
  amount: string | null;
  areaName: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatSpan: string;
  togetherCount: number;
  seats: SockAvailableDTO[];
  seatSortStart: number | null;
  createdAtMinMs: number;
  createdAtMaxMs: number;
  updatedAtMinMs: number;
  updatedAtMaxMs: number;
};

function groupFromSingleRow(r: SockAvailableDTO): SockAvailableGroup {
  const c = Date.parse(r.createdAt);
  const u = Date.parse(r.updatedAt);
  const createdMs = Number.isFinite(c) ? c : Number.NaN;
  const updatedMs = Number.isFinite(u) ? u : Number.NaN;
  return {
    id: `raw|${r.id}`,
    kind: r.kind,
    amount: r.amount,
    areaName: r.areaName,
    categoryName: r.categoryName,
    blockName: r.blockName,
    row: r.row,
    seatSpan: r.seatNumber,
    togetherCount: 1,
    seats: [r],
    seatSortStart: parseStrictInt(r.seatNumber),
    createdAtMinMs: createdMs,
    createdAtMaxMs: createdMs,
    updatedAtMinMs: updatedMs,
    updatedAtMaxMs: updatedMs,
  };
}

function groupSockAvailableRows(rows: SockAvailableDTO[]): SockAvailableGroup[] {
  const byKey = new Map<string, SockAvailableDTO[]>();
  for (const r of rows) {
    const key = [
      r.kind,
      norm(r.areaName),
      norm(r.categoryName),
      norm(r.blockName),
      norm(r.row),
      r.amount ?? "",
    ].join("|");
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  const out: SockAvailableGroup[] = [];

  const pushGroup = (key: string, seats: SockAvailableDTO[], seatSortStart: number | null) => {
    if (seats.length === 0) return;
    const first = seats[0];
    const last = seats[seats.length - 1];
    const togetherCount = seats.length;
    const seatSpan = togetherCount === 1 ? first.seatNumber : `${first.seatNumber}-${last.seatNumber}`;

    let createdAtMinMs = Number.POSITIVE_INFINITY;
    let createdAtMaxMs = Number.NEGATIVE_INFINITY;
    let updatedAtMinMs = Number.POSITIVE_INFINITY;
    let updatedAtMaxMs = Number.NEGATIVE_INFINITY;

    for (const s of seats) {
      const c = Date.parse(s.createdAt);
      const u = Date.parse(s.updatedAt);
      if (Number.isFinite(c)) {
        createdAtMinMs = Math.min(createdAtMinMs, c);
        createdAtMaxMs = Math.max(createdAtMaxMs, c);
      }
      if (Number.isFinite(u)) {
        updatedAtMinMs = Math.min(updatedAtMinMs, u);
        updatedAtMaxMs = Math.max(updatedAtMaxMs, u);
      }
    }

    if (!Number.isFinite(createdAtMinMs)) createdAtMinMs = Number.NaN;
    if (!Number.isFinite(createdAtMaxMs)) createdAtMaxMs = Number.NaN;
    if (!Number.isFinite(updatedAtMinMs)) updatedAtMinMs = Number.NaN;
    if (!Number.isFinite(updatedAtMaxMs)) updatedAtMaxMs = Number.NaN;

    out.push({
      id: `${key}|${first.id}|${seatSpan}|${togetherCount}`,
      kind: first.kind,
      amount: first.amount,
      areaName: first.areaName,
      categoryName: first.categoryName,
      blockName: first.blockName,
      row: first.row,
      seatSpan,
      togetherCount,
      seats,
      seatSortStart,
      createdAtMinMs,
      createdAtMaxMs,
      updatedAtMinMs,
      updatedAtMaxMs,
    });
  };

  for (const [key, bucket] of byKey.entries()) {
    const numeric: Array<{ seatN: number; r: SockAvailableDTO }> = [];
    const nonNumeric: SockAvailableDTO[] = [];

    for (const r of bucket) {
      const seatN = parseStrictInt(r.seatNumber);
      if (seatN == null) nonNumeric.push(r);
      else numeric.push({ seatN, r });
    }

    for (const r of nonNumeric) pushGroup(key, [r], null);

    numeric.sort((a, b) => a.seatN - b.seatN || norm(a.r.seatNumber).localeCompare(norm(b.r.seatNumber)) || a.r.id - b.r.id);

    let runStart = 0;
    for (let i = 0; i < numeric.length; i++) {
      const prev = i > 0 ? numeric[i - 1] : null;
      const cur = numeric[i];
      const isBreak = i > 0 && (cur.seatN !== prev!.seatN + 1);
      if (isBreak) {
        const run = numeric.slice(runStart, i).map((x) => x.r);
        pushGroup(key, run, numeric[runStart]!.seatN);
        runStart = i;
      }
    }
    if (numeric.length > 0) {
      const run = numeric.slice(runStart).map((x) => x.r);
      pushGroup(key, run, numeric[runStart]!.seatN);
    }
  }

  return out;
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        className="stroke-zinc-500"
        strokeWidth="1.4"
      />
      <path d="M10 8.6v5.1" className="stroke-zinc-200" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 6.25h.01" className="stroke-zinc-200" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

type SortKey =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc"
  | "amount_desc"
  | "amount_asc"
  | "area_asc"
  | "category_asc"
  | "block_asc"
  | "row_asc"
  | "seat_asc";

export function SockAvailablePanel(props: {
  rows: SockAvailableDTO[];
  embedInParentCard?: boolean;
  initialKind?: "" | "RESALE" | "LAST_MINUTE";
  latestDiffNewKeysByKind?: Partial<Record<SockAvailableKind, string[]>>;
  eventId?: number;
  sbEventId?: string | null;
}) {
  const { rows, embedInParentCard = false, initialKind = "", latestDiffNewKeysByKind, eventId, sbEventId = null } = props;
  const smUp = useMediaQuery("(min-width: 640px)");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<SockAvailableGroup | null>(null);

  const [kind, setKind] = useState<"" | "RESALE" | "LAST_MINUTE">(initialKind);
  const [viewMode, setViewMode] = useState<"grouped" | "raw">("grouped");
  const [area, setArea] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [block, setBlock] = useState<string>("");
  const [row, setRow] = useState<string>("");
  const [seat, setSeat] = useState<string>("");
  const [seatsTogetherMin, setSeatsTogetherMin] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [contingent, setContingent] = useState<string>("");
  const [movement, setMovement] = useState<string>("");
  const [minUsd, setMinUsd] = useState<string>("");
  const [maxUsd, setMaxUsd] = useState<string>("");
  const [createdFrom, setCreatedFrom] = useState<string>("");
  const [createdTo, setCreatedTo] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("amount_asc");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const emptySbStatus = useMemo(
    (): SbListingStatusPayload => ({ bySeatKey: {}, active: [], removed: [] }),
    [],
  );
  const [sbStatus, setSbStatus] = useState<SbListingStatusPayload>(emptySbStatus);
  const [sbConfigured, setSbConfigured] = useState(false);
  const [sbStatusFilter, setSbStatusFilter] = useState<SbStatusFilter>("all");
  const [pushPreviewOpenCount, setPushPreviewOpenCount] = useState(0);
  const [selectedCategoryNums, setSelectedCategoryNums] = useState<Set<SbCategoryNum>>(defaultCategoryNumFilter);
  const [selectedCustomCategoryNames, setSelectedCustomCategoryNames] = useState<Set<string>>(() => new Set());
  const [addedCustomCategoryNames, setAddedCustomCategoryNames] = useState<Set<string>>(() => new Set());
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [selectedPushKeys, setSelectedPushKeys] = useState<Set<string>>(() => new Set());
  const [batchSelectSize, setBatchSelectSize] = useState<BatchSelectSize>(1);
  const [pushableSelectCount, setPushableSelectCount] = useState(20);
  const [bulkSelectCategoryNums, setBulkSelectCategoryNums] = useState<Set<SbCategoryNum>>(() => new Set());
  const [omitBlockKeys, setOmitBlockKeys] = useState<Set<string>>(() => new Set());
  const [bulkPushQueue, setBulkPushQueue] = useState<SbBulkPushQueueState | null>(null);
  const [bulkPushJobId, setBulkPushJobId] = useState<number | null>(null);
  const [bulkDeleteQueue, setBulkDeleteQueue] = useState<SbBulkPushQueueState | null>(null);
  const [bulkDeleteJobId, setBulkDeleteJobId] = useState<number | null>(null);
  const [bulkPushTicketTypeId, setBulkPushTicketTypeId] = useState(DEFAULT_SB_TICKET_TYPE_ID);
  const bulkDeleteStartedKeysRef = useRef<Set<string>>(new Set());

  const refreshSbConfigured = useCallback(async () => {
    try {
      const res = await fetch("/api/seatsbrokers/status", { cache: "no-store" });
      const json = (await res.json()) as { configured?: boolean; ok?: boolean };
      setSbConfigured(Boolean(res.ok && json.configured));
    } catch {
      setSbConfigured(false);
    }
  }, []);

  const loadBulkPushTicketType = useCallback(async () => {
    try {
      const res = await fetch("/api/seatsbrokers/auto-push", { cache: "no-store" });
      const data = (await res.json()) as { ticketType?: string };
      if (res.ok && data.ticketType) {
        setBulkPushTicketTypeId(data.ticketType);
      }
    } catch {
      /* keep default */
    }
  }, []);

  const saveBulkPushTicketType = useCallback(async (typeId: string) => {
    setBulkPushTicketTypeId(typeId);
    try {
      await fetch("/api/seatsbrokers/auto-push", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketType: typeId }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCategoryNumFilter = useCallback((num: SbCategoryNum) => {
    setSelectedCategoryNums((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, []);

  const resetCategoryFilter = useCallback(() => {
    setSelectedCategoryNums(defaultCategoryNumFilter());
    setSelectedCustomCategoryNames(new Set());
    setAddedCustomCategoryNames(new Set());
  }, []);

  const isCategoryFilterActive = useCallback(
    (categoryName: string): boolean => {
      const name = norm(categoryName);
      if (!name) return false;
      const sampleRow = rows.find((r) => norm(r.categoryName) === name);
      const categoryNum = resolvePlainSbCategoryNum(name, sampleRow?.categoryId);
      if (categoryNum != null) return selectedCategoryNums.has(categoryNum);
      return selectedCustomCategoryNames.has(name);
    },
    [rows, selectedCategoryNums, selectedCustomCategoryNames],
  );

  const toggleCategoryInFilter = useCallback(
    (categoryName: string) => {
      const name = norm(categoryName);
      if (!name) return;
      const sampleRow = rows.find((r) => norm(r.categoryName) === name);
      const categoryNum = resolvePlainSbCategoryNum(name, sampleRow?.categoryId);
      if (categoryNum != null) {
        setSelectedCategoryNums((prev) => {
          const next = new Set(prev);
          if (next.has(categoryNum)) next.delete(categoryNum);
          else next.add(categoryNum);
          return next;
        });
      } else {
        setAddedCustomCategoryNames((prevAdded) => {
          const nextAdded = new Set(prevAdded);
          nextAdded.add(name);
          return nextAdded;
        });
        setSelectedCustomCategoryNames((prev) => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name);
          else next.add(name);
          return next;
        });
      }
    },
    [rows],
  );

  const toggleCustomCategoryChip = useCallback((categoryName: string) => {
    const name = norm(categoryName);
    if (!name) return;
    setSelectedCustomCategoryNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const removeCustomCategoryChip = useCallback((categoryName: string) => {
    const name = norm(categoryName);
    if (!name) return;
    setSelectedCustomCategoryNames((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setAddedCustomCategoryNames((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const refreshSbStatus = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/events/${eventId}/sb-listing-status`, { cache: "no-store" });
      const json = (await res.json()) as SbListingStatusPayload & { ok?: boolean; configured?: boolean };
      if (res.ok && json.ok !== false) {
        setSbStatus((prev) => {
          const serverBySeatKey = json.bySeatKey ?? {};
          const pins = loadPinnedSbListings(eventId);
          const mergedBySeatKey = applyPinnedOverrides(
            mergeSbListingBySeatKey(prev.bySeatKey, pins, serverBySeatKey),
            pins,
          );
          return payloadFromBySeatKey(mergedBySeatKey);
        });
        if (json.configured != null) setSbConfigured(Boolean(json.configured));
      }
    } catch {
      /* non-fatal — listing status may fail before migration; keep empty status */
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const pins = loadPinnedSbListings(eventId);
    if (Object.keys(pins).length > 0) {
      setSbStatus((prev) => payloadFromBySeatKey(mergeSbListingBySeatKey(prev.bySeatKey, pins)));
    }
  }, [eventId]);

  useEffect(() => {
    void refreshSbConfigured();
    void refreshSbStatus();
    void loadBulkPushTicketType();
  }, [refreshSbConfigured, refreshSbStatus, loadBulkPushTicketType, eventId]);

  const resaleView = initialKind === "RESALE";

  const resaleInventoryKey = useMemo(() => {
    if (!resaleView) return "";
    return rows
      .filter((r) => r.kind === "RESALE")
      .map((r) => r.seatId?.trim() ?? "")
      .filter(Boolean)
      .sort()
      .join(",");
  }, [rows, resaleView]);

  useEffect(() => {
    if (!eventId || !resaleView) return;
    void refreshSbStatus();
  }, [eventId, resaleView, resaleInventoryKey, refreshSbStatus]);

  useEffect(() => {
    if (!eventId || !resaleView) return;
    const id = window.setInterval(() => {
      void refreshSbStatus();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [eventId, resaleView, refreshSbStatus]);

  useEffect(() => {
    if (!eventId || !resaleView) return;
    const onBulkPushed = (e: Event) => {
      const detail = (e as CustomEvent<{ eventId?: number }>).detail;
      if (detail?.eventId === eventId) {
        window.setTimeout(() => void refreshSbStatus(), 4000);
      }
    };
    window.addEventListener("sb-listing-pushed", onBulkPushed);
    return () => window.removeEventListener("sb-listing-pushed", onBulkPushed);
  }, [eventId, resaleView, refreshSbStatus]);

  useEffect(() => {
    if (!eventId || !resaleView) return;
    const onRowPushed = (e: Event) => {
      const detail = (e as CustomEvent<{
        eventId?: number;
        entry?: SbListingStatusEntry;
        meta?: SbRowLookupMeta;
      }>).detail;
      if (detail?.eventId !== eventId || !detail.entry || !detail.meta) return;
      pinSbListingEntries(eventId, detail.entry, detail.meta);
      setSbStatus((prev) => {
        const bySeatKey = { ...prev.bySeatKey };
        indexSbListingEntry(bySeatKey, detail.entry!, detail.meta!);
        return payloadFromBySeatKey(bySeatKey);
      });
    };
    window.addEventListener("sb-listing-row-pushed", onRowPushed);
    return () => window.removeEventListener("sb-listing-row-pushed", onRowPushed);
  }, [eventId, resaleView]);

  const handleSbStatusChange = useCallback(
    (entry: SbListingStatusEntry, meta: SbRowLookupMeta) => {
      if (!eventId) return;
      pinSbListingEntries(eventId, entry, meta);
      setSbStatus((prev) => {
        const bySeatKey = { ...prev.bySeatKey };
        indexSbListingEntry(bySeatKey, entry, meta);
        return payloadFromBySeatKey(bySeatKey);
      });
    },
    [eventId],
  );

  const handleSbDeleted = useCallback(
    (entry: SbListingStatusEntry, meta: SbRowLookupMeta) => {
      if (!eventId) return;
      unpinSbListingEntries(eventId, entry, meta);
      setSbStatus((prev) => {
        const bySeatKey = { ...prev.bySeatKey };
        indexSbListingEntry(bySeatKey, entry, meta);
        return payloadFromBySeatKey(bySeatKey);
      });
    },
    [eventId],
  );

  useEffect(() => {
    if (!eventId || !resaleView) return;
    const onRowDeleted = (e: Event) => {
      const detail = (e as CustomEvent<{
        eventId?: number;
        entry?: SbListingStatusEntry;
        meta?: SbRowLookupMeta;
      }>).detail;
      if (detail?.eventId !== eventId || !detail.entry || !detail.meta) return;
      handleSbDeleted(detail.entry, detail.meta);
      void refreshSbStatus();
    };
    window.addEventListener("sb-listing-row-deleted", onRowDeleted);
    return () => window.removeEventListener("sb-listing-row-deleted", onRowDeleted);
  }, [eventId, resaleView, handleSbDeleted, refreshSbStatus]);

  const lookupSbEntry = useCallback(
    (
      seatIds: string[],
      rowMeta?: { blockName?: string | null; row?: string | null; seatSpan?: string | null },
    ): SbListingStatusEntry | null => {
      const meta: SbRowLookupMeta = {
        seatIds,
        blockName: rowMeta?.blockName,
        row: rowMeta?.row,
        seatSpan: rowMeta?.seatSpan,
      };
      return findSbListingEntryForRow(sbStatus.bySeatKey, meta);
    },
    [sbStatus.bySeatKey],
  );

  const showSbColumn = Boolean(eventId) && resaleView;

  const handlePushPreviewOpenChange = useCallback((open: boolean) => {
    setPushPreviewOpenCount((c) => (open ? c + 1 : Math.max(0, c - 1)));
  }, []);

  const sbDeletedCount = sbStatus.removed.filter((e) => e.status === "deleted").length;

  const newKeySetByKind = useMemo(() => {
    return {
      RESALE: new Set(latestDiffNewKeysByKind?.RESALE ?? []),
      LAST_MINUTE: new Set(latestDiffNewKeysByKind?.LAST_MINUTE ?? []),
    } satisfies Record<SockAvailableKind, Set<string>>;
  }, [latestDiffNewKeysByKind?.LAST_MINUTE, latestDiffNewKeysByKind?.RESALE]);

  const isRowNew = useMemo(() => {
    return (r: SockAvailableDTO) => newKeySetByKind[r.kind].has(listingKeyForSockAvailableRow(r));
  }, [newKeySetByKind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep internal filter state in sync with prop changes
    setKind(initialKind);
  }, [initialKind]);

  useEffect(() => {
    if (!openGroup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openGroup]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCategoryPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [categoryPickerOpen]);

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.areaName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.categoryName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const customCategoryChipNames = useMemo(
    () => Array.from(addedCustomCategoryNames).sort((a, b) => a.localeCompare(b)),
    [addedCustomCategoryNames],
  );

  const blockOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = norm(r.blockName);
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRowsBeforeSb = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kindQ = norm(kind).toLowerCase();
    const areaQ = norm(area).toLowerCase();
    const categoryQ = norm(category).toLowerCase();
    const blockQ = norm(block).toLowerCase();
    const rowQ = norm(row).toLowerCase();
    const seatQ = norm(seat).toLowerCase();
    const contingentQ = norm(contingent).toLowerCase();
    const movementQ = norm(movement).toLowerCase();

    const minN = priceToNumber(minUsd);
    const maxN = priceToNumber(maxUsd);
    const hasMin = Number.isFinite(minN);
    const hasMax = Number.isFinite(maxN);

    const fromMs = createdFrom ? Date.parse(createdFrom) : Number.NaN;
    const toMs = createdTo ? Date.parse(createdTo) : Number.NaN;
    const hasFrom = Number.isFinite(fromMs);
    const hasTo = Number.isFinite(toMs);

    return rows.filter((r) => {
      const categoryNum = resolvePlainSbCategoryNum(r.categoryName, r.categoryId);
      const nameNorm = norm(r.categoryName);
      const matchesNum = categoryNum != null && selectedCategoryNums.has(categoryNum);
      const matchesCustom = nameNorm !== "" && selectedCustomCategoryNames.has(nameNorm);
      if (!matchesNum && !matchesCustom) return false;

      if (kindQ && norm(r.kind).toLowerCase() !== kindQ) return false;
      if (areaQ && norm(r.areaName).toLowerCase() !== areaQ) return false;
      if (categoryQ && norm(r.categoryName).toLowerCase() !== categoryQ) return false;
      if (blockQ && norm(r.blockName).toLowerCase() !== blockQ) return false;

      if (rowQ && !norm(r.row).toLowerCase().includes(rowQ)) return false;
      if (seatQ && !norm(r.seatNumber).toLowerCase().includes(seatQ)) return false;
      if (contingentQ && !norm(r.contingentId).toLowerCase().includes(contingentQ)) return false;
      if (movementQ && !norm(r.resaleMovementId ?? "").toLowerCase().includes(movementQ)) return false;

      const usd = amountRawToUsdNumber(r.amount);
      if (hasMin && (!Number.isFinite(usd) || usd < minN)) return false;
      if (hasMax && (!Number.isFinite(usd) || usd > maxN)) return false;

      const createdMs = Date.parse(r.createdAt);
      if (hasFrom && (!Number.isFinite(createdMs) || createdMs < fromMs)) return false;
      if (hasTo && (!Number.isFinite(createdMs) || createdMs > toMs)) return false;

      if (!q) return true;
      const hay = [
        r.amount ?? "",
        r.areaName,
        r.blockName,
        r.contingentId,
        r.row,
        r.seatNumber,
        r.seatId,
        r.resaleMovementId ?? "",
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
  }, [
    area,
    block,
    category,
    selectedCategoryNums,
    selectedCustomCategoryNames,
    contingent,
    createdFrom,
    createdTo,
    kind,
    maxUsd,
    minUsd,
    movement,
    row,
    rows,
    search,
    seat,
  ]);

  const eligibleRows = useMemo(() => {
    if (sbStatusFilter === "all" || !showSbColumn || !eventId) return filteredRowsBeforeSb;
    return filteredRowsBeforeSb.filter((r) => {
      const sbEntry = findSbListingEntryForRow(sbStatus.bySeatKey, {
        seatIds: [r.seatId],
        blockName: r.blockName,
        row: r.row,
        seatSpan: r.seatNumber,
      });
      if (sbStatusFilter === "pushed") return isSbRowPushed(sbEntry);
      if (sbStatusFilter === "unpushed") return isSbRowUnpushedForFilter(sbEntry);
      if (sbStatusFilter === "deleted") return isSbRowDeletedForFilter(sbEntry);
      return true;
    });
  }, [filteredRowsBeforeSb, sbStatusFilter, showSbColumn, eventId, sbStatus.bySeatKey]);

  const sbStatusFilterCounts = useMemo(() => {
    if (!showSbColumn || !eventId) return { pushed: 0, unpushed: 0, deleted: 0 };

    const sbEntryForRow = (r: SockAvailableDTO) =>
      findSbListingEntryForRow(sbStatus.bySeatKey, {
        seatIds: [r.seatId],
        blockName: r.blockName,
        row: r.row,
        seatSpan: r.seatNumber,
      });

    const rowsForStatus = (status: "pushed" | "unpushed" | "deleted") =>
      filteredRowsBeforeSb.filter((r) => {
        const entry = sbEntryForRow(r);
        if (status === "pushed") return isSbRowPushed(entry);
        if (status === "deleted") return isSbRowDeletedForFilter(entry);
        return isSbRowUnpushedForFilter(entry);
      });

    if (viewMode === "raw") {
      return {
        pushed: rowsForStatus("pushed").length,
        unpushed: rowsForStatus("unpushed").length,
        deleted: rowsForStatus("deleted").length,
      };
    }

    const countGroups = (statusRows: SockAvailableDTO[]) =>
      groupSockAvailableRows(statusRows).filter((g) => g.togetherCount >= seatsTogetherMin).length;

    return {
      pushed: countGroups(rowsForStatus("pushed")),
      unpushed: countGroups(rowsForStatus("unpushed")),
      deleted: countGroups(rowsForStatus("deleted")),
    };
  }, [
    filteredRowsBeforeSb,
    sbStatus.bySeatKey,
    showSbColumn,
    eventId,
    viewMode,
    seatsTogetherMin,
  ]);

  const groupedFiltered = useMemo(() => {
    return groupSockAvailableRows(eligibleRows).filter((g) => g.togetherCount >= seatsTogetherMin);
  }, [eligibleRows, seatsTogetherMin]);

  const groupedSorted = useMemo(() => {
    const sorted = [...groupedFiltered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "created_desc": {
          const av = Number.isFinite(a.createdAtMaxMs) ? a.createdAtMaxMs : Number.NEGATIVE_INFINITY;
          const bv = Number.isFinite(b.createdAtMaxMs) ? b.createdAtMaxMs : Number.NEGATIVE_INFINITY;
          cmp = bv - av;
          break;
        }
        case "created_asc": {
          const av = Number.isFinite(a.createdAtMinMs) ? a.createdAtMinMs : Number.POSITIVE_INFINITY;
          const bv = Number.isFinite(b.createdAtMinMs) ? b.createdAtMinMs : Number.POSITIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case "updated_desc": {
          const av = Number.isFinite(a.updatedAtMaxMs) ? a.updatedAtMaxMs : Number.NEGATIVE_INFINITY;
          const bv = Number.isFinite(b.updatedAtMaxMs) ? b.updatedAtMaxMs : Number.NEGATIVE_INFINITY;
          cmp = bv - av;
          break;
        }
        case "updated_asc": {
          const av = Number.isFinite(a.updatedAtMinMs) ? a.updatedAtMinMs : Number.POSITIVE_INFINITY;
          const bv = Number.isFinite(b.updatedAtMinMs) ? b.updatedAtMinMs : Number.POSITIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case "amount_desc":
          cmp = compareAmountUsdNullsLast(a.amount, b.amount, "desc");
          break;
        case "amount_asc":
          cmp = compareAmountUsdNullsLast(a.amount, b.amount, "asc");
          break;
        case "area_asc":
          cmp = norm(a.areaName).localeCompare(norm(b.areaName));
          break;
        case "category_asc":
          cmp = norm(a.categoryName).localeCompare(norm(b.categoryName));
          break;
        case "block_asc":
          cmp = norm(a.blockName).localeCompare(norm(b.blockName));
          break;
        case "row_asc":
          cmp = norm(a.row).localeCompare(norm(b.row), undefined, { numeric: true, sensitivity: "base" });
          break;
        case "seat_asc":
          if (a.seatSortStart != null && b.seatSortStart != null) cmp = a.seatSortStart - b.seatSortStart;
          else if (a.seatSortStart != null) cmp = -1;
          else if (b.seatSortStart != null) cmp = 1;
          else cmp = norm(a.seatSpan).localeCompare(norm(b.seatSpan), undefined, { numeric: true, sensitivity: "base" });
          break;
        default:
          cmp = 0;
      }
      if (Number.isFinite(cmp) && cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

    return sorted;
  }, [groupedFiltered, sortKey]);

  const rawSorted = useMemo(() => {
    const sorted = [...eligibleRows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "created_desc":
          cmp = Date.parse(b.createdAt) - Date.parse(a.createdAt);
          break;
        case "created_asc":
          cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt);
          break;
        case "updated_desc":
          cmp = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          break;
        case "updated_asc":
          cmp = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          break;
        case "amount_desc":
          cmp = compareAmountUsdNullsLast(a.amount, b.amount, "desc");
          break;
        case "amount_asc":
          cmp = compareAmountUsdNullsLast(a.amount, b.amount, "asc");
          break;
        case "area_asc":
          cmp = norm(a.areaName).localeCompare(norm(b.areaName));
          break;
        case "category_asc":
          cmp = norm(a.categoryName).localeCompare(norm(b.categoryName));
          break;
        case "block_asc":
          cmp = norm(a.blockName).localeCompare(norm(b.blockName));
          break;
        case "row_asc":
          cmp = norm(a.row).localeCompare(norm(b.row), undefined, { numeric: true, sensitivity: "base" });
          break;
        case "seat_asc": {
          const as = parseStrictInt(a.seatNumber);
          const bs = parseStrictInt(b.seatNumber);
          if (as != null && bs != null) cmp = as - bs;
          else if (as != null) cmp = -1;
          else if (bs != null) cmp = 1;
          else cmp = norm(a.seatNumber).localeCompare(norm(b.seatNumber), undefined, { numeric: true, sensitivity: "base" });
          break;
        }
        default:
          cmp = 0;
      }
      if (Number.isFinite(cmp) && cmp !== 0) return cmp;
      return a.id - b.id;
    });
    return sorted;
  }, [eligibleRows, sortKey]);

  const groupedLoadedCount = useMemo(() => groupSockAvailableRows(rows).length, [rows]);
  const shownItems = viewMode === "raw" ? rawSorted : groupedSorted;
  const shownCount = shownItems.length;
  const loadedCount = viewMode === "raw" ? rows.length : groupedLoadedCount;

  const bulkPushEnabled = showSbColumn && Boolean(sbEventId) && sbConfigured;

  const pushableItems = useMemo((): SbBulkPushItem[] => {
    if (!bulkPushEnabled) return [];
    if (viewMode === "raw") {
      return rawSorted
        .filter((r) => r.kind === "RESALE")
        .filter((r) =>
          isSbRowPushable(
            lookupSbEntry([r.seatId], {
              blockName: r.blockName,
              row: r.row,
              seatSpan: r.seatNumber,
            }),
          ),
        )
        .map((r) => ({
          key: `raw|${r.id}`,
          seatIds: [r.seatId],
          blockName: r.blockName,
          rowLabel: r.row,
          seatSpan: r.seatNumber,
          label: `${r.blockName} · R${r.row} · ${r.seatNumber}`,
          categoryName: r.categoryName,
          categoryId: r.categoryId,
        }));
    }
    return groupedSorted
      .filter((g) => g.kind === "RESALE")
      .filter((g) =>
        isSbRowPushable(
          lookupSbEntry(
            g.seats.map((s) => s.seatId),
            { blockName: g.blockName, row: g.row, seatSpan: g.seatSpan },
          ),
        ),
      )
      .map((g) => ({
        key: g.id,
        seatIds: g.seats.map((s) => s.seatId),
        blockName: g.blockName,
        rowLabel: g.row,
        seatSpan: g.seatSpan,
        label: `${g.blockName} · R${g.row} · ${g.seatSpan}`,
        categoryName: g.categoryName,
        categoryId: g.seats[0]?.categoryId ?? "",
      }));
  }, [bulkPushEnabled, viewMode, rawSorted, groupedSorted, lookupSbEntry]);

  const pushableKeySet = useMemo(() => new Set(pushableItems.map((i) => i.key)), [pushableItems]);

  const deletableItems = useMemo((): SbBulkDeleteItem[] => {
    if (!bulkPushEnabled) return [];
    const items: SbBulkDeleteItem[] = [];
    if (viewMode === "raw") {
      for (const r of rawSorted) {
        if (r.kind !== "RESALE") continue;
        const entry = lookupSbEntry([r.seatId], {
          blockName: r.blockName,
          row: r.row,
          seatSpan: r.seatNumber,
        });
        if (!isSbRowDeletable(entry) || !entry?.sbTicketId?.trim()) continue;
        items.push({
          key: `raw|${r.id}`,
          sbTicketId: entry.sbTicketId.trim(),
          ...(entry.logId > 0 ? { logId: entry.logId } : {}),
          seatIds: [r.seatId],
          blockName: r.blockName,
          rowLabel: r.row,
          seatSpan: r.seatNumber,
          label: `${r.blockName} · R${r.row} · ${r.seatNumber}`,
        });
      }
      return items;
    }
    for (const g of groupedSorted) {
      if (g.kind !== "RESALE") continue;
      const entry = lookupSbEntry(
        g.seats.map((s) => s.seatId),
        { blockName: g.blockName, row: g.row, seatSpan: g.seatSpan },
      );
      if (!isSbRowDeletable(entry) || !entry?.sbTicketId?.trim()) continue;
      items.push({
        key: g.id,
        sbTicketId: entry.sbTicketId.trim(),
        ...(entry.logId > 0 ? { logId: entry.logId } : {}),
        seatIds: g.seats.map((s) => s.seatId),
        blockName: g.blockName,
        rowLabel: g.row,
        seatSpan: g.seatSpan,
        label: `${g.blockName} · R${g.row} · ${g.seatSpan}`,
      });
    }
    return items;
  }, [bulkPushEnabled, viewMode, rawSorted, groupedSorted, lookupSbEntry]);

  const deletableKeySet = useMemo(() => new Set(deletableItems.map((i) => i.key)), [deletableItems]);

  const selectableKeySet = useMemo(() => {
    const keys = new Set<string>();
    for (const k of pushableKeySet) keys.add(k);
    for (const k of deletableKeySet) keys.add(k);
    return keys;
  }, [pushableKeySet, deletableKeySet]);

  const selectableRowsInOrder = useMemo(() => {
    const keys: string[] = [];
    if (viewMode === "raw") {
      for (const r of rawSorted) {
        const key = `raw|${r.id}`;
        if (selectableKeySet.has(key)) keys.push(key);
      }
    } else {
      for (const g of groupedSorted) {
        if (selectableKeySet.has(g.id)) keys.push(g.id);
      }
    }
    return keys;
  }, [viewMode, rawSorted, groupedSorted, selectableKeySet]);

  const pushableRowsInOrder = useMemo(() => {
    const keys: string[] = [];
    if (viewMode === "raw") {
      for (const r of rawSorted) {
        const key = `raw|${r.id}`;
        if (pushableKeySet.has(key)) keys.push(key);
      }
    } else {
      for (const g of groupedSorted) {
        if (pushableKeySet.has(g.id)) keys.push(g.id);
      }
    }
    return keys;
  }, [viewMode, rawSorted, groupedSorted, pushableKeySet]);

  useEffect(() => {
    setSelectedPushKeys((prev) => {
      const next = new Set([...prev].filter((k) => selectableKeySet.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setOmitBlockKeys((prev) => {
      const next = new Set([...prev].filter((k) => pushableKeySet.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableKeySet, pushableKeySet]);

  const selectedPushCount = useMemo(() => {
    let n = 0;
    for (const k of selectedPushKeys) {
      if (pushableKeySet.has(k)) n++;
    }
    return n;
  }, [selectedPushKeys, pushableKeySet]);

  const selectedDeletableCount = useMemo(() => {
    let n = 0;
    for (const k of selectedPushKeys) {
      if (deletableKeySet.has(k)) n++;
    }
    return n;
  }, [selectedPushKeys, deletableKeySet]);

  const selectedBulkCount = useMemo(() => {
    let n = 0;
    for (const k of selectedPushKeys) {
      if (selectableKeySet.has(k)) n++;
    }
    return n;
  }, [selectedPushKeys, selectableKeySet]);

  const togglePushSelection = useCallback((key: string) => {
    setSelectedPushKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const applyOmitBlockToPushableKeys = useCallback(
    (keys: Iterable<string>) => {
      setOmitBlockKeys((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (const k of keys) {
          if (pushableKeySet.has(k) && !next.has(k)) {
            next.add(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [pushableKeySet],
  );

  const selectBatchFromKey = useCallback(
    (key: string, count: number, syncOmitBlock = false) => {
      const index = selectableRowsInOrder.indexOf(key);
      if (index === -1) return;
      const keysToAdd: string[] = [];
      for (let i = index; i < selectableRowsInOrder.length && keysToAdd.length < count; i++) {
        keysToAdd.push(selectableRowsInOrder[i]!);
      }
      if (keysToAdd.length === 0) return;

      setSelectedPushKeys((prev) => {
        const next = new Set(prev);
        for (const k of keysToAdd) next.add(k);
        return next;
      });

      if (syncOmitBlock) applyOmitBlockToPushableKeys(keysToAdd);
    },
    [selectableRowsInOrder, applyOmitBlockToPushableKeys],
  );

  const handlePushSelectionChange = useCallback(
    (key: string, currentlySelected: boolean) => {
      if (batchSelectSize === 1) {
        togglePushSelection(key);
        return;
      }
      if (currentlySelected) {
        togglePushSelection(key);
      } else {
        selectBatchFromKey(key, batchSelectSize, true);
      }
    },
    [togglePushSelection, selectBatchFromKey, batchSelectSize],
  );

  const toggleOmitBlock = useCallback((key: string) => {
    setOmitBlockKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectOmitBlockBatchFromKey = useCallback(
    (key: string, count: number) => {
      const index = pushableRowsInOrder.indexOf(key);
      if (index === -1) return;
      const keysToAdd: string[] = [];
      for (let i = index; i < pushableRowsInOrder.length && keysToAdd.length < count; i++) {
        keysToAdd.push(pushableRowsInOrder[i]!);
      }
      applyOmitBlockToPushableKeys(keysToAdd);
    },
    [pushableRowsInOrder, applyOmitBlockToPushableKeys],
  );

  const handleOmitBlockChange = useCallback(
    (key: string, currentlyOmit: boolean) => {
      if (batchSelectSize === 1) {
        toggleOmitBlock(key);
        return;
      }
      if (currentlyOmit) {
        toggleOmitBlock(key);
      } else {
        selectOmitBlockBatchFromKey(key, batchSelectSize);
      }
    },
    [batchSelectSize, toggleOmitBlock, selectOmitBlockBatchFromKey],
  );

  const omitBlockSelectedCount = useMemo(() => {
    let n = 0;
    for (const k of selectedPushKeys) {
      if (pushableKeySet.has(k) && omitBlockKeys.has(k)) n++;
    }
    return n;
  }, [selectedPushKeys, omitBlockKeys, pushableKeySet]);

  const selectAllPushable = useCallback(() => {
    const keys = pushableItems.map((item) => item.key);
    setSelectedPushKeys((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.add(key);
      return next;
    });
    applyOmitBlockToPushableKeys(keys);
  }, [pushableItems, applyOmitBlockToPushableKeys]);

  const selectFirstNPushable = useCallback(
    (n: number) => {
      const count = Math.min(Math.max(1, Math.floor(n)), pushableItems.length, 999);
      const keys = pushableItems.slice(0, count).map((item) => item.key);
      setSelectedPushKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.add(key);
        return next;
      });
      applyOmitBlockToPushableKeys(keys);
    },
    [pushableItems, applyOmitBlockToPushableKeys],
  );

  const toggleBulkSelectCategoryNum = useCallback((num: SbCategoryNum) => {
    setBulkSelectCategoryNums((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, []);

  const selectPushableByCategories = useCallback(
    (n: number, categoryNums: readonly SbCategoryNum[]) => {
      if (categoryNums.length === 0) return;
      const perCategoryLimit = Math.min(Math.max(1, Math.floor(n)), 999);
      const categories = new Set(categoryNums);
      const perCategoryCount = new Map<SbCategoryNum, number>();
      for (const num of categories) perCategoryCount.set(num, 0);

      const keysToAdd: string[] = [];
      for (const item of pushableItems) {
        const categoryNum = resolvePlainSbCategoryNum(item.categoryName, item.categoryId);
        if (categoryNum == null || !categories.has(categoryNum)) continue;
        const taken = perCategoryCount.get(categoryNum) ?? 0;
        if (taken >= perCategoryLimit) continue;
        keysToAdd.push(item.key);
        perCategoryCount.set(categoryNum, taken + 1);
      }

      if (keysToAdd.length === 0) return;
      setSelectedPushKeys((prev) => {
        const next = new Set(prev);
        for (const key of keysToAdd) next.add(key);
        return next;
      });
      applyOmitBlockToPushableKeys(keysToAdd);
    },
    [pushableItems, applyOmitBlockToPushableKeys],
  );

  const selectAllDeletable = useCallback(() => {
    setSelectedPushKeys((prev) => {
      const next = new Set(prev);
      for (const item of deletableItems) next.add(item.key);
      return next;
    });
  }, [deletableItems]);

  const clearPushSelection = useCallback(() => {
    setSelectedPushKeys(new Set());
  }, []);

  const selectableCount = selectableKeySet.size;
  const allSelectableSelected = selectableCount > 0 && selectedBulkCount >= selectableCount;
  const selectAllHeaderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllHeaderRef.current;
    if (!el) return;
    el.indeterminate = selectedBulkCount > 0 && selectedBulkCount < selectableCount;
  }, [selectedBulkCount, selectableCount]);

  const toggleSelectAllSelectable = useCallback(() => {
    const allSelected = [...selectableKeySet].every((k) => selectedPushKeys.has(k));
    if (allSelected) {
      setSelectedPushKeys(new Set());
      return;
    }
    setSelectedPushKeys(new Set(selectableKeySet));
    const pushableKeys = [...selectableKeySet].filter((k) => pushableKeySet.has(k));
    applyOmitBlockToPushableKeys(pushableKeys);
  }, [selectableKeySet, pushableKeySet, selectedPushKeys, applyOmitBlockToPushableKeys]);

  const bulkActionRunning = Boolean(bulkPushQueue?.running || bulkDeleteQueue?.running);

  const runBulkPushQueue = useCallback(async () => {
    if (!eventId || !bulkPushEnabled || bulkActionRunning) return;
    const items = pushableItems.filter((i) => selectedPushKeys.has(i.key));
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Push ${items.length} listing(s) to SeatsBrokers?\n\nThey will be pushed one at a time in queue order.`,
      )
    ) {
      return;
    }

    setBulkPushQueue({
      running: true,
      current: 0,
      total: items.length,
      label: "Starting…",
      succeeded: 0,
      failed: 0,
      lastError: null,
    });

    try {
      const res = await fetch(`/api/events/${eventId}/sb-bulk-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketType: bulkPushTicketTypeId,
          items: items.map((item) => ({
            seatIds: item.seatIds,
            blockName: item.blockName,
            rowLabel: item.rowLabel,
            seatSpan: item.seatSpan,
            label: item.label,
            ...(omitBlockKeys.has(item.key) ? { omitTicketBlock: true } : {}),
          })),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        jobId?: number;
        alreadyRunning?: boolean;
        job?: {
          status?: "running" | "complete" | "failed";
          current?: number;
          total?: number;
          succeeded?: number;
          failed?: number;
          lastError?: string | null;
          label?: string;
        };
      };

      if (!res.ok || !json.ok || json.jobId == null) {
        setBulkPushQueue({
          running: false,
          current: 0,
          total: items.length,
          label: "Queue failed",
          succeeded: 0,
          failed: items.length,
          lastError: json.error ?? `Failed to start bulk push (${res.status})`,
        });
        window.setTimeout(() => setBulkPushQueue(null), 4000);
        return;
      }

      setBulkPushJobId(json.jobId);
      setBulkPushQueue(pushJobToQueue(json.job ?? {}, items.length));
      setSelectedPushKeys(new Set());
    } catch (e) {
      setBulkPushQueue({
        running: false,
        current: 0,
        total: items.length,
        label: "Queue failed",
        succeeded: 0,
        failed: items.length,
        lastError: e instanceof Error ? e.message : String(e),
      });
      window.setTimeout(() => setBulkPushQueue(null), 4000);
    }
  }, [
    eventId,
    bulkPushEnabled,
    bulkPushQueue?.running,
    pushableItems,
    selectedPushKeys,
    omitBlockKeys,
    bulkPushTicketTypeId,
  ]);

  const runBulkDeleteQueue = useCallback(async () => {
    if (!eventId || !bulkPushEnabled || bulkActionRunning) return;
    const items = deletableItems.filter((i) => selectedPushKeys.has(i.key));
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Delete ${items.length} listing(s) from SeatsBrokers?\n\nThey will be deleted one at a time in queue order. This cannot be undone on SB.`,
      )
    ) {
      return;
    }

    bulkDeleteStartedKeysRef.current = new Set(items.map((i) => i.key));

    setBulkDeleteQueue({
      running: true,
      current: 0,
      total: items.length,
      label: "Starting…",
      succeeded: 0,
      failed: 0,
      lastError: null,
    });

    try {
      const res = await fetch(`/api/events/${eventId}/sb-bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            sbTicketId: item.sbTicketId,
            ...(item.logId ? { logId: item.logId } : {}),
            seatIds: item.seatIds,
            blockName: item.blockName,
            rowLabel: item.rowLabel,
            seatSpan: item.seatSpan,
            label: item.label,
          })),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        jobId?: number;
        alreadyRunning?: boolean;
        job?: {
          status?: "running" | "complete" | "failed";
          current?: number;
          total?: number;
          succeeded?: number;
          failed?: number;
          lastError?: string | null;
          label?: string;
        };
      };

      if (!res.ok || !json.ok || json.jobId == null) {
        setBulkDeleteQueue({
          running: false,
          current: 0,
          total: items.length,
          label: "Queue failed",
          succeeded: 0,
          failed: items.length,
          lastError: json.error ?? `Failed to start bulk delete (${res.status})`,
        });
        window.setTimeout(() => setBulkDeleteQueue(null), 4000);
        return;
      }

      setBulkDeleteJobId(json.jobId);
      setBulkDeleteQueue(deleteJobToQueue(json.job ?? {}, items.length));
      setSelectedPushKeys(bulkDeleteStartedKeysRef.current);
    } catch (e) {
      setBulkDeleteQueue({
        running: false,
        current: 0,
        total: items.length,
        label: "Queue failed",
        succeeded: 0,
        failed: items.length,
        lastError: e instanceof Error ? e.message : String(e),
      });
      window.setTimeout(() => setBulkDeleteQueue(null), 4000);
    }
  }, [eventId, bulkPushEnabled, bulkDeleteQueue?.running, deletableItems, selectedPushKeys]);

  const cancelBulkPushQueue = useCallback(async () => {
    if (!eventId || bulkPushJobId == null || !bulkPushQueue?.running) return;

    setBulkPushQueue((prev) =>
      prev ? { ...prev, cancelling: true, label: "Cancelling…" } : prev,
    );

    try {
      const res = await fetch(`/api/events/${eventId}/sb-bulk-push/cancel?jobId=${bulkPushJobId}`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; job?: BulkJobApi; error?: string };
      if (!res.ok || !json.ok || !json.job) {
        setBulkPushQueue((prev) =>
          prev
            ? {
                ...prev,
                cancelling: false,
                lastError: json.error ?? `Failed to cancel (${res.status})`,
              }
            : prev,
        );
        return;
      }
      setBulkPushQueue(pushJobToQueue(json.job, bulkPushQueue?.total ?? 0));
    } catch (e) {
      setBulkPushQueue((prev) =>
        prev
          ? {
              ...prev,
              cancelling: false,
              lastError: e instanceof Error ? e.message : String(e),
            }
          : prev,
      );
    }
  }, [eventId, bulkPushJobId, bulkPushQueue?.running, bulkPushQueue?.total]);

  const cancelBulkDeleteQueue = useCallback(async () => {
    if (!eventId || bulkDeleteJobId == null || !bulkDeleteQueue?.running) return;

    setBulkDeleteQueue((prev) =>
      prev ? { ...prev, cancelling: true, label: "Cancelling…" } : prev,
    );

    try {
      const res = await fetch(`/api/events/${eventId}/sb-bulk-delete/cancel?jobId=${bulkDeleteJobId}`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; job?: BulkJobApi; error?: string };
      if (!res.ok || !json.ok || !json.job) {
        setBulkDeleteQueue((prev) =>
          prev
            ? {
                ...prev,
                cancelling: false,
                lastError: json.error ?? `Failed to cancel (${res.status})`,
              }
            : prev,
        );
        return;
      }
      setBulkDeleteQueue(deleteJobToQueue(json.job, bulkDeleteQueue?.total ?? 0));
    } catch (e) {
      setBulkDeleteQueue((prev) =>
        prev
          ? {
              ...prev,
              cancelling: false,
              lastError: e instanceof Error ? e.message : String(e),
            }
          : prev,
      );
    }
  }, [eventId, bulkDeleteJobId, bulkDeleteQueue?.running, bulkDeleteQueue?.total]);

  useEffect(() => {
    if (!eventId || !bulkPushEnabled) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/sb-bulk-push?active=1`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          job?: {
            id?: number;
            status?: "running" | "complete" | "failed";
            current?: number;
            total?: number;
            succeeded?: number;
            failed?: number;
            lastError?: string | null;
            label?: string;
          } | null;
        };
        if (cancelled || !res.ok || !json.ok || !json.job?.id) return;

        setBulkPushJobId(json.job.id);
        setBulkPushQueue(pushJobToQueue(json.job));
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, bulkPushEnabled]);

  useEffect(() => {
    if (!eventId || bulkPushJobId == null) return;

    let cancelled = false;
    let hideTimer: number | undefined;
    let lastCurrent = -1;
    let interval: number | undefined;

    const poll = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/sb-bulk-push?jobId=${bulkPushJobId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          job?: {
            status?: "running" | "complete" | "failed";
            current?: number;
            total?: number;
            succeeded?: number;
            failed?: number;
            lastError?: string | null;
            label?: string;
          } | null;
        };
        if (cancelled || !res.ok || !json.ok || !json.job) return;

        const job = json.job;
        setBulkPushQueue(pushJobToQueue(job));

        if ((job.current ?? 0) > lastCurrent) {
          lastCurrent = job.current ?? 0;
          void refreshSbStatus();
        }

        if (job.status !== "running") {
          void refreshSbStatus();
          if (interval != null) window.clearInterval(interval);
          if (hideTimer == null) {
            hideTimer = window.setTimeout(() => {
              if (!cancelled) {
                setBulkPushQueue(null);
                setBulkPushJobId(null);
              }
            }, 4000);
          }
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    interval = window.setInterval(() => void poll(), 1500);

    return () => {
      cancelled = true;
      if (interval != null) window.clearInterval(interval);
      if (hideTimer != null) window.clearTimeout(hideTimer);
    };
  }, [eventId, bulkPushJobId, refreshSbStatus]);

  useEffect(() => {
    if (!eventId || !bulkPushEnabled) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/sb-bulk-delete?active=1`, { cache: "no-store" });
        const json = (await res.json()) as {
          ok?: boolean;
          job?: {
            id?: number;
            status?: "running" | "complete" | "failed";
            current?: number;
            total?: number;
            succeeded?: number;
            failed?: number;
            lastError?: string | null;
            label?: string;
          } | null;
        };
        if (cancelled || !res.ok || !json.ok || !json.job?.id) return;

        setBulkDeleteJobId(json.job.id);
        setBulkDeleteQueue(deleteJobToQueue(json.job));
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, bulkPushEnabled]);

  useEffect(() => {
    if (!eventId || bulkDeleteJobId == null) return;

    let cancelled = false;
    let hideTimer: number | undefined;
    let lastCurrent = -1;
    let interval: number | undefined;

    const poll = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/sb-bulk-delete?jobId=${bulkDeleteJobId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          job?: {
            status?: "running" | "complete" | "failed";
            current?: number;
            total?: number;
            succeeded?: number;
            failed?: number;
            lastError?: string | null;
            label?: string;
          } | null;
        };
        if (cancelled || !res.ok || !json.ok || !json.job) return;

        const job = json.job;
        setBulkDeleteQueue(deleteJobToQueue(job));

        if ((job.current ?? 0) > lastCurrent) {
          lastCurrent = job.current ?? 0;
          void refreshSbStatus();
        }

        if (job.status !== "running") {
          void refreshSbStatus();
          if (interval != null) window.clearInterval(interval);
          if ((job.failed ?? 0) > 0) {
            setSelectedPushKeys(new Set(bulkDeleteStartedKeysRef.current));
          } else {
            setSelectedPushKeys(new Set());
          }
          if (hideTimer == null) {
            hideTimer = window.setTimeout(() => {
              if (!cancelled) {
                setBulkDeleteQueue(null);
                setBulkDeleteJobId(null);
              }
            }, 4000);
          }
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    interval = window.setInterval(() => void poll(), 1500);

    return () => {
      cancelled = true;
      if (interval != null) window.clearInterval(interval);
      if (hideTimer != null) window.clearTimeout(hideTimer);
    };
  }, [eventId, bulkDeleteJobId, refreshSbStatus]);

  const sectionPad = embedInParentCard ? "px-4 sm:px-7" : "";
  const filtersVisible = smUp ? filtersExpanded : mobileFiltersOpen;
  const hasAnyFilters = Boolean(
    search.trim() ||
      area ||
      category ||
      block ||
      row ||
      seat ||
      (viewMode === "grouped" && seatsTogetherMin !== 1) ||
      contingent ||
      movement ||
      minUsd ||
      maxUsd ||
      createdFrom ||
      createdTo ||
      sortKey !== "amount_asc" ||
      sbStatusFilter !== "all" ||
      !isDefaultCategoryFilter(
        selectedCategoryNums,
        selectedCustomCategoryNames,
        addedCustomCategoryNames,
      ),
  );

  const sbStatusFilterChipClass = (active: boolean) =>
    active
      ? "min-h-8 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
      : "min-h-8 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

  return (
    <section className={`relative flex flex-col gap-3 sm:gap-4 ${sectionPad}`} aria-label="Sock available table">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            sock_available
          </p>
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Sock available rows
          </h2>
          {resaleView && sbStatus.removed.length > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              {sbDeletedCount > 0 ? (
                <span className="font-medium text-zinc-400">
                  {sbDeletedCount} listing{sbDeletedCount === 1 ? "" : "s"} deleted on SB after scrape
                </span>
              ) : (
                <span className="text-amber-200/90">
                  {sbStatus.removed.length} removed from scrape — see below
                </span>
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">View</span>
            <div
              className="flex items-center rounded-xl bg-black/35 p-1 ring-1 ring-white/[0.10] shadow-inner shadow-black/35"
              role="group"
              aria-label="Sock available view mode"
            >
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={
                  viewMode === "grouped"
                    ? "min-h-8 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                    : "min-h-8 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                }
                aria-pressed={viewMode === "grouped"}
              >
                Grouped
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={
                  viewMode === "raw"
                    ? "min-h-8 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                    : "min-h-8 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                }
                aria-pressed={viewMode === "raw"}
              >
                All fields
              </button>
            </div>

            {viewMode === "grouped" ? (
              <>
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Seats together
                </span>
                <div
                  className="flex items-center rounded-xl bg-black/35 p-1 ring-1 ring-white/[0.10] shadow-inner shadow-black/35"
                  role="group"
                  aria-label="Seats together filter"
                >
                  {([1, 2, 3, 4, 5, 6] as const).map((v) => {
                    const active = seatsTogetherMin === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSeatsTogetherMin(v)}
                        className={
                          active
                            ? "min-h-8 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2.5 text-xs font-semibold tabular-nums text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                            : "min-h-8 rounded-lg px-2.5 text-xs font-semibold tabular-nums text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                        }
                        aria-pressed={active}
                        aria-label={`Seats together ${v === 6 ? "6+" : v}`}
                      >
                        {v === 6 ? "6+" : v}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>

          <p className="text-[11px] font-medium tabular-nums text-zinc-500">
            <span className="text-zinc-300">{shownCount.toLocaleString("en-US")}</span>
            <span> shown</span>
            <span className="text-zinc-600"> / </span>
            <span className="text-zinc-400">{loadedCount.toLocaleString("en-US")}</span>
            <span> loaded</span>
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-zinc-900/25 px-3.5 py-2.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:px-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Categories
          </span>
          <div
            className="flex flex-wrap items-center rounded-xl bg-black/35 p-1 ring-1 ring-white/[0.10] shadow-inner shadow-black/35"
            role="group"
            aria-label="Category filter"
          >
            {SB_CATEGORY_FILTER_NUMS.map((num) => {
              const active = selectedCategoryNums.has(num);
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => toggleCategoryNumFilter(num)}
                  className={
                    active
                      ? "min-h-8 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-2.5 text-xs font-semibold tabular-nums text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                      : "min-h-8 rounded-lg px-2.5 text-xs font-semibold tabular-nums text-zinc-300 outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                  }
                  aria-pressed={active}
                  aria-label={`Category ${num}${active ? " selected" : ""}`}
                >
                  Cat {num}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCategoryPickerOpen(true)}
              className="min-h-8 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 outline-none transition-colors hover:bg-white/[0.04] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
              aria-label="Add category filter"
              title="Add category"
            >
              +
            </button>
          </div>
          {showSbColumn ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                SB status
              </span>
              <div
                className="flex flex-wrap items-center rounded-xl bg-black/35 p-1 ring-1 ring-white/[0.10] shadow-inner shadow-black/35"
                role="radiogroup"
                aria-label="SB listing status filter"
              >
                {(
                  [
                    { value: "all" as const, label: "All" },
                    { value: "pushed" as const, label: "Pushed", count: sbStatusFilterCounts.pushed },
                    { value: "unpushed" as const, label: "Unpushed", count: sbStatusFilterCounts.unpushed },
                    { value: "deleted" as const, label: "Deleted", count: sbStatusFilterCounts.deleted },
                  ] as const
                ).map((chip) => {
                  const active = sbStatusFilter === chip.value;
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSbStatusFilter(chip.value)}
                      className={sbStatusFilterChipClass(active)}
                    >
                      {chip.label}
                      {"count" in chip && chip.count > 0 ? (
                        <span className="ml-1.5 rounded-full bg-black/35 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300">
                          {chip.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          {customCategoryChipNames.map((name) => {
            const active = selectedCustomCategoryNames.has(name);
            return (
              <div
                key={name}
                className={
                  active
                    ? "inline-flex min-h-8 max-w-full items-stretch overflow-hidden rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)]"
                    : "inline-flex min-h-8 max-w-full items-stretch overflow-hidden rounded-lg bg-black/35 ring-1 ring-white/[0.10]"
                }
              >
                <button
                  type="button"
                  onClick={() => toggleCustomCategoryChip(name)}
                  className={
                    active
                      ? "max-w-[12rem] truncate px-2.5 text-xs font-semibold text-zinc-50 outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] sm:max-w-[16rem]"
                      : "max-w-[12rem] truncate px-2.5 text-xs font-semibold text-zinc-400 outline-none transition-colors hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] sm:max-w-[16rem]"
                  }
                  aria-pressed={active}
                  aria-label={`${name}${active ? " selected" : ""}`}
                  title={name}
                >
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => removeCustomCategoryChip(name)}
                  className="border-l border-white/[0.10] px-2 text-xs font-medium text-zinc-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]"
                  aria-label={`Remove ${name} filter`}
                >
                  ×
                </button>
              </div>
            );
          })}
          {!isDefaultCategoryFilter(
            selectedCategoryNums,
            selectedCustomCategoryNames,
            addedCustomCategoryNames,
          ) ? (
            <button
              type="button"
              onClick={resetCategoryFilter}
              className="min-h-8 rounded-lg border border-white/[0.10] bg-black/25 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)]"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-white/[0.12] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_90%,transparent)] px-6 py-10 text-center shadow-inner shadow-black/40 ring-1 ring-white/[0.04]"
          role="status"
        >
          <p className="text-base font-medium text-zinc-100">No sock_available rows</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            When this event has sock availability data, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-white/[0.07] bg-zinc-900/25 p-3.5 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label
                  htmlFor="sock-available-search"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                >
                  Search
                </label>
                <input
                  id="sock-available-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Any field…"
                  className={searchInpClass}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2.5">
                <div className="flex min-w-0 flex-col gap-1 sm:w-[15rem]">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Sort
                  </label>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className={controlClass}
                  >
                    <option value="created_desc">Created (newest)</option>
                    <option value="created_asc">Created (oldest)</option>
                    <option value="updated_desc">Updated (newest)</option>
                    <option value="updated_asc">Updated (oldest)</option>
                    <option value="amount_asc">Amount (low to high)</option>
                    <option value="amount_desc">Amount (high to low)</option>
                    <option value="area_asc">Area (A→Z)</option>
                    <option value="category_asc">Category (A→Z)</option>
                    <option value="block_asc">Block (A→Z)</option>
                    <option value="row_asc">Row (A→Z)</option>
                    <option value="seat_asc">Seat (low to high)</option>
                  </select>
                </div>

                {smUp ? (
                  <div className="flex min-w-0 flex-col gap-1 sm:w-[11rem]">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Kind
                    </label>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as typeof kind)}
                      className={controlClass}
                    >
                      <option value="">All</option>
                      <option value="RESALE">Resale</option>
                      <option value="LAST_MINUTE">Last‑minute</option>
                    </select>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    if (smUp) setFiltersExpanded((v) => !v);
                    else setMobileFiltersOpen(true);
                  }}
                  aria-expanded={filtersVisible}
                  className={
                    hasAnyFilters || filtersVisible
                      ? "flex min-h-10 items-center justify-between gap-2 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-left text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] outline-none transition-colors hover:border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      : "flex min-h-10 items-center justify-between gap-2 rounded-lg border border-white/[0.10] bg-black/30 px-3 py-2 text-left text-sm font-semibold text-zinc-100 ring-1 ring-white/[0.04] outline-none transition-colors hover:border-white/16 hover:bg-black/40 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  }
                >
                  <span>{smUp ? (filtersVisible ? "Hide filters" : "More filters") : "Filters"}</span>
                  <span className="tabular-nums text-zinc-400" aria-hidden>
                    {filtersVisible ? "▴" : "▾"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
              <p className="text-[11px] leading-snug text-zinc-500 sm:text-xs">
                <span className="tabular-nums text-zinc-300">{shownCount.toLocaleString("en-US")}</span>
                <span> shown</span>
                <span className="text-zinc-700"> · </span>
                <span className="tabular-nums text-zinc-500">{loadedCount.toLocaleString("en-US")}</span>
                <span> loaded</span>
                <span>.</span>
              </p>

              {smUp && hasAnyFilters ? (
                <button
                  type="button"
                  className="min-h-9 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-xs font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  onClick={() => {
                    setSearch("");
                    setKind("");
                    setArea("");
                    setCategory("");
                    setBlock("");
                    setRow("");
                    setSeat("");
                    setSeatsTogetherMin(1);
                    setContingent("");
                    setMovement("");
                    setMinUsd("");
                    setMaxUsd("");
                    setCreatedFrom("");
                    setCreatedTo("");
                    setSortKey("amount_asc");
                    setSbStatusFilter("all");
                    resetCategoryFilter();
                    setShowMoreFilters(false);
                    setFiltersExpanded(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {smUp && filtersVisible ? (
              <div className="space-y-3 border-t border-white/[0.06] pt-2">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Area
                    </label>
                    <select value={area} onChange={(e) => setArea(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {areaOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Category
                    </label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {categoryOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Block
                    </label>
                    <select value={block} onChange={(e) => setBlock(e.target.value)} className={controlClass}>
                      <option value="">All</option>
                      {blockOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Row contains
                    </label>
                    <input
                      value={row}
                      onChange={(e) => setRow(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. Q"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Seat contains
                    </label>
                    <input
                      value={seat}
                      onChange={(e) => setSeat(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 24"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Amount USD min
                    </label>
                    <input
                      inputMode="decimal"
                      value={minUsd}
                      onChange={(e) => setMinUsd(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Amount USD max
                    </label>
                    <input
                      inputMode="decimal"
                      value={maxUsd}
                      onChange={(e) => setMaxUsd(e.target.value)}
                      className={controlClass}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Created from
                    </label>
                    <input
                      type="datetime-local"
                      value={createdFrom}
                      onChange={(e) => setCreatedFrom(e.target.value)}
                      className={controlClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex min-w-0 flex-col gap-1 lg:col-span-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Created to
                    </label>
                    <input
                      type="datetime-local"
                      value={createdTo}
                      onChange={(e) => setCreatedTo(e.target.value)}
                      className={controlClass}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 lg:col-span-3">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Advanced
                    </label>
                    <button
                      type="button"
                      className={
                        showMoreFilters
                          ? "min-h-10 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-left text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] outline-none transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                          : "min-h-10 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-left text-sm font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                      }
                      onClick={() => setShowMoreFilters((v) => !v)}
                      aria-expanded={showMoreFilters}
                    >
                      {showMoreFilters ? "Hide advanced" : "Show advanced"}
                    </button>
                  </div>
                </div>

                {showMoreFilters ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Contingent contains
                      </label>
                      <input
                        value={contingent}
                        onChange={(e) => setContingent(e.target.value)}
                        className={controlClass}
                        placeholder="e.g. 1140…"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Movement contains
                      </label>
                      <input
                        value={movement}
                        onChange={(e) => setMovement(e.target.value)}
                        className={controlClass}
                        placeholder="e.g. 10229…"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {!smUp && mobileFiltersOpen ? (
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Sock available filters"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMobileFiltersOpen(false);
              }}
            >
              <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Filters
                    </p>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-white">Sock available</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    Done
                  </button>
                </div>

                <div className="max-h-[75vh] overflow-auto px-4 py-4 [-webkit-overflow-scrolling:touch]">
                  <div className="grid gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Kind
                      </label>
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as typeof kind)}
                        className={controlClass}
                      >
                        <option value="">All</option>
                        <option value="RESALE">Resale</option>
                        <option value="LAST_MINUTE">Last‑minute</option>
                      </select>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Area
                      </label>
                      <select value={area} onChange={(e) => setArea(e.target.value)} className={controlClass}>
                        <option value="">All</option>
                        {areaOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={controlClass}
                      >
                        <option value="">All</option>
                        {categoryOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Block
                      </label>
                      <select value={block} onChange={(e) => setBlock(e.target.value)} className={controlClass}>
                        <option value="">All</option>
                        {blockOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Row contains
                        </label>
                        <input
                          value={row}
                          onChange={(e) => setRow(e.target.value)}
                          className={controlClass}
                          placeholder="e.g. Q"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Seat contains
                        </label>
                        <input
                          value={seat}
                          onChange={(e) => setSeat(e.target.value)}
                          className={controlClass}
                          placeholder="e.g. 24"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Amount USD min
                        </label>
                        <input
                          inputMode="decimal"
                          value={minUsd}
                          onChange={(e) => setMinUsd(e.target.value)}
                          className={controlClass}
                          placeholder="e.g. 100"
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Amount USD max
                        </label>
                        <input
                          inputMode="decimal"
                          value={maxUsd}
                          onChange={(e) => setMaxUsd(e.target.value)}
                          className={controlClass}
                          placeholder="e.g. 500"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Created from
                        </label>
                        <input
                          type="datetime-local"
                          value={createdFrom}
                          onChange={(e) => setCreatedFrom(e.target.value)}
                          className={controlClass}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Created to
                        </label>
                        <input
                          type="datetime-local"
                          value={createdTo}
                          onChange={(e) => setCreatedTo(e.target.value)}
                          className={controlClass}
                        />
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Advanced
                      </label>
                      <button
                        type="button"
                        className={
                          showMoreFilters
                            ? "min-h-10 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-3 py-2 text-left text-sm font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] outline-none transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                            : "min-h-10 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-left text-sm font-medium text-zinc-200 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                        }
                        onClick={() => setShowMoreFilters((v) => !v)}
                        aria-expanded={showMoreFilters}
                      >
                        {showMoreFilters ? "Hide advanced" : "Show advanced"}
                      </button>
                    </div>

                    {showMoreFilters ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Contingent contains
                          </label>
                          <input
                            value={contingent}
                            onChange={(e) => setContingent(e.target.value)}
                            className={controlClass}
                            placeholder="e.g. 1140…"
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Movement contains
                          </label>
                          <input
                            value={movement}
                            onChange={(e) => setMovement(e.target.value)}
                            className={controlClass}
                            placeholder="e.g. 10229…"
                          />
                        </div>
                      </div>
                    ) : null}

                    {hasAnyFilters ? (
                      <button
                        type="button"
                        className="mt-1 min-h-10 w-full rounded-lg border border-white/[0.10] bg-black/25 px-3 py-2 text-sm font-semibold text-zinc-100 shadow-inner shadow-black/35 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                        onClick={() => {
                          setSearch("");
                          setKind("");
                          setArea("");
                          setCategory("");
                          setBlock("");
                          setRow("");
                          setSeat("");
                          setSeatsTogetherMin(1);
                          setContingent("");
                          setMovement("");
                          setMinUsd("");
                          setMaxUsd("");
                          setCreatedFrom("");
                          setCreatedTo("");
                          setSortKey("amount_asc");
                          setSbStatusFilter("all");
                          resetCategoryFilter();
                          setShowMoreFilters(false);
                          setFiltersExpanded(false);
                          setMobileFiltersOpen(false);
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {resaleView && sbStatus.removed.length > 0 ? (
            <SbRemovedListingsSection entries={sbStatus.removed} />
          ) : null}

          {shownItems.length === 0 ? (
            <div
              className="rounded-xl border border-white/[0.07] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_88%,transparent)] px-6 py-10 text-center ring-1 ring-white/[0.04]"
              role="status"
            >
              <p className="text-base font-medium text-zinc-100">No matching rows</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                Try a shorter search query.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05]">
              <div className="max-h-[70vh] overflow-auto [-webkit-overflow-scrolling:touch]">
                {viewMode === "raw" ? (
                  <table className="w-full min-w-[110rem] border-collapse text-sm">
                    <thead>
                      <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_95%,transparent)] text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                        {bulkPushEnabled ? (
                          <>
                            <th scope="col" className="w-14 px-1 py-3 text-center font-medium text-zinc-400">
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  ref={selectAllHeaderRef}
                                  type="checkbox"
                                  checked={allSelectableSelected}
                                  disabled={bulkActionRunning || selectableCount === 0}
                                  className="size-4 rounded border-white/20 bg-black/40 accent-[color:var(--ticketing-accent)]"
                                  aria-label="Select all pushable and on-SB listings"
                                  title={
                                    selectableCount === 0
                                      ? "No selectable listings"
                                      : allSelectableSelected
                                        ? "Clear selection"
                                        : `Select all (${selectableCount})`
                                  }
                                  onChange={toggleSelectAllSelectable}
                                />
                                <select
                                  value={batchSelectSize}
                                  onChange={(e) => setBatchSelectSize(Number(e.target.value) as BatchSelectSize)}
                                  className={batchSelectClass}
                                  title="Number of rows to select per checkbox click"
                                  aria-label="Batch select size"
                                >
                                  {BATCH_SELECT_SIZES.map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </th>
                            <th
                              scope="col"
                              className="w-12 px-1 py-3 text-center font-medium text-zinc-400"
                              title="Omit ticket_block from SB payload"
                            >
                              <span className="sr-only">Omit block</span>
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/80">
                                No blk
                              </span>
                            </th>
                          </>
                        ) : null}
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Area</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Category</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Block</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Row</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Seat</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Source</th>
                        <th scope="col" className="w-[3.5rem] px-4 py-3 text-center font-medium text-zinc-400">New</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Amount</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Contingent</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Seat ID</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Movement ID</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Category ID</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Area ID</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Block ID</th>
                        <th scope="col" className="px-4 py-3 font-medium text-zinc-400">Updated</th>
                        {showSbColumn ? (
                          <th scope="col" className="px-4 py-3 text-right font-medium text-zinc-400">
                            SB listing
                          </th>
                        ) : null}
                        <th scope="col" className="px-4 py-3 pr-5 text-right font-medium text-zinc-400 sm:pr-6">Info</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {rawSorted.map((r) => {
                        const pushKey = `raw|${r.id}`;
                        const bulkSelectable =
                          bulkPushEnabled &&
                          (pushableKeySet.has(pushKey) || deletableKeySet.has(pushKey));
                        const bulkSelected = bulkSelectable && selectedPushKeys.has(pushKey);
                        const omitBlock = pushableKeySet.has(pushKey) && omitBlockKeys.has(pushKey);
                        return (
                        <tr
                          key={r.id}
                          className={`text-zinc-200 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] ${bulkSelected ? "bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]" : ""}`}
                        >
                          {bulkPushEnabled ? (
                            <>
                              <td className="px-2 py-3 text-center align-middle">
                                {bulkSelectable ? (
                                  <input
                                    type="checkbox"
                                    checked={bulkSelected}
                                    disabled={bulkActionRunning}
                                    className="size-4 rounded border-white/20 bg-black/40 accent-[color:var(--ticketing-accent)]"
                                    aria-label={`Select ${r.blockName} row ${r.row} seat ${r.seatNumber} for bulk SB actions`}
                                    onChange={() => handlePushSelectionChange(pushKey, bulkSelected)}
                                  />
                                ) : (
                                  <span className="text-xs text-zinc-700">—</span>
                                )}
                              </td>
                              <td className="px-1 py-3 text-center align-middle">
                                {pushableKeySet.has(pushKey) ? (
                                  <input
                                    type="checkbox"
                                    checked={omitBlock}
                                    disabled={bulkActionRunning}
                                    className="size-4 rounded border-amber-400/30 bg-black/40 accent-amber-400"
                                    title="Omit ticket_block from SB payload"
                                    aria-label={`Omit ticket_block for ${r.blockName} row ${r.row} seat ${r.seatNumber}`}
                                    onChange={() => handleOmitBlockChange(pushKey, omitBlock)}
                                  />
                                ) : (
                                  <span className="text-xs text-zinc-700">—</span>
                                )}
                              </td>
                            </>
                          ) : null}
                          <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.areaName}</td>
                          <td className="px-4 py-3 text-sm text-zinc-200">{r.categoryName}</td>
                          <td className="px-4 py-3 text-sm font-medium text-zinc-50">{r.blockName}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.row}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.seatNumber}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-200">
                            <span
                              className={
                                r.kind === "LAST_MINUTE"
                                  ? "inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200"
                                  : "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-100"
                              }
                            >
                              {r.kind === "LAST_MINUTE" ? "Shop" : "Resale"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center">
                            {isRowNew(r) ? (
                              <span
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] text-[11px] font-black text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)]"
                                title="New in latest diff"
                                aria-label="New in latest diff"
                              >
                                ✓
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold tabular-nums text-[color:var(--ticketing-accent)]">
                            {formatSockUsd(r.amount)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.contingentId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.seatId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.resaleMovementId ?? "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.categoryId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.areaId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">{r.blockId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500" title={r.updatedAt}>
                            {formatAgeFromIso(r.updatedAt)}
                          </td>
                          {showSbColumn && eventId ? (
                            <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                              <SbListingRowActions
                                eventId={eventId}
                                sbEventId={sbEventId}
                                sbConfigured={sbConfigured}
                                seatIds={[r.seatId]}
                                kind={r.kind}
                                blockName={r.blockName}
                                rowLabel={r.row}
                                seatSpan={r.seatNumber}
                                omitTicketBlock={omitBlock}
                                entry={lookupSbEntry([r.seatId], {
                                  blockName: r.blockName,
                                  row: r.row,
                                  seatSpan: r.seatNumber,
                                })}
                                onStatusChange={handleSbStatusChange}
                                onDeleted={handleSbDeleted}
                                onPreviewOpenChange={handlePushPreviewOpenChange}
                              />
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-3 pr-5 text-right sm:pr-6">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-white/[0.10] bg-black/25 p-2 text-zinc-200 shadow-inner shadow-black/35 transition-[border-color,background-color,transform] hover:border-white/[0.16] hover:bg-white/[0.04] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                              aria-label={`Row info: ${r.areaName}, ${r.categoryName}, ${r.blockName}, row ${r.row}, seat ${r.seatNumber}`}
                              onClick={() => setOpenGroup(groupFromSingleRow(r))}
                            >
                              <InfoIcon />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[80rem] border-collapse text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_95%,transparent)] text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                      {bulkPushEnabled ? (
                        <>
                          <th scope="col" className="w-14 px-1 py-3 text-center font-medium text-zinc-400">
                            <div className="flex flex-col items-center gap-1">
                              <input
                                ref={selectAllHeaderRef}
                                type="checkbox"
                                checked={allSelectableSelected}
                                disabled={bulkActionRunning || selectableCount === 0}
                                className="size-4 rounded border-white/20 bg-black/40 accent-[color:var(--ticketing-accent)]"
                                aria-label="Select all pushable and on-SB listings"
                                title={
                                  selectableCount === 0
                                    ? "No selectable listings"
                                    : allSelectableSelected
                                      ? "Clear selection"
                                      : `Select all (${selectableCount})`
                                }
                                onChange={toggleSelectAllSelectable}
                              />
                              <select
                                value={batchSelectSize}
                                onChange={(e) => setBatchSelectSize(Number(e.target.value) as BatchSelectSize)}
                                className={batchSelectClass}
                                title="Number of rows to select per checkbox click"
                                aria-label="Batch select size"
                              >
                                {BATCH_SELECT_SIZES.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </th>
                          <th
                            scope="col"
                            className="w-12 px-1 py-3 text-center font-medium text-zinc-400"
                            title="Omit ticket_block from SB payload"
                          >
                            <span className="sr-only">Omit block</span>
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/80">
                              No blk
                            </span>
                          </th>
                        </>
                      ) : null}
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Area
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Category
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Block
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Row
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Seat span
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Source
                      </th>
                      <th scope="col" className="w-[3.5rem] px-4 py-3 text-center font-medium text-zinc-400">
                        New
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Amount
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium text-zinc-400">
                        Updated
                      </th>
                      {showSbColumn ? (
                        <th scope="col" className="px-4 py-3 text-right font-medium text-zinc-400">
                          SB listing
                        </th>
                      ) : null}
                      <th scope="col" className="px-4 py-3 pr-5 text-right font-medium text-zinc-400 sm:pr-6">
                        Info
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {groupedSorted.map((g) => {
                      const bulkSelectable =
                        bulkPushEnabled && (pushableKeySet.has(g.id) || deletableKeySet.has(g.id));
                      const bulkSelected = bulkSelectable && selectedPushKeys.has(g.id);
                      const omitBlock = pushableKeySet.has(g.id) && omitBlockKeys.has(g.id);
                      return (
                      <tr
                        key={g.id}
                        className={`text-zinc-200 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] ${bulkSelected ? "bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)]" : ""}`}
                      >
                        {bulkPushEnabled ? (
                          <>
                            <td className="px-2 py-3 text-center align-middle">
                              {bulkSelectable ? (
                                <input
                                  type="checkbox"
                                  checked={bulkSelected}
                                  disabled={bulkActionRunning}
                                  className="size-4 rounded border-white/20 bg-black/40 accent-[color:var(--ticketing-accent)]"
                                  aria-label={`Select ${g.blockName} row ${g.row} seats ${g.seatSpan} for bulk SB actions`}
                                  onChange={() => handlePushSelectionChange(g.id, bulkSelected)}
                                />
                              ) : (
                                <span className="text-xs text-zinc-700">—</span>
                              )}
                            </td>
                            <td className="px-1 py-3 text-center align-middle">
                              {pushableKeySet.has(g.id) ? (
                                <input
                                  type="checkbox"
                                  checked={omitBlock}
                                  disabled={bulkActionRunning}
                                  className="size-4 rounded border-amber-400/30 bg-black/40 accent-amber-400"
                                  title="Omit ticket_block from SB payload"
                                  aria-label={`Omit ticket_block for ${g.blockName} row ${g.row} seats ${g.seatSpan}`}
                                  onChange={() => handleOmitBlockChange(g.id, omitBlock)}
                                />
                              ) : (
                                <span className="text-xs text-zinc-700">—</span>
                              )}
                            </td>
                          </>
                        ) : null}
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{g.areaName}</td>
                        <td className="px-4 py-3 text-sm text-zinc-200">{g.categoryName}</td>
                        <td className="px-4 py-3 text-sm font-medium text-zinc-50">{g.blockName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          {g.row}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                          <span>{g.seatSpan}</span>
                          {g.togetherCount > 1 ? (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/[0.10] bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                              {g.togetherCount} together
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-200">
                          <span
                            className={
                              g.kind === "LAST_MINUTE"
                                ? "inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200"
                                : "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-100"
                            }
                          >
                            {g.kind === "LAST_MINUTE" ? "Shop" : "Resale"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          {g.seats.some(isRowNew) ? (
                            <span
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] text-[11px] font-black text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)]"
                              title="New in latest diff"
                              aria-label="New in latest diff"
                            >
                              ✓
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold tabular-nums text-[color:var(--ticketing-accent)]">
                          {formatSockUsd(g.amount)}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-500"
                          title={Number.isFinite(g.updatedAtMaxMs) ? new Date(g.updatedAtMaxMs).toISOString() : undefined}
                        >
                          {Number.isFinite(g.updatedAtMaxMs) ? formatAgeFromMs(g.updatedAtMaxMs) : "—"}
                        </td>
                        {showSbColumn && eventId ? (
                          <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                            <SbListingRowActions
                              eventId={eventId}
                              sbEventId={sbEventId}
                              sbConfigured={sbConfigured}
                              seatIds={g.seats.map((s) => s.seatId)}
                              kind={g.kind}
                              blockName={g.blockName}
                              rowLabel={g.row}
                              seatSpan={g.seatSpan}
                              omitTicketBlock={omitBlock}
                              entry={lookupSbEntry(g.seats.map((s) => s.seatId), {
                                blockName: g.blockName,
                                row: g.row,
                                seatSpan: g.seatSpan,
                              })}
                              onStatusChange={handleSbStatusChange}
                              onDeleted={handleSbDeleted}
                              onPreviewOpenChange={handlePushPreviewOpenChange}
                            />
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap px-4 py-3 pr-5 text-right sm:pr-6">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-white/[0.10] bg-black/25 p-2 text-zinc-200 shadow-inner shadow-black/35 transition-[border-color,background-color,transform] hover:border-white/[0.16] hover:bg-white/[0.04] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                            aria-label={`Row info: ${g.areaName}, ${g.categoryName}, ${g.blockName}, row ${g.row}, seat ${g.seatSpan}`}
                            onClick={() => setOpenGroup(g)}
                          >
                            <InfoIcon />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {bulkPushEnabled ? (
        <SbBulkPushBar
          selectedCount={selectedBulkCount}
          pushableCount={pushableItems.length}
          selectedPushCount={selectedPushCount}
          deletableCount={deletableItems.length}
          selectedDeletableCount={selectedDeletableCount}
          omitBlockSelectedCount={omitBlockSelectedCount}
          batchSelectSize={batchSelectSize}
          batchSelectSizes={BATCH_SELECT_SIZES}
          onBatchSelectSizeChange={(size) => setBatchSelectSize(size as BatchSelectSize)}
          pushQueue={bulkPushQueue}
          deleteQueue={bulkDeleteQueue}
          sbConfigured={sbConfigured}
          hasSbEventId={Boolean(sbEventId)}
          onSelectAllPushable={selectAllPushable}
          pushableSelectCount={pushableSelectCount}
          onPushableSelectCountChange={setPushableSelectCount}
          onSelectNPushable={selectFirstNPushable}
          bulkSelectCategoryNums={bulkSelectCategoryNums}
          onBulkSelectCategoryToggle={toggleBulkSelectCategoryNum}
          onSelectNPushableByCategory={selectPushableByCategories}
          onSelectAllDeletable={selectAllDeletable}
          onClear={clearPushSelection}
          onPush={() => void runBulkPushQueue()}
          onDelete={() => void runBulkDeleteQueue()}
          onCancelPush={() => void cancelBulkPushQueue()}
          onCancelDelete={() => void cancelBulkDeleteQueue()}
          ticketTypeId={bulkPushTicketTypeId}
          onTicketTypeChange={(typeId) => void saveBulkPushTicketType(typeId)}
          hidden={pushPreviewOpenCount > 0}
        />
      ) : null}

      {categoryPickerOpen ? (
        <ModalPortal
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget) setCategoryPickerOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add category filters"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.08] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Categories
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-tight text-white">Add category filters</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Plain Category 1–4 names update those toggles. Front, wheelchair, and other variants
                    are added as custom filters.
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  onClick={() => setCategoryPickerOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
              {categoryOptions.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">No categories in loaded rows.</p>
              ) : (
                <ul className="space-y-1">
                  {categoryOptions.map((name) => {
                    const active = isCategoryFilterActive(name);
                    const categoryNum = resolvePlainSbCategoryNum(
                      name,
                      rows.find((r) => norm(r.categoryName) === name)?.categoryId,
                    );
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => toggleCategoryInFilter(name)}
                          className={
                            active
                              ? "flex w-full min-h-10 items-center justify-between gap-2 rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-3 py-2 text-left text-sm font-medium text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_24%,transparent)] outline-none transition-colors hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)]"
                              : "flex w-full min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 outline-none transition-colors hover:bg-white/[0.04] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)]"
                          }
                          aria-pressed={active}
                        >
                          <span className="min-w-0 truncate">{name}</span>
                          <span className="shrink-0 text-[11px] text-zinc-500">
                            {categoryNum != null ? `Cat ${categoryNum}` : "Custom"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {openGroup ? (
        <ModalPortal
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenGroup(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sock available row details"
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.10] bg-[color:var(--ticketing-surface-elevated)] shadow-[0_28px_80px_-26px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.08] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    sock_available
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold tracking-tight text-white">
                    {openGroup.areaName} · {openGroup.categoryName} · {openGroup.blockName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Row <span className="font-mono text-zinc-300">{openGroup.row}</span> · Seat{" "}
                    <span className="font-mono text-zinc-300">{openGroup.seatSpan}</span>{" "}
                    {openGroup.togetherCount > 1 ? (
                      <>
                        <span className="text-zinc-700">·</span>{" "}
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                          {openGroup.togetherCount} together
                        </span>{" "}
                      </>
                    ) : (
                      <span className="text-zinc-700">·</span>
                    )}{" "}
                    <span className="font-mono text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]">
                      {formatSockUsd(openGroup.amount)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Kind{" "}
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                      {openGroup.kind === "LAST_MINUTE" ? "LAST_MINUTE" : "RESALE"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/[0.10] bg-black/30 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_30%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]"
                  onClick={() => setOpenGroup(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              {openGroup.togetherCount > 1 ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Grouped seats</p>
                  <div className="mt-2 space-y-1">
                    {openGroup.seats.map((s) => (
                      <p key={s.id} className="font-mono text-[11px] text-zinc-200">
                        Seat <span className="text-zinc-50">{s.seatNumber}</span> · seatId{" "}
                        <span className="text-zinc-300">{s.seatId}</span> · movement{" "}
                        <span className="text-zinc-300">{s.resaleMovementId ?? "—"}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Contingent ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.contingentId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Seat ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.seatId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Resale movement
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.resaleMovementId ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Category ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.categoryId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Area ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.areaId}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Block ID
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-200">{openGroup.seats[0]?.blockId}</p>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500">
                Updated{" "}
                <span className="font-mono text-zinc-300" title={openGroup.seats[0]?.updatedAt}>
                  {formatAgeFromIso(openGroup.seats[0]?.updatedAt ?? "")}
                </span>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}

