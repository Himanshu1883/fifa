"use client";

import { useEffect, useRef } from "react";

const AUTO_PUSH_INTERVAL_MS = 3_000;

/**
 * While global auto-push is enabled, runs the same deduped push as manual every 3s
 * for all events that have been manually pushed at least once.
 */
export function SbAutoPushPoller() {
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await fetch("/api/seatsbrokers/auto-push/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
      } catch {
        /* next tick retries */
      } finally {
        inFlightRef.current = false;
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), AUTO_PUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
