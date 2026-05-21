"use client";

import { clearMarkupPercentAction, saveMarkupPercentAction } from "@/app/actions/markup";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type MarkupContextValue = {
  markupPercent: number;
  setMarkupPercent: (value: number) => void;
  clearMarkup: () => void;
};

const MarkupContext = createContext<MarkupContextValue | null>(null);

function normalizeMarkupPercent(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function MarkupProvider({
  children,
  initialMarkupPercent = 0,
}: {
  children: React.ReactNode;
  initialMarkupPercent?: number;
}) {
  const [markupPercent, setMarkupPercentState] = useState(() =>
    normalizeMarkupPercent(initialMarkupPercent),
  );

  const setMarkupPercent = useCallback((value: number) => {
    const n = normalizeMarkupPercent(value);
    setMarkupPercentState(n);
    void saveMarkupPercentAction(n);
  }, []);

  const clearMarkup = useCallback(() => {
    setMarkupPercentState(0);
    void clearMarkupPercentAction();
  }, []);

  const value = useMemo(
    () => ({ markupPercent, setMarkupPercent, clearMarkup }),
    [markupPercent, setMarkupPercent, clearMarkup],
  );

  return <MarkupContext.Provider value={value}>{children}</MarkupContext.Provider>;
}

export function useMarkup(): MarkupContextValue {
  const ctx = useContext(MarkupContext);
  if (!ctx) {
    throw new Error("useMarkup must be used within MarkupProvider");
  }
  return ctx;
}
