"use client";

import { useEffect, useSyncExternalStore } from "react";

type LabelOnlyBatchResponse = {
  ok?: boolean;
  labels?: Record<string, string>;
};

type LabelOnlySingleResponse = {
  ok?: boolean;
  matchLabel?: string;
};

const labelCache = new Map<string, string | null>();
const listeners = new Set<() => void>();

let batchTimer: ReturnType<typeof setTimeout> | null = null;
const batchPending = new Set<string>();
let batchInFlight: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCachedLabel(matchId: string): string | null | undefined {
  if (!labelCache.has(matchId)) return undefined;
  return labelCache.get(matchId) ?? null;
}

function setCachedLabel(matchId: string, label: string | null) {
  labelCache.set(matchId, label);
  emit();
}

/** Seed client cache from server-resolved labels (e.g. home page SSR). */
export function hydrateSbMatchLabels(labels: Record<string, string | null | undefined>) {
  let changed = false;
  for (const [matchId, label] of Object.entries(labels)) {
    const id = matchId.trim();
    if (!id || labelCache.has(id)) continue;
    labelCache.set(id, label?.trim() || null);
    changed = true;
  }
  if (changed) emit();
}

function scheduleBatchFetch() {
  if (batchTimer != null) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    void flushBatchFetch();
  }, 0);
}

async function flushBatchFetch() {
  if (batchInFlight) {
    await batchInFlight;
    if (batchPending.size > 0) return flushBatchFetch();
    return;
  }

  const ids = [...batchPending].filter((id) => !labelCache.has(id));
  batchPending.clear();
  if (ids.length === 0) return;

  batchInFlight = (async () => {
    try {
      const params = new URLSearchParams({
        matchIds: ids.join(","),
        labelOnly: "1",
      });
      const res = await fetch(`/api/seatsbrokers/events?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as LabelOnlyBatchResponse;
      const labels = data.labels ?? {};
      for (const id of ids) {
        const label = labels[id]?.trim() || null;
        labelCache.set(id, label);
      }
    } catch {
      for (const id of ids) {
        if (!labelCache.has(id)) labelCache.set(id, null);
      }
    } finally {
      emit();
    }
  })().finally(() => {
    batchInFlight = null;
  });

  await batchInFlight;
}

function requestLabel(matchId: string) {
  if (labelCache.has(matchId)) return;
  batchPending.add(matchId);
  scheduleBatchFetch();
}

export function formatMappedSbLabel(
  sbEventId: string,
  matchLabel: string | null | undefined,
  eventName?: string | null,
): string {
  const id = sbEventId.trim();
  const name = matchLabel?.trim() || eventName?.trim();
  return name ? `${name} · SB ${id}` : `SB ${id}`;
}

export function useSbMatchLabel(
  sbEventId: string | null | undefined,
  opts?: { initialLabel?: string | null; enabled?: boolean },
): string | null {
  const trimmed = (sbEventId ?? "").trim();
  const enabled = opts?.enabled !== false;
  const hasInitial = opts?.initialLabel !== undefined;

  useEffect(() => {
    if (!trimmed || !hasInitial || labelCache.has(trimmed)) return;
    labelCache.set(trimmed, opts?.initialLabel?.trim() || null);
    emit();
  }, [trimmed, hasInitial, opts?.initialLabel]);

  useEffect(() => {
    if (!enabled || !trimmed || labelCache.has(trimmed)) return;
    requestLabel(trimmed);
  }, [enabled, trimmed]);

  const cached = useSyncExternalStore(
    subscribe,
    () => (trimmed ? getCachedLabel(trimmed) : undefined),
    () => (trimmed ? (hasInitial ? opts?.initialLabel?.trim() || null : undefined) : undefined),
  );

  if (hasInitial) return opts?.initialLabel?.trim() || null;
  return cached ?? null;
}

/** Optional: prefetch a set of ids in one batch (e.g. on route mount). */
export function prefetchSbMatchLabels(matchIds: Iterable<string>) {
  for (const raw of matchIds) {
    const id = raw.trim();
    if (!id || labelCache.has(id)) continue;
    batchPending.add(id);
  }
  if (batchPending.size > 0) scheduleBatchFetch();
}
