"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UndetectableEnvelope<T> =
  | { code: 0; status: "success"; data: T }
  | { code: 1; status: "error"; data: { error: string } };

type UndetectableProfileSummary = {
  name: string;
  status: string;
  debug_port: string;
  websocket_link: string;
  folder?: string;
  tags?: string[];
};

type UndetectableProfilesListData = Record<string, UndetectableProfileSummary>;

type ProfileRow = { id: string } & UndetectableProfileSummary;

function isEnvelope<T>(value: unknown): value is UndetectableEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const v = value as { code?: unknown; status?: unknown; data?: unknown };
  return (
    (v.code === 0 || v.code === 1) &&
    (v.status === "success" || v.status === "error") &&
    "data" in v
  );
}

function isRunning(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "started" || s === "running";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchProfilesList(): Promise<ProfileRow[]> {
  const res = await fetch("/api/undetectable/profiles", { method: "GET", cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error?: unknown }).error ?? "Request failed")
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (!isEnvelope<UndetectableProfilesListData>(json)) {
    throw new Error("Unexpected response shape from /api/undetectable/profiles");
  }
  if (json.code === 1) {
    throw new Error(json.data.error || "Undetectable API returned an error");
  }

  const items: ProfileRow[] = Object.entries(json.data ?? {}).map(([id, p]) => ({
    id,
    ...p,
  }));
  items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  return items;
}

export function UndetectableProfilesClient() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyById, setBusyById] = useState<Record<string, "starting" | "stopping" | undefined>>(
    {},
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchProfilesList();
        if (cancelled) return;
        setRows(items);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setErr(message);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      void (async () => {
        try {
          const items = await fetchProfilesList();
          setRows(items);
          setErr(null);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          setErr(message);
        }
      })();
    }, 4000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const items = await fetchProfilesList();
      setRows(items);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    }
  }, []);

  async function startProfile(id: string) {
    setBusyById((m) => ({ ...m, [id]: "starting" }));
    setErr(null);
    try {
      const res = await fetch(`/api/undetectable/profiles/${encodeURIComponent(id)}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json = await readJson(res);
      if (!res.ok) {
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error?: unknown }).error ?? "Request failed")
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      if (!isEnvelope<UndetectableProfileSummary>(json)) {
        throw new Error("Unexpected response shape from start endpoint");
      }
      if (json.code === 1) {
        throw new Error(json.data.error || "Undetectable API returned an error");
      }

      const data = json.data;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                debug_port: data.debug_port ?? r.debug_port,
                websocket_link: data.websocket_link ?? r.websocket_link,
                status: "Started",
              }
            : r,
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    } finally {
      setBusyById((m) => ({ ...m, [id]: undefined }));
      void refresh();
    }
  }

  async function stopProfile(id: string) {
    setBusyById((m) => ({ ...m, [id]: "stopping" }));
    setErr(null);
    try {
      const res = await fetch(`/api/undetectable/profiles/${encodeURIComponent(id)}/stop`, {
        method: "POST",
      });
      const json = await readJson(res);
      if (!res.ok) {
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error?: unknown }).error ?? "Request failed")
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      // stop endpoint returns an envelope, but we don't need its payload; refetch below.
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    } finally {
      setBusyById((m) => ({ ...m, [id]: undefined }));
      void refresh();
    }
  }

  async function copyWebsocket(id: string, url: string) {
    setErr(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(`Copy failed: ${message}`);
    }
  }

  const runningCount = useMemo(() => rows.filter((r) => isRunning(r.status)).length, [rows]);

  const buttonBase =
    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Profiles
          </p>
          <p className="text-xs leading-relaxed text-zinc-500">
            Running{" "}
            <span className="font-semibold tabular-nums text-zinc-200">
              {runningCount}
            </span>{" "}
            /{" "}
            <span className="font-semibold tabular-nums text-zinc-200">
              {rows.length}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${buttonBase} bg-white/[0.08] text-zinc-200 hover:bg-white/[0.12]`}
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className={`${buttonBase} ${
              autoRefresh
                ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
                : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.10]"
            }`}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            Auto-refresh: {autoRefresh ? "On" : "Off"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_55%,transparent)] ring-1 ring-white/[0.04]">
        <div className="border-b border-white/[0.06] px-4 py-3 text-sm text-zinc-300 sm:px-5">
          WebSocket URL pattern:{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
            ws://127.0.0.1:&lt;debug_port&gt;/devtools/browser/&lt;id&gt;
          </code>
        </div>

        {err ? (
          <div className="border-b border-white/[0.06] px-4 py-3 text-sm text-red-200 sm:px-5">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5">
            Loading profiles…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500 sm:px-5">
            No profiles returned by Undetectable.
          </div>
        ) : (
          <ul className="m-0 divide-y divide-white/[0.06] p-0">
            {rows.map((p) => {
              const running = isRunning(p.status);
              const busy = busyById[p.id];
              const canCopy = Boolean(p.websocket_link?.trim());
              const badgeClass = running
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-zinc-400/20 bg-white/[0.03] text-zinc-300";

              return (
                <li key={p.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold tracking-tight text-white">
                          {p.name || p.id}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClass}`}
                        >
                          {p.status || "—"}
                        </span>
                        <code className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                          {p.id}
                        </code>
                      </div>

                      <dl className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                            debug_port
                          </dt>
                          <dd className="font-mono text-[11px] text-zinc-200">
                            {p.debug_port?.trim() ? p.debug_port : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-2 sm:col-span-2">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                            websocket_link
                          </dt>
                          <dd className="min-w-0 font-mono text-[11px] text-zinc-200">
                            <span className="break-all">
                              {p.websocket_link?.trim() ? p.websocket_link : "—"}
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        className={`${buttonBase} bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20`}
                        onClick={() => startProfile(p.id)}
                        disabled={busy != null}
                        title="Starts the profile and returns websocket_link"
                      >
                        {busy === "starting" ? "Starting…" : "Start"}
                      </button>
                      <button
                        type="button"
                        className={`${buttonBase} bg-white/[0.06] text-zinc-200 hover:bg-white/[0.10]`}
                        onClick={() => stopProfile(p.id)}
                        disabled={busy != null || !running}
                      >
                        {busy === "stopping" ? "Stopping…" : "Stop"}
                      </button>
                      <button
                        type="button"
                        className={`${buttonBase} bg-sky-500/15 text-sky-200 hover:bg-sky-500/20`}
                        onClick={() => copyWebsocket(p.id, p.websocket_link)}
                        disabled={!canCopy}
                        title="Copy websocket_link for your extension"
                      >
                        {copiedId === p.id ? "Copied" : "Copy websocket URL"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

