"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type WebhookChannel = "shop" | "resale";

type ResaleLogRow = {
  id: number;
  createdAt: string;
  eventId: number;
  matchLabel: string;
  eventName: string;
  kind: string;
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

type ShopLogRow = {
  id: number;
  createdAt: string;
  mode: string;
  matchCount: number;
  changedCount: number;
  attempted: boolean;
  ok: boolean;
  status: number | null;
  error: string | null;
  notifyRaw: unknown;
};

type WebhookSettings = {
  discordNewListingsWebhookUrlMasked: string | null;
  discordNewListingsWebhookSource: "db" | "env" | null;
  discordNewListingsWebhookConfigured: boolean;
  discordShopWebhookUrlMasked: string | null;
  discordShopWebhookSource: "db" | "env" | null;
  discordShopWebhookConfigured: boolean;
  shopDiscordBaselineSentAt: string | null;
  updatedAt: string | null;
};

const inputClass =
  "w-full min-w-0 rounded-xl border border-white/[0.09] bg-black/30 px-3 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/35 placeholder:text-zinc-600 focus:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/15";

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

type ProviderNotify = {
  attempted?: boolean;
  ok?: boolean;
  provider?: string;
  status?: number;
  error?: string;
  request?: unknown;
  response?: { status?: number; body?: string };
};

function notifyPill(ok: boolean | null, attempted: boolean | null): string {
  if (!attempted) {
    return "inline-flex items-center rounded-full border border-white/10 bg-black/25 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-500";
  }
  if (ok) {
    return "inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200";
  }
  return "inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-rose-200";
}

function httpStatusClass(status: number | null | undefined, ok: boolean | null): string {
  if (status == null) return "text-zinc-500";
  if (ok) return "text-emerald-300";
  if (status >= 400) return "text-rose-300";
  return "text-amber-200";
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
      <pre className="max-h-80 overflow-auto rounded-xl border border-white/[0.08] bg-black/45 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

function ChannelTabs({
  active,
  onChange,
}: {
  active: WebhookChannel;
  onChange: (c: WebhookChannel) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-black/25 p-1.5">
      <button
        type="button"
        onClick={() => onChange("shop")}
        className={`relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all sm:min-w-[10rem] sm:flex-none ${
          active === "shop"
            ? "bg-gradient-to-r from-orange-500/25 via-amber-500/15 to-violet-500/25 text-white shadow-lg shadow-orange-950/30 ring-1 ring-orange-400/25"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
        }`}
      >
        <span className="text-base" aria-hidden>
          🛒
        </span>
        SHOP
        {active === "shop" ? (
          <span className="rounded-full bg-orange-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-200">
            Current
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => onChange("resale")}
        className={`relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all sm:min-w-[10rem] sm:flex-none ${
          active === "resale"
            ? "bg-gradient-to-r from-sky-500/15 to-indigo-500/15 text-white ring-1 ring-sky-400/20"
            : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
        }`}
      >
        <span className="text-base" aria-hidden>
          🎟
        </span>
        Resale
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Legacy
        </span>
      </button>
    </div>
  );
}

function StatusDot({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (!configured) {
    return <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" title="Not configured" />;
  }
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" : "bg-amber-400"}`}
      title={ok ? "Configured" : "Needs attention"}
    />
  );
}

function ShopConfigPanel({
  settings,
  draft,
  onDraftChange,
  saving,
  savedAt,
  onSave,
  onClear,
}: {
  settings: WebhookSettings | null;
  draft: string;
  onDraftChange: (v: string) => void;
  saving: boolean;
  savedAt: string | null;
  onSave: () => void;
  onClear: () => void;
}) {
  const configured = Boolean(settings?.discordShopWebhookConfigured);
  const baselineSent = Boolean(settings?.shopDiscordBaselineSentAt);

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-950/45 via-zinc-900/50 to-violet-950/40 ring-1 ring-orange-400/10">
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-orange-500/10 via-transparent to-violet-500/10 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <StatusDot ok={configured} configured={configured} />
              <h2 className="text-lg font-bold tracking-tight text-white">SHOP Discord</h2>
              <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-200">
                Marketplace
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Polls all <span className="font-semibold text-orange-200">104 matches</span> every 10s. Sends a{" "}
              <span className="font-semibold text-zinc-200">full snapshot</span> once, then only{" "}
              <span className="font-semibold text-violet-200">price &amp; availability changes</span>.
            </p>
          </div>
          <Link
            href="/shop"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-100 hover:bg-orange-500/20"
          >
            Open SHOP tab →
          </Link>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-300/70">Active webhook</p>
          {configured ? (
            <p className="font-mono text-xs leading-relaxed text-zinc-200">
              {settings?.discordShopWebhookUrlMasked}
              <span className="ml-2 text-zinc-500">
                ({settings?.discordShopWebhookSource === "env" ? "env" : "database"})
              </span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Not configured — set URL below or add DISCORD_SHOP_WEBHOOK_URL to env.</p>
          )}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span
              className={`rounded-lg px-2.5 py-1 font-semibold ${
                baselineSent
                  ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                  : "border border-amber-400/25 bg-amber-500/10 text-amber-200"
              }`}
            >
              {baselineSent ? `Baseline sent · ${formatWhen(settings?.shopDiscordBaselineSentAt)}` : "Baseline pending"}
            </span>
            <span className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-200">
              Source · /api/shop/latest
            </span>
          </div>
        </div>

        <div>
          <label className="block">
            <span className="text-[11px] font-medium text-zinc-400">Discord webhook URL</span>
            <input
              type="url"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              className={`${inputClass} mt-1.5`}
              autoComplete="off"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-xl bg-gradient-to-r from-orange-500/30 to-violet-500/25 px-4 py-2 text-xs font-bold text-white ring-1 ring-orange-400/30 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save SHOP webhook"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClear}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-400 disabled:opacity-50"
            >
              Clear saved URL
            </button>
            {savedAt ? <span className="self-center text-[11px] text-zinc-500">Saved {savedAt}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ResaleConfigPanel({
  settings,
  draft,
  onDraftChange,
  saving,
  savedAt,
  onSave,
  onClear,
}: {
  settings: WebhookSettings | null;
  draft: string;
  onDraftChange: (v: string) => void;
  saving: boolean;
  savedAt: string | null;
  onSave: () => void;
  onClear: () => void;
}) {
  const configured = Boolean(settings?.discordNewListingsWebhookConfigured);

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-400/15 bg-gradient-to-br from-sky-950/25 via-zinc-900/50 to-indigo-950/30 ring-1 ring-sky-400/10">
      <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <StatusDot ok={configured} configured={configured} />
          <h2 className="text-lg font-bold tracking-tight text-white">Resale Discord</h2>
          <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Legacy
          </span>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Fires on sock_available <span className="font-semibold text-sky-200">RESALE</span> scrapes when the diff finds{" "}
          <span className="font-semibold text-zinc-200">completely new</span> listings (same ✓ New on event pages).
        </p>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/70">Active webhook</p>
          {configured ? (
            <p className="font-mono text-xs leading-relaxed text-zinc-200">
              {settings?.discordNewListingsWebhookUrlMasked}
              <span className="ml-2 text-zinc-500">
                ({settings?.discordNewListingsWebhookSource === "env" ? "env" : "database"})
              </span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Not configured.</p>
          )}
          <span className="inline-flex rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
            Source · /api/webhooks/sock-available
          </span>
        </div>

        <div>
          <label className="block">
            <span className="text-[11px] font-medium text-zinc-400">Discord webhook URL</span>
            <input
              type="url"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              className={`${inputClass} mt-1.5`}
              autoComplete="off"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-xl bg-sky-500/20 px-4 py-2 text-xs font-bold text-sky-100 ring-1 ring-sky-400/25 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save resale webhook"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClear}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-400 disabled:opacity-50"
            >
              Clear saved URL
            </button>
            {savedAt ? <span className="self-center text-[11px] text-zinc-500">Saved {savedAt}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ShopLogDetail({ row }: { row: ShopLogRow }) {
  return (
    <div className="grid gap-4">
      <JsonBlock label="Discord request / response (all batches)" value={row.notifyRaw} />
      {row.error ? (
        <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{row.error}</p>
      ) : null}
    </div>
  );
}

function ResaleLogDetail({ row }: { row: ResaleLogRow }) {
  const parsed =
    row.notifyRaw && typeof row.notifyRaw === "object"
      ? (row.notifyRaw as { discord?: ProviderNotify; whatsapp?: ProviderNotify })
      : {};

  return (
    <div className="grid gap-4">
      {!row.notifyAttempted ? (
        <p className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-xs text-zinc-400">
          {row.newCount <= 0
            ? "Skipped — no new listings in this scrape"
            : "Skipped — webhook not configured or notify not attempted"}
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <JsonBlock label="Discord notify" value={parsed.discord ?? null} />
        <JsonBlock label="WhatsApp notify" value={parsed.whatsapp ?? null} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <JsonBlock label="Full notify raw" value={row.notifyRaw} />
        <JsonBlock
          label="Scrape diff"
          value={{
            prefId: row.prefId,
            newCount: row.newCount,
            changedCount: row.changedCount,
            priceChangedCount: row.priceChangedCount,
          }}
        />
      </div>
    </div>
  );
}

function modeBadge(mode: string): { label: string; className: string } {
  if (mode === "baseline") {
    return {
      label: "Full snapshot",
      className: "border-orange-400/30 bg-orange-500/15 text-orange-200",
    };
  }
  if (mode === "delta") {
    return {
      label: "Delta",
      className: "border-violet-400/30 bg-violet-500/15 text-violet-200",
    };
  }
  return { label: mode, className: "border-white/10 bg-black/25 text-zinc-400" };
}

export function WebhookLogsClient() {
  const [channel, setChannel] = useState<WebhookChannel>("shop");
  const [settings, setSettings] = useState<WebhookSettings | null>(null);
  const [resaleDraft, setResaleDraft] = useState("");
  const [shopDraft, setShopDraft] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);

  const [shopRows, setShopRows] = useState<ShopLogRow[]>([]);
  const [resaleRows, setResaleRows] = useState<ResaleLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [notifyOnly, setNotifyOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandAll, setExpandAll] = useState(false);

  const limit = 100;

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-settings", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        settings?: WebhookSettings;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !json.ok || !json.settings) {
        setSettingsError(json.error ?? `Settings load failed (${res.status})`);
        return;
      }
      setSettings(json.settings);
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
        channel,
        limit: String(limit),
        offset: String(offset),
      });
      if (notifyOnly) params.set("notifyOnly", "1");
      const res = await fetch(`/api/webhook-logs?${params}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        channel?: WebhookChannel;
        rows?: ShopLogRow[] | ResaleLogRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setLogsError(json.error ?? `Logs load failed (${res.status})`);
        return;
      }
      if (json.channel === "shop") {
        setShopRows((json.rows ?? []) as ShopLogRow[]);
        setResaleRows([]);
      } else {
        setResaleRows((json.rows ?? []) as ResaleLogRow[]);
        setShopRows([]);
      }
      setTotal(json.total ?? 0);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogsLoading(false);
    }
  }, [channel, offset, notifyOnly]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const patchSettings = async (body: Record<string, unknown>) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; settings?: WebhookSettings; error?: string };
      if (!res.ok || !json.ok || !json.settings) {
        setSettingsError(json.error ?? `Save failed (${res.status})`);
        return false;
      }
      setSettings(json.settings);
      setSettingsSavedAt(new Date().toLocaleTimeString());
      return true;
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSettingsSaving(false);
    }
  };

  const switchChannel = (next: WebhookChannel) => {
    setChannel(next);
    setOffset(0);
    setExpandedId(null);
    setExpandAll(false);
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + (channel === "shop" ? shopRows.length : resaleRows.length), total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  const activeRows = channel === "shop" ? shopRows.length : resaleRows.length;

  return (
    <div className="flex flex-col gap-5">
      <ChannelTabs active={channel} onChange={switchChannel} />

      {settingsLoading ? (
        <p className="text-sm text-zinc-500">Loading webhook settings…</p>
      ) : channel === "shop" ? (
        <ShopConfigPanel
          settings={settings}
          draft={shopDraft}
          onDraftChange={setShopDraft}
          saving={settingsSaving}
          savedAt={settingsSavedAt}
          onSave={() => {
            void patchSettings({ discordShopWebhookUrl: shopDraft.trim() || null }).then((ok) => {
              if (ok) setShopDraft("");
            });
          }}
          onClear={() => {
            setShopDraft("");
            void patchSettings({ discordShopWebhookUrl: null });
          }}
        />
      ) : (
        <ResaleConfigPanel
          settings={settings}
          draft={resaleDraft}
          onDraftChange={setResaleDraft}
          saving={settingsSaving}
          savedAt={settingsSavedAt}
          onSave={() => {
            void patchSettings({ discordNewListingsWebhookUrl: resaleDraft.trim() || null }).then((ok) => {
              if (ok) setResaleDraft("");
            });
          }}
          onClear={() => {
            setResaleDraft("");
            void patchSettings({ discordNewListingsWebhookUrl: null });
          }}
        />
      )}

      {settingsError ? (
        <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100">
          {settingsError}
        </p>
      ) : null}

      <section
        className={`overflow-hidden rounded-2xl border ring-1 ${
          channel === "shop"
            ? "border-orange-400/15 bg-zinc-900/40 ring-orange-400/5"
            : "border-sky-400/15 bg-zinc-900/40 ring-sky-400/5"
        }`}
      >
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {channel === "shop" ? "SHOP notify history" : "Resale scrape logs"}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {total.toLocaleString("en-US")} total · showing {pageStart}–{pageEnd}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex select-none items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={notifyOnly}
                onChange={(e) => {
                  setOffset(0);
                  setExpandAll(false);
                  setExpandedId(null);
                  setNotifyOnly(e.target.checked);
                }}
                className="h-4 w-4 rounded border-white/20 bg-black/30"
              />
              Only attempted sends
            </label>
            <label className="inline-flex select-none items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={expandAll}
                onChange={(e) => {
                  setExpandAll(e.target.checked);
                  setExpandedId(null);
                }}
                className="h-4 w-4 rounded border-white/20 bg-black/30"
              />
              Expand all
            </label>
          </div>
        </div>

        {logsError ? (
          <p className="px-6 py-8 text-sm text-rose-300">{logsError}</p>
        ) : logsLoading ? (
          <p className="px-6 py-8 text-sm text-zinc-500">Loading logs…</p>
        ) : activeRows === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-zinc-500">
              {channel === "shop"
                ? "No SHOP Discord sends yet. Open the SHOP tab or wait for the next poll."
                : "No resale webhook logs yet."}
            </p>
            {channel === "shop" ? (
              <Link
                href="/shop"
                className="mt-3 inline-flex rounded-xl bg-orange-500/15 px-4 py-2 text-xs font-semibold text-orange-200 ring-1 ring-orange-400/25"
              >
                Go to SHOP →
              </Link>
            ) : null}
          </div>
        ) : channel === "shop" ? (
          <div className="max-h-[min(70vh,52rem)] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_90%,transparent)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Matches</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">HTTP</th>
                  <th className="px-4 py-3 pr-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-200">
                {shopRows.map((row) => {
                  const expanded = expandAll || expandedId === row.id;
                  const badge = modeBadge(row.mode);
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-orange-500/[0.04]">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-400">
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {row.mode === "baseline" ? (
                            <span className="text-orange-200">{row.matchCount}</span>
                          ) : (
                            <span className="text-violet-200">{row.changedCount} changed</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={notifyPill(row.ok, row.attempted)}>
                            {row.attempted ? (row.ok ? "Sent" : "Failed") : "—"}
                          </span>
                          {row.error ? (
                            <p className="mt-1 max-w-[14rem] truncate text-[10px] text-rose-300" title={row.error}>
                              {row.error}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          <span className={httpStatusClass(row.status, row.ok)}>
                            {row.status ?? "—"}
                          </span>
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
                        <tr className="bg-black/30">
                          <td colSpan={6} className="px-4 py-4 pr-6">
                            <ShopLogDetail row={row} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-h-[min(70vh,52rem)] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_90%,transparent)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">New</th>
                  <th className="px-4 py-3">Notify</th>
                  <th className="px-4 py-3">HTTP</th>
                  <th className="px-4 py-3 pr-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-200">
                {resaleRows.map((row) => {
                  const expanded = expandAll || expandedId === row.id;
                  const parsed =
                    row.notifyRaw && typeof row.notifyRaw === "object"
                      ? (row.notifyRaw as { discord?: ProviderNotify })
                      : {};
                  const status = parsed.discord?.response?.status ?? parsed.discord?.status ?? null;

                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-sky-500/[0.04]">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-400">
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/events/${row.eventId}?kind=RESALE&panel=sock`}
                            className="font-medium text-sky-300/95 hover:underline"
                          >
                            {row.matchLabel}
                          </Link>
                          <p className="text-[11px] text-zinc-500">{row.eventName}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-sky-300">{row.newCount}</td>
                        <td className="px-4 py-3">
                          <span className={notifyPill(row.notifyOk, row.notifyAttempted)}>
                            {!row.notifyAttempted
                              ? "—"
                              : row.notifyOk
                                ? `OK · ${row.notifyProvider ?? "?"}`
                                : `Fail`}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          <span className={httpStatusClass(status, row.notifyOk)}>
                            {status ?? "—"}
                          </span>
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
                        <tr className="bg-black/30">
                          <td colSpan={6} className="px-4 py-4 pr-6">
                            <ResaleLogDetail row={row} />
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
