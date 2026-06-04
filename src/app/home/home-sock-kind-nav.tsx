"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { HomeSockKind } from "@/app/home/HomePage";

type NavContextValue = {
  isSwitching: boolean;
  switchingTo: HomeSockKind | null;
  navigateToKind: (kind: HomeSockKind, href: string) => void;
};

const HomeSockKindNavContext = createContext<NavContextValue | null>(null);

function useHomeSockKindNav(): NavContextValue {
  const ctx = useContext(HomeSockKindNavContext);
  if (!ctx) {
    throw new Error("HomeSockKindNav components must be used within HomeSockKindNavProvider");
  }
  return ctx;
}

export function HomeSockKindNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<HomeSockKind | null>(null);

  useEffect(() => {
    setSwitchingTo(null);
  }, [pathname]);

  const navigateToKind = useCallback(
    (kind: HomeSockKind, href: string) => {
      setSwitchingTo(kind);
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({
      isSwitching: isPending || switchingTo !== null,
      switchingTo,
      navigateToKind,
    }),
    [isPending, switchingTo, navigateToKind],
  );

  return <HomeSockKindNavContext.Provider value={value}>{children}</HomeSockKindNavContext.Provider>;
}

const kindMeta: Record<HomeSockKind, { label: string }> = {
  LAST_MINUTE: { label: "Last Minute Sales" },
  RESALE: { label: "Resale Marketplace" },
};

function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

export function HomeSockKindSwitcher({
  activeKind,
  lastMinuteHref,
  resaleHref,
}: {
  activeKind: HomeSockKind;
  lastMinuteHref: string;
  resaleHref: string;
}) {
  const { isSwitching, switchingTo, navigateToKind } = useHomeSockKindNav();

  const tabClass = (kind: HomeSockKind, isActive: boolean) => {
    const pending = isSwitching && switchingTo === kind;
    const base =
      "relative inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-all sm:min-h-11 sm:flex-none sm:px-6";
    if (pending) {
      return `${base} border border-white/20 bg-white/[0.08] text-zinc-100`;
    }
    if (isActive) {
      return kind === "RESALE"
        ? `${base} border border-sky-400/40 bg-sky-500/25 text-sky-50 shadow-sm shadow-black/30`
        : `${base} border border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] bg-[color:var(--ticketing-accent)] text-zinc-950 shadow-sm shadow-black/35`;
    }
    return `${base} border border-transparent text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100`;
  };

  return (
    <div
      className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
      role="group"
      aria-label="Ticket source"
    >
      <div className="inline-flex w-full rounded-full border border-white/[0.12] bg-black/30 p-1 shadow-inner shadow-black/40 ring-1 ring-white/[0.05] sm:w-auto">
        <button
          type="button"
          className={tabClass("RESALE", activeKind === "RESALE")}
          aria-pressed={activeKind === "RESALE"}
          disabled={isSwitching && switchingTo === "RESALE"}
          onClick={() => {
            if (activeKind !== "RESALE") navigateToKind("RESALE", resaleHref);
          }}
        >
          {isSwitching && switchingTo === "RESALE" ? <Spinner /> : null}
          <span>Resale Marketplace</span>
        </button>
        <button
          type="button"
          className={tabClass("LAST_MINUTE", activeKind === "LAST_MINUTE")}
          aria-pressed={activeKind === "LAST_MINUTE"}
          disabled={isSwitching && switchingTo === "LAST_MINUTE"}
          onClick={() => {
            if (activeKind !== "LAST_MINUTE") navigateToKind("LAST_MINUTE", lastMinuteHref);
          }}
        >
          {isSwitching && switchingTo === "LAST_MINUTE" ? <Spinner /> : null}
          <span>Last Minute Sales</span>
        </button>
      </div>
      {isSwitching && switchingTo ? (
        <p className="text-xs text-zinc-400 sm:whitespace-nowrap">
          Switching to {kindMeta[switchingTo].label}…
        </p>
      ) : null}
    </div>
  );
}

export function HomeSockKindLoadingOverlay({ children }: { children: ReactNode }) {
  const { isSwitching, switchingTo } = useHomeSockKindNav();

  return (
    <div className="relative min-h-[12rem]">
      {children}
      {isSwitching ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-[color:color-mix(in_oklab,var(--ticketing-surface)_82%,transparent)] backdrop-blur-[2px]"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.1] bg-zinc-900/90 px-8 py-6 shadow-xl shadow-black/50 ring-1 ring-white/[0.06]">
            <Spinner className="h-8 w-8 text-[color:var(--ticketing-accent)]" />
            <p className="text-sm font-medium text-zinc-200">
              {switchingTo ? `Loading ${kindMeta[switchingTo].label}…` : "Loading events…"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
