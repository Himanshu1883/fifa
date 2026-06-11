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
  discordMatch3ResaleWebhookUrlMasked: string | null;
  discordMatch3ResaleWebhookSource: "db" | "env" | null;
  discordMatch3ResaleWebhookConfigured: boolean;
  discordMatch4ResaleWebhookUrlMasked: string | null;
  discordMatch4ResaleWebhookSource: "db" | "env" | null;
  discordMatch4ResaleWebhookConfigured: boolean;
  discordMatch5WebhookUrlMasked: string | null;
  discordMatch5WebhookSource: "db" | "env" | null;
  discordMatch5WebhookConfigured: boolean;
  discordMatch7WebhookUrlMasked: string | null;
  discordMatch7WebhookSource: "db" | "env" | null;
  discordMatch7WebhookConfigured: boolean;
  discordShopWebhookUrlMasked: string | null;
  discordShopWebhookSource: "db" | "env" | null;
  discordShopWebhookConfigured: boolean;
  shopDiscordBaselineSentAt: string | null;
  updatedAt: string | null;
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/35 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

const btnPrimaryClass =
  "rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-3 py-1.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] disabled:opacity-50";

const btnSecondaryClass =
  "rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50";

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
    return "inline-flex items-center rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-zinc-500";
  }
  if (ok) {
    return "inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200";
  }
  return "inline-flex items-center rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200";
}

function httpStatusLabel(status: number | null | undefined): string {
  if (status == null || !Number.isFinite(status)) return "—";
  return String(status);
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
      <pre className="max-h-80 overflow-auto rounded-lg border border-white/[0.08] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
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
    <div className="inline-flex rounded-lg border border-white/[0.08] bg-black/25 p-1">
      <button
        type="button"
        onClick={() => onChange("shop")}
        className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
          active === "shop"
            ? "bg-white/[0.08] text-zinc-100 ring-1 ring-white/[0.08]"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        SHOP
      </button>
      <button
        type="button"
        onClick={() => onChange("resale")}
        className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
          active === "resale"
            ? "bg-white/[0.08] text-zinc-100 ring-1 ring-white/[0.08]"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Resale
      </button>
    </div>
  );
}

function SendBaselineButton({
  disabled,
  loading,
  onClick,
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled || loading} onClick={onClick} className={btnSecondaryClass}>
      {loading ? "Sending…" : "Send baseline now"}
    </button>
  );
}

function ShopLogDetail({ row }: { row: ShopLogRow }) {
  return (
    <div className="grid gap-4">
      <JsonBlock label="Discord request / response" value={row.notifyRaw} />
      {row.error ? (
        <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{row.error}</p>
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
        <p className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-zinc-400">
          {row.newCount <= 0
            ? "Skipped — no new listings in this scrape (newCount = 0)"
            : "Skipped — webhook not configured or notify not attempted"}
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <JsonBlock label="Discord" value={parsed.discord ?? null} />
        <JsonBlock label="WhatsApp (UltraMsg)" value={parsed.whatsapp ?? null} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <JsonBlock label="Full outbound notify raw" value={row.notifyRaw} />
        <JsonBlock
          label="Scrape diff summary"
          value={{
            prefId: row.prefId,
            newCount: row.newCount,
            changedCount: row.changedCount,
            priceChangedCount: row.priceChangedCount,
            notifyStatus: row.notifyStatus,
            notifyProvider: row.notifyProvider,
            notifyError: row.notifyError,
          }}
        />
        <JsonBlock label="New listing keys (capped)" value={row.newSeatIds} />
        <JsonBlock label="Diff sample" value={row.sample} />
      </div>
    </div>
  );
}

export function WebhookLogsClient() {
  const [channel, setChannel] = useState<WebhookChannel>("shop");
  const [settings, setSettings] = useState<WebhookSettings | null>(null);
  const [resaleDraft, setResaleDraft] = useState("");
  const [match3ResaleDraft, setMatch3ResaleDraft] = useState("");
  const [match4ResaleDraft, setMatch4ResaleDraft] = useState("");
  const [match5Draft, setMatch5Draft] = useState("");
  const [match7Draft, setMatch7Draft] = useState("");
  const [shopDraft, setShopDraft] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(null);
  const [baselineSending, setBaselineSending] = useState<"shop" | number | null>(null);
  const [baselineMessage, setBaselineMessage] = useState<string | null>(null);

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

  const sendBaselineNow = async (
    input: { target: "shop" } | { target: "dedicated"; matchNum: number },
  ) => {
    const key = input.target === "shop" ? "shop" : input.matchNum;
    setBaselineSending(key);
    setBaselineMessage(null);
    setSettingsError(null);
    try {
      const res = await fetch("/api/webhook-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        shop?: { attempted?: boolean; ok?: boolean; error?: string };
        resale?: { attempted?: boolean; ok?: boolean; error?: string; mode?: string };
      };
      if (!res.ok || !json.ok) {
        setSettingsError(json.error ?? `Baseline send failed (${res.status})`);
        return;
      }

      const parts: string[] = [];
      if (input.target === "shop") {
        parts.push(json.shop?.ok ? "General shop baseline sent to Discord" : json.shop?.error ?? "Shop baseline failed");
      } else {
        if (json.shop?.attempted) {
          parts.push(`Shop: ${json.shop.ok ? "sent" : json.shop.error ?? "failed"}`);
        } else {
          parts.push(`Shop: ${json.shop?.error ?? "skipped"}`);
        }
        if (json.resale?.attempted) {
          parts.push(`Resale: ${json.resale.ok ? "sent" : json.resale.error ?? "failed"}`);
        } else if (json.resale?.error) {
          parts.push(`Resale: ${json.resale.error}`);
        } else {
          parts.push("Resale: skipped (no inventory)");
        }
      }
      setBaselineMessage(parts.join(" · "));
      await loadSettings();
      if (channel === "shop") await loadLogs();
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setBaselineSending(null);
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
      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Webhook configuration</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {channel === "shop"
                ? "SHOP marketplace Discord — full snapshot once, then match-level changes on each poll."
                : "Resale Discord — new listings for general matches; target-price updates for Match 3, 4, 5, and 7."}
            </p>
          </div>
          <ChannelTabs active={channel} onChange={switchChannel} />
        </div>

        {settingsLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading settings…</p>
        ) : channel === "shop" ? (
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Outbound · SHOP Discord</p>
            <p className="mt-2 text-sm text-zinc-300">
              {settings?.discordShopWebhookConfigured ? (
                <>
                  <span className="font-mono text-xs text-zinc-200">{settings.discordShopWebhookUrlMasked}</span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    ({settings.discordShopWebhookSource === "env" ? "from env" : "saved in DB"})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </p>
            {settings?.shopDiscordBaselineSentAt ? (
              <p className="mt-1 text-[11px] text-zinc-600">
                Baseline sent {formatWhen(settings.shopDiscordBaselineSentAt)}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-600">Baseline not sent yet</p>
            )}
            <p className="mt-1 text-[11px] text-zinc-600">
              All shop matches except Match 3, 4, 5, and 7 (see dedicated webhooks below) · source{" "}
              <span className="font-mono text-zinc-500">/api/shop/latest</span>
              {" · "}
              <Link href="/shop" className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_85%,white_10%)] hover:underline">
                Open SHOP tab
              </Link>
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change SHOP webhook URL</span>
              <input
                type="url"
                value={shopDraft}
                onChange={(e) => setShopDraft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordShopWebhookUrl: shopDraft.trim() || null }).then((ok) => {
                    if (ok) setShopDraft("");
                  });
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setShopDraft("");
                  void patchSettings({ discordShopWebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              <SendBaselineButton
                disabled={!settings?.discordShopWebhookConfigured || settingsSaving}
                loading={baselineSending === "shop"}
                onClick={() => {
                  void sendBaselineNow({ target: "shop" });
                }}
              />
              {settingsSavedAt ? (
                <span className="self-center text-[11px] text-zinc-500">Saved {settingsSavedAt}</span>
              ) : null}
            </div>
          </div>
        ) : (
          <>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Outbound · Resale Discord</p>
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
            <p className="mt-1 text-[11px] text-zinc-600">
              All resale matches except Match 3, 4, 5, and 7 · source{" "}
              <span className="font-mono text-zinc-500">/api/webhooks/sock-available</span>
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change general resale webhook URL</span>
              <input
                type="url"
                value={resaleDraft}
                onChange={(e) => setResaleDraft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordNewListingsWebhookUrl: resaleDraft.trim() || null }).then((ok) => {
                    if (ok) setResaleDraft("");
                  });
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setResaleDraft("");
                  void patchSettings({ discordNewListingsWebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              {settingsSavedAt ? (
                <span className="self-center text-[11px] text-zinc-500">Saved {settingsSavedAt}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Outbound · Match 3 Discord (shop + resale)
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {settings?.discordMatch3ResaleWebhookConfigured ? (
                <>
                  <span className="font-mono text-xs text-zinc-200">
                    {settings.discordMatch3ResaleWebhookUrlMasked}
                  </span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    ({settings.discordMatch3ResaleWebhookSource === "env" ? "from env" : "saved in DB"})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Exclusive for Match 3 shop baseline/deltas and resale target-price updates
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change Match 3 webhook URL</span>
              <input
                type="url"
                value={match3ResaleDraft}
                onChange={(e) => setMatch3ResaleDraft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordMatch3ResaleWebhookUrl: match3ResaleDraft.trim() || null }).then(
                    (ok) => {
                      if (ok) setMatch3ResaleDraft("");
                    },
                  );
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setMatch3ResaleDraft("");
                  void patchSettings({ discordMatch3ResaleWebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              <SendBaselineButton
                disabled={!settings?.discordMatch3ResaleWebhookConfigured || settingsSaving}
                loading={baselineSending === 3}
                onClick={() => {
                  void sendBaselineNow({ target: "dedicated", matchNum: 3 });
                }}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Outbound · Match 4 Discord (shop + resale)
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {settings?.discordMatch4ResaleWebhookConfigured ? (
                <>
                  <span className="font-mono text-xs text-zinc-200">
                    {settings.discordMatch4ResaleWebhookUrlMasked}
                  </span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    ({settings.discordMatch4ResaleWebhookSource === "env" ? "from env" : "saved in DB"})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Exclusive for Match 4 shop baseline/deltas and resale target-price updates
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change Match 4 webhook URL</span>
              <input
                type="url"
                value={match4ResaleDraft}
                onChange={(e) => setMatch4ResaleDraft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordMatch4ResaleWebhookUrl: match4ResaleDraft.trim() || null }).then(
                    (ok) => {
                      if (ok) setMatch4ResaleDraft("");
                    },
                  );
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setMatch4ResaleDraft("");
                  void patchSettings({ discordMatch4ResaleWebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              <SendBaselineButton
                disabled={!settings?.discordMatch4ResaleWebhookConfigured || settingsSaving}
                loading={baselineSending === 4}
                onClick={() => {
                  void sendBaselineNow({ target: "dedicated", matchNum: 4 });
                }}
              />
            </div>
          </div>
          </>
        )}

        {!settingsLoading ? (
          <>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Outbound · Match 5 Discord (shop + resale)
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {settings?.discordMatch5WebhookConfigured ? (
                <>
                  <span className="font-mono text-xs text-zinc-200">{settings.discordMatch5WebhookUrlMasked}</span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    ({settings.discordMatch5WebhookSource === "env" ? "from env" : "saved in DB"})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Exclusive for Match 5 shop baseline/deltas and resale target-price updates
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change Match 5 webhook URL</span>
              <input
                type="url"
                value={match5Draft}
                onChange={(e) => setMatch5Draft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordMatch5WebhookUrl: match5Draft.trim() || null }).then((ok) => {
                    if (ok) setMatch5Draft("");
                  });
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setMatch5Draft("");
                  void patchSettings({ discordMatch5WebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              <SendBaselineButton
                disabled={!settings?.discordMatch5WebhookConfigured || settingsSaving}
                loading={baselineSending === 5}
                onClick={() => {
                  void sendBaselineNow({ target: "dedicated", matchNum: 5 });
                }}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Outbound · Match 7 Discord (shop + resale)
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {settings?.discordMatch7WebhookConfigured ? (
                <>
                  <span className="font-mono text-xs text-zinc-200">{settings.discordMatch7WebhookUrlMasked}</span>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    ({settings.discordMatch7WebhookSource === "env" ? "from env" : "saved in DB"})
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">Not configured</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              Exclusive for Match 7 shop baseline/deltas and resale target-price updates
            </p>

            <label className="mt-3 block">
              <span className="text-[11px] font-medium text-zinc-400">Change Match 7 webhook URL</span>
              <input
                type="url"
                value={match7Draft}
                onChange={(e) => setMatch7Draft(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className={`${inputClass} mt-1.5`}
                autoComplete="off"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  void patchSettings({ discordMatch7WebhookUrl: match7Draft.trim() || null }).then((ok) => {
                    if (ok) setMatch7Draft("");
                  });
                }}
                className={btnPrimaryClass}
              >
                {settingsSaving ? "Saving…" : "Save webhook"}
              </button>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() => {
                  setMatch7Draft("");
                  void patchSettings({ discordMatch7WebhookUrl: null });
                }}
                className={btnSecondaryClass}
              >
                Clear saved URL
              </button>
              <SendBaselineButton
                disabled={!settings?.discordMatch7WebhookConfigured || settingsSaving}
                loading={baselineSending === 7}
                onClick={() => {
                  void sendBaselineNow({ target: "dedicated", matchNum: 7 });
                }}
              />
            </div>
          </div>
          </>
        ) : null}

        {baselineMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {baselineMessage}
          </p>
        ) : null}

        {settingsError ? (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {settingsError}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 ring-1 ring-white/[0.04]">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {channel === "shop" ? "SHOP notify logs" : "Resale webhook diff logs"}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {total.toLocaleString("en-US")} total · showing {pageStart}–{pageEnd}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChannelTabs active={channel} onChange={switchChannel} />
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
              Only rows with outbound notify
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
              Expand all details
            </label>
          </div>
        </div>

        {logsError ? (
          <p className="px-6 py-8 text-sm text-rose-300">{logsError}</p>
        ) : logsLoading ? (
          <p className="px-6 py-8 text-sm text-zinc-500">Loading logs…</p>
        ) : activeRows === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-500">
            {channel === "shop" ? "No SHOP Discord logs yet." : "No resale webhook logs yet."}
          </p>
        ) : channel === "shop" ? (
          <div className="max-h-[min(70vh,52rem)] overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_92%,transparent)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Matches</th>
                  <th className="px-4 py-3">Notify</th>
                  <th className="px-4 py-3">HTTP</th>
                  <th className="px-4 py-3 pr-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-zinc-200">
                {shopRows.map((row) => {
                  const expanded = expandAll || expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-zinc-400">
                          {formatWhen(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-zinc-300">{row.mode}</td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-[color:var(--ticketing-accent)]">
                          {row.mode === "baseline" ? row.matchCount : row.changedCount}
                        </td>
                        <td className="px-4 py-3">
                          <span className={notifyPill(row.ok, row.attempted)}>
                            {row.attempted ? (row.ok ? "OK" : "Fail") : "—"}
                          </span>
                          {row.error ? (
                            <p className="mt-1 max-w-[14rem] truncate text-[10px] text-rose-300" title={row.error}>
                              {row.error}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          <span className={httpStatusClass(row.status, row.ok)}>
                            {httpStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className={btnSecondaryClass}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-black/25">
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
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[color:color-mix(in_oklab,var(--ticketing-surface)_92%,transparent)] text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur-md">
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
                      ? (row.notifyRaw as { discord?: ProviderNotify; whatsapp?: ProviderNotify })
                      : {};
                  const discordStatus = parsed.discord?.response?.status ?? parsed.discord?.status;
                  const whatsappStatus = parsed.whatsapp?.response?.status ?? parsed.whatsapp?.status;
                  const primaryStatus = discordStatus ?? whatsappStatus;

                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-white/[0.03]">
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
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {row.notifyAttempted ? (
                            <span className={httpStatusClass(primaryStatus ?? null, row.notifyOk)}>
                              {httpStatusLabel(primaryStatus)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className={btnSecondaryClass}
                          >
                            {expanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-black/25">
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
            className={btnSecondaryClass}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={logsLoading}
            onClick={() => void loadLogs()}
            className={btnSecondaryClass}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!canNext || logsLoading}
            onClick={() => setOffset((o) => o + limit)}
            className={btnSecondaryClass}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
