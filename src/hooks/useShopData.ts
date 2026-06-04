"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShopLatestPayload, ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { mergeShopEvents, shopLog } from "@/lib/shop-service";

const POLL_MS = 10_000;

type ShopDataState = {
  events: ShopMarketEvent[];
  scannedAt: string | null;
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  lastPollAt: number | null;
};

export function useShopData() {
  const [state, setState] = useState<ShopDataState>({
    events: [],
    scannedAt: null,
    fetchedAt: null,
    loading: true,
    error: null,
    isLive: false,
    lastPollAt: null,
  });

  const eventsRef = useRef<ShopMarketEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(0);

  const captureScroll = useCallback(() => {
    if (scrollRootRef.current) {
      scrollTopRef.current = scrollRootRef.current.scrollTop;
    }
  }, []);

  const restoreScroll = useCallback(() => {
    const el = scrollRootRef.current;
    if (el) {
      el.scrollTop = scrollTopRef.current;
    }
  }, []);

  const applyPayload = useCallback((payload: ShopLatestPayload, isInitial: boolean) => {
    const { events, changedMatchNums } = mergeShopEvents(eventsRef.current, payload.events);
    eventsRef.current = events;

    if (!isInitial && changedMatchNums.size === 0) {
      setState((s) => ({
        ...s,
        scannedAt: payload.scannedAt,
        fetchedAt: payload.fetchedAt,
        isLive: true,
        lastPollAt: Date.now(),
        loading: false,
        error: null,
      }));
      shopLog("Poll refresh (no UI changes)");
      return;
    }

    shopLog(isInitial ? "UI updated (initial)" : `UI updated (${changedMatchNums.size} events changed)`);

    setState({
      events,
      scannedAt: payload.scannedAt,
      fetchedAt: payload.fetchedAt,
      loading: false,
      error: null,
      isLive: true,
      lastPollAt: Date.now(),
    });

    requestAnimationFrame(() => {
      restoreScroll();
    });
  }, [restoreScroll]);

  const fetchLatest = useCallback(async (isInitial: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (!isInitial) {
      captureScroll();
      shopLog("Poll refresh");
    }

    try {
      const res = await fetch("/api/shop/latest", {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as ShopLatestPayload;
      applyPayload(payload, isInitial);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      const message = e instanceof Error ? e.message : String(e);
      setState((s) => ({
        ...s,
        loading: false,
        error: message,
        isLive: false,
      }));
    }
  }, [applyPayload, captureScroll]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    void fetchLatest(true);
  }, [fetchLatest]);

  useEffect(() => {
    void fetchLatest(true);
    const id = window.setInterval(() => {
      void fetchLatest(false);
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetchLatest]);

  const stats = useMemo(() => {
    const available = state.events.reduce((n, e) => n + e.availableCount, 0);
    return {
      eventCount: state.events.length,
      availableListings: available,
    };
  }, [state.events]);

  return {
    ...state,
    stats,
    retry,
    scrollRootRef,
    pollIntervalMs: POLL_MS,
  };
}
