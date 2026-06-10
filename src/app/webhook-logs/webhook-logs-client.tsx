"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type Kind = "RESALE" | "LAST_MINUTE";

type WebhookLogRow = {
  id: number;
  createdAt: string;
  eventId: number;
  matchLabel: string;
  eventName: string;
  kind: Kind;
  prefId: string;
  newCount: number;
  changedCount: number;
  priceChangedCount: number;
  newSeatIds: unknown;
  sample: unknown;
  notifyAttempted: boolean | null;
  notifyOk: boolean | null;
  notifyProvider: string | null;
  notifyStatus: string | null;
  notifyError: string | null;
  notifyRaw: unknown;
};

type WebhookSettings = {
  discordNewListingsWebhookUrlMasked: string | null;
  discordNewListingsWebhookSource: "db" | "env" | null;
  discordNewListingsWebhookConfigured: boolean;
  updatedAt: string | null;
};

type InboundWebhook = {
  id: string;
  label: string;
  path: string;
  description: string;
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/35 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function notifyPill(ok: boolean | null, attempted: boolean | null): string {
  if (!attempted) {
    return "inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-500";
  }
  if (ok) {
    return "inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200";
  }
  return "inline-flex items-center rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200";
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  const text = useMemo(() => {
    if (value == null) return "—";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <pre className="max-h-80 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

export function WebhookLogsClient() {
  const [settings, setSettings] = useState<WebhookSettings | null>(null);
  const [inboundWebhooks, setInboundWebhooks] = useState<InboundWebhook[]>([]);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);

  const [rows, setRows] = useState<WebhookLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [notifyOnly, setNotifyOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const limit = 50;

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-settings", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: WebhookSettings;
        inboundWebhooks?: InboundWebhook[];
        error?: string;
        warning?: string;
      };
      if (!res.ok || !json.ok || !json.settings) {
        setSettingsError(json.error ?? `Settings load failed (${res.status})`);
        return;
      }
      setSettings(json.settings);
      setInboundWebhooks(json.inboundWebhooks ?? []);
      if (json.warning) setSettingsError(json.warning);
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (notifyOnly) params.set("notifyOnly", "1");
      const res = await fetch(`/api/webhook-logs?${params}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        rows?: WebhookLogRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setLogsError(json.error ?? `Logs load failed (${res.status})`);
        return;
      }
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  }, [offset, notifyOnly]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const saveWebhook = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordNewListingsWebhookUrl: webhookDraft.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: WebhookSettings;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.settings) {
        setSettingsError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      setSettings(json.settings);
      setWebhookDraft("");
      setSettingsSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsSaving(false);
    }
  };

  const clearWebhook = async () => {
    setWebhookDraft("");
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordNewListingsWebhookUrl: null }),
      });
      const json = (await res.json()) as { ok?: boolean; settings?: WebhookSettings; error?: string };
      if (!res.ok || !json.ok || !json.settings) {
        setSettingsError(json.error ?? `Clear failed (${res.status})`);
        return;
      }
      setSettings(json.settings);
      setSettingsSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsSaving(false);
    }
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
        <h2 className="text-sm font-semibold text-zinc-100">Webhook configuration</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Outbound Discord alerts fire when a scrape diff finds{" "}
          <span className="font-semibold text-zinc-300">completely new</span> listings (same ✓ New marker on event
          pages). Inbound paths receive inventory scrapes.
        </p>

        {settingsLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading settings…</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Outbound · Discord</p>
              <p className="mt-2 text-sm text-zinc-300">
                {settings?.discordNewListingsWebhookConfigured ? (
                  <>
                    <span className="font-mono text-xs text-zinc-200">
                      {settings.discordNewListingsWebhookUrlMasked}
                    </span>
                    <span className="ml-2 text-[11px] text-zinc-500">
                      ({settings.discordNewListingsWebhookSource === "env" ? "from env" : "saved in DB"})
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-500">Not configured</span>
                )}
              </p>
              {settings?.updatedAt ? (
                <p className="mt-1 text-[11px] text-zinc-600">Updated {formatWhen(settings.updatedAt)}</p>
              ) : null}

              <label className="mt-3 block">
                <span className="text-[11px] font-medium text-zinc-400">Change Discord webhook URL</span>
                <input
                  type="url"
                  value={webhookDraft}
                  onChange={(e) => setWebhookDraft(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/…"
                  className={`${inputClass} mt-1.5`}
                  autoComplete="off"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={settingsSaving}
                  onClick={() => void saveWebhook()}
                  className="rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-3 py-1.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] disabled:opacity-50"
                >
                  {settingsSaving ? "Saving…" : "Save webhook"}
                </button>
                <button
                  type="button"
                  disabled={settingsSaving}
                  onClick={() => void clearWebhook()}
                  className="rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50"
                >
                  Clear saved URL
                </button>
                {settingsSavedAt ? (
                  <span className="self-center text-[11px] text-zinc-500">Saved {settingsSavedAt}</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Inbound scrapes</p>
              <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                {inboundWebhooks.map((w) => (
                  <li key={w.id}>
                    <span className="font-medium text-zinc-100">{w.label}</span>
                    <span className="ml-2 font-mono text-xs text-sky-300/90">{w.path}</span>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{w.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {settingsError ? (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {settingsError}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 ring-1 ring-white/[0.04]">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Webhook diff logs</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {total.toLocaleString("en-US")} total · showing {pageStart}–{pageEnd}
            </p>
          </div>
          <label className="inline-flex select-none items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={notifyOnly}
              onChange={(e) => {
                setOffset(0);
                setNotifyOnly(e.target.checked);
              }}
              className="h-4 w-4 rounded border-white/20 bg-black/30"
            />
            Only rows with outbound notify
          </label>
        </div>

        {logsError ? (
          <p className="px-6 py-8 text-sm text-rose-300">{logsError}</p>
        ) : logsLoading ? (
          <p className="px-6 py-8 text-sm text-zinc-500">Loading logs…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500">No webhook logs yet.</p>
        ) : (
          <div className="max-h-[min(70vh,52rem)] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_92%,transparent)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">New</th>
                  <th className="px-4 py-3">Notify</th>
                  <th className="px-4 py-3 pr-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-200">
                {rows.map((row) => {
                  const expanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-400">
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/events/${row.eventId}?kind=${row.kind === "LAST_MINUTE" ? "LAST_MINUTE" : "RESALE"}&panel=sock`}
                            className="font-medium text-sky-300/95 hover:underline"
                          >
                            {row.matchLabel}
                          </Link>
                          <p className="text-[11px] text-zinc-500">{row.eventName}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">{row.kind === "LAST_MINUTE" ? "Shop" : "Resale"}</td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-[color:var(--ticketing-accent)]">
                          {row.newCount}
                        </td>
                        <td className="px-4 py-3">
                          <span className={notifyPill(row.notifyOk, row.notifyAttempted)}>
                            {!row.notifyAttempted
                              ? "—"
                              : row.notifyOk
                                ? `OK · ${row.notifyProvider ?? "?"}`
                                : `Fail · ${row.notifyProvider ?? "?"}`}
                          </span>
                          {row.notifyError ? (
                            <p className="mt-1 max-w-[14rem] truncate text-[10px] text-rose-300" title={row.notifyError}>
                              {row.notifyError}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className="rounded-lg border border-white/[0.10] bg-black/25 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/[0.05]"
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-black/25">
                          <td colSpan={6} className="px-4 py-4 pr-6">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <JsonBlock label="Outbound notify (request + response)" value={row.notifyRaw} />
                              <JsonBlock label="Diff sample" value={row.sample} />
                              <JsonBlock label="New listing keys (capped)" value={row.newSeatIds} />
                              <JsonBlock
                                label="Scrape metadata"
                                value={{
                                  prefId: row.prefId,
                                  newCount: row.newCount,
                                  changedCount: row.changedCount,
                                  priceChangedCount: row.priceChangedCount,
                                  notifyStatus: row.notifyStatus,
                                  notifyError: row.notifyError,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={!canPrev || logsLoading}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            className="rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={logsLoading}
            onClick={() => void loadLogs()}
            className="rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!canNext || logsLoading}
            onClick={() => setOffset((o) => o + limit)}
            className="rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
