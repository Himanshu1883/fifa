"use client";

import { useEffect, useSyncExternalStore } from "react";

let overlayCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function reportEventOverlayOpen(open: boolean) {
  overlayCount = open ? overlayCount + 1 : Math.max(0, overlayCount - 1);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return overlayCount;
}

export function useEventOverlayOpen(): boolean {
  const count = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return count > 0;
}

export function useReportEventOverlay(open: boolean) {
  useEffect(() => {
    if (!open) return;
    reportEventOverlayOpen(true);
    return () => reportEventOverlayOpen(false);
  }, [open]);
}
