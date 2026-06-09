"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VirtualRange = { start: number; end: number };

export function useVirtualWindow(itemCount: number, rowHeight: number, overscan = 12) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<VirtualRange>({ start: 0, end: Math.min(itemCount, 50) });

  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (itemCount <= 0) {
      setRange({ start: 0, end: 0 });
      return;
    }
    const scrollTop = el.scrollTop;
    const height = el.clientHeight || 600;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(height / rowHeight) + overscan * 2;
    const end = Math.min(itemCount, start + visible);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [itemCount, rowHeight, overscan]);

  useEffect(() => {
    update();
  }, [itemCount, update]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const paddingTop = range.start * rowHeight;
  const paddingBottom = Math.max(0, (itemCount - range.end) * rowHeight);

  return { containerRef, range, paddingTop, paddingBottom };
}
