"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type ExtensionStatusMessage = {
  type: "status";
  running: boolean;
  main: string;
  sub?: string;
  isError?: boolean;
  at: number;
};

type ClientInfo = {
  id: string;
  remoteAddress: string | null;
  connectedAt: number;
  authed: boolean;
  lastStatus: ExtensionStatusMessage | null;
};

type BoxofficeStatusResponse =
  | {
      ok: true;
      connectedClients: number;
      authedClients: number;
      statuses: ClientInfo[];
    }
  | { ok: false; error: string; detail?: string };

type BroadcastResponse =
  | { ok: true; sent: number; connectedClients: number }
  | { ok: false; error: string };

export function BoxofficeControlsClient({ port }: { port: string }) {
  const [status, setStatus] = useState<BoxofficeStatusResponse | null>(null);
  const [lastBroadcast, setLastBroadcast] = useState<BroadcastResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const wsUrl = useMemo(() => `ws://127.0.0.1:${port}/ws`, [port]);

  const refresh = async () => {
    try {
      const res = await fetch("/api/boxoffice/status", { cache: "no-store" });
      const data = (await res.json()) as unknown as BoxofficeStatusResponse;
      setStatus(data);
      setLastError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus(null);
      setLastError(message.slice(0, 400));
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const broadcast = (action: "start" | "stop") => {
    startTransition(async () => {
      setLastError(null);
      try {
        const res = await fetch("/api/boxoffice/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as unknown as BroadcastResponse;
        setLastBroadcast(data);
        void refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLastBroadcast(null);
        setLastError(message.slice(0, 400));
      }
    });
  };

  const clients =
    status && "ok" in status && status.ok && Array.isArray(status.statuses) ? status.statuses : [];

  const latest = useMemo(() => {
    const items = clients
      .map((c) => ({
        id: c.id,
        authed: c.authed,
        remoteAddress: c.remoteAddress,
        lastStatus: c.lastStatus,
      }))
      .filter((x) => Boolean(x.lastStatus))
      .sort((a, b) => (b.lastStatus?.at ?? 0) - (a.lastStatus?.at ?? 0));
    return items;
  }, [clients]);

  const connectedClients =
    status && "ok" in status && status.ok ? status.connectedClients : clients.length;
  const authedClients = status && "ok" in status && status.ok ? status.authedClients : 0;

  return (
    <section
      className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/[0.10] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] p-3 text-xs shadow-sm shadow-black/30 ring-1 ring-white/[0.04] backdrop-blur-md"
      aria-label="BoxOffice extension controls"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            BoxOffice WS
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-zinc-200" title={wsUrl}>
            {wsUrl}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => broadcast("start")}
            disabled={isPending}
            className="rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 ring-1 ring-white/10 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => broadcast("stop")}
            disabled={isPending}
            className="rounded-md bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 ring-1 ring-white/10 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
        <span>
          Clients: <span className="font-semibold text-zinc-200">{connectedClients}</span>
          {authedClients ? (
            <>
              {" "}
              / authed <span className="font-semibold text-zinc-200">{authedClients}</span>
            </>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isPending}
          className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {lastError ? (
        <p className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-100">
          {lastError}
        </p>
      ) : null}

      {lastBroadcast ? (
        <p className="mt-2 rounded-lg border border-white/[0.10] bg-black/25 px-2.5 py-2 text-[11px] text-zinc-300">
          {"ok" in lastBroadcast && lastBroadcast.ok
            ? `Broadcast sent to ${lastBroadcast.sent} client(s)`
            : "error" in lastBroadcast
              ? lastBroadcast.error
              : "Broadcast response unavailable"}
        </p>
      ) : null}

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Latest extension status
        </p>
        {latest.length === 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            No status messages yet. Connect the extension and wait for it to post a{" "}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-zinc-300">
              {"{type:\"status\"}"}
            </code>{" "}
            message.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {latest.slice(0, 6).map((c) => {
              const s = c.lastStatus;
              if (!s) return null;
              const at = new Date(s.at);
              const time = Number.isFinite(s.at) ? at.toLocaleTimeString() : "—";
              const tone = s.isError ? "text-rose-200" : s.running ? "text-emerald-200" : "text-zinc-200";
              return (
                <li key={c.id} className="rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="font-mono text-[10px] font-semibold text-zinc-400">
                      {c.id}
                      {c.authed ? "" : " (unauth)"}
                      {c.remoteAddress ? ` · ${c.remoteAddress}` : ""}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">{time}</span>
                  </div>
                  <p className={`mt-1 text-[11px] font-medium ${tone}`}>
                    {s.main}
                    {s.sub ? <span className="text-zinc-400">{` — ${s.sub}`}</span> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

