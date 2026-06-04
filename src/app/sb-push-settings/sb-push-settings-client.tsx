"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  mapQuantityWithRules,
  runtimeFromConfig,
  type SbPushQuantityRule,
  type SbPushRulesConfig,
} from "@/lib/sb-push-rules-settings-types";

const inputClass =
  "w-full min-w-0 rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-3 py-2 text-sm text-zinc-100 shadow-inner shadow-black/35 tabular-nums focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)]";

type PolicyDoc = Record<string, string>;

function QuantityRulesEditor(props: {
  title: string;
  description: string;
  rules: SbPushQuantityRule[];
  offerType: "together" | "single";
  previewRuntime: ReturnType<typeof runtimeFromConfig>;
  onChange: (rules: SbPushQuantityRule[]) => void;
}) {
  const { title, description, rules, offerType, previewRuntime, onChange } = props;

  const updateRow = (index: number, field: "input" | "output", raw: string) => {
    const n = Number.parseInt(raw, 10);
    const next = rules.map((r, i) =>
      i === index ? { ...r, [field]: Number.isFinite(n) ? n : 0 } : r,
    );
    onChange(next);
  };

  const removeRow = (index: number) => {
    if (rules.length <= 1) return;
    onChange(rules.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const maxIn = rules.reduce((m, r) => Math.max(m, r.input), 0);
    onChange([...rules, { input: maxIn + 1, output: 1 }].sort((a, b) => a.input - b.input));
  };

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full min-w-[280px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-black/30 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <th className="px-4 py-2.5">Seats in bucket</th>
              <th className="px-4 py-2.5">SB quantity</th>
              <th className="px-4 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rules.map((row, i) => (
              <tr key={`${offerType}-${i}-${row.input}`} className="text-zinc-200">
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={row.input || ""}
                    onChange={(e) => updateRow(i, "input", e.target.value)}
                    aria-label={`${title} seats in bucket row ${i + 1}`}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={row.output || ""}
                    onChange={(e) => updateRow(i, "output", e.target.value)}
                    aria-label={`${title} SB quantity row ${i + 1}`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-zinc-500 hover:text-rose-300 disabled:opacity-30"
                    disabled={rules.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="mt-3 rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05]"
        onClick={addRow}
      >
        Add row
      </button>
    </section>
  );
}

export function SbPushSettingsClient() {
  const [config, setConfig] = useState<SbPushRulesConfig | null>(null);
  const [policy, setPolicy] = useState<PolicyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewSeats, setPreviewSeats] = useState(7);
  const [previewType, setPreviewType] = useState<"together" | "single">("together");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sb-push-rules-settings", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        config?: SbPushRulesConfig;
        policy?: PolicyDoc;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !json.ok || !json.config) {
        setError(json.error ?? `Load failed (${res.status})`);
        return;
      }
      setConfig(json.config);
      setPolicy(json.policy ?? null);
      if (json.warning) setError(json.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previewRuntime = useMemo(
    () => (config ? runtimeFromConfig(config) : null),
    [config],
  );

  const previewOutput = useMemo(() => {
    if (!previewRuntime) return null;
    return mapQuantityWithRules(previewSeats, previewType, previewRuntime);
  }, [previewRuntime, previewSeats, previewType]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sb-push-rules-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = (await res.json()) as { ok?: boolean; config?: SbPushRulesConfig; error?: string };
      if (!res.ok || !json.ok || !json.config) {
        setError(json.error ?? `Save failed (${res.status})`);
        return;
      }
      setConfig(json.config);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setConfig({
      togetherRules: [...DEFAULT_SB_PUSH_TOGETHER_RULES],
      singleRules: [...DEFAULT_SB_PUSH_SINGLE_RULES],
      autoDeleteOnScrapeRemoval: true,
      updatedAt: config?.updatedAt ?? null,
    });
  };

  if (loading) {
    return (
      <p className="rounded-xl border border-white/[0.08] bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
        Loading push rules…
      </p>
    );
  }

  if (!config || !previewRuntime) {
    return (
      <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
        {error ?? "Could not load settings."}
      </p>
    );
  }

  const policyEntries = policy ? Object.entries(policy) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-10 rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_16%,transparent)] px-4 text-sm font-semibold text-zinc-50 shadow-sm shadow-black/25 hover:brightness-105 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-white/[0.10] bg-black/25 px-4 text-sm font-medium text-zinc-300 hover:bg-white/[0.05]"
            onClick={resetDefaults}
          >
            Reset to defaults
          </button>
          {savedAt ? (
            <span className="text-xs text-emerald-300/90">Saved at {savedAt}</span>
          ) : null}
        </div>
        {config.updatedAt ? (
          <span className="text-[11px] text-zinc-500">
            Last saved {new Date(config.updatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-4 py-3 text-sm text-amber-100" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
        <h2 className="text-sm font-semibold text-zinc-100">How listings are built</h2>
        <p className="mt-1 text-xs text-zinc-500">
          These steps are fixed in code today. Quantity tables below are editable.
        </p>
        <ul className="mt-4 space-y-2.5">
          {policyEntries.map(([key, line]) => (
            <li key={key} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[color:var(--ticketing-accent)]" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
        <input
          type="checkbox"
          className="mt-1 size-4 rounded border-white/20 bg-black/40 accent-[color:var(--ticketing-accent)]"
          checked={config.autoDeleteOnScrapeRemoval}
          onChange={(e) =>
            setConfig((c) => (c ? { ...c, autoDeleteOnScrapeRemoval: e.target.checked } : c))
          }
        />
        <span>
          <span className="block text-sm font-semibold text-zinc-100">
            Auto-delete on SB when listing leaves resale scrape
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
            When enabled, the next sock-available sync removes pushed listings that no longer appear in
            RESALE inventory and deletes them on SeatsBrokers.
          </span>
        </span>
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <QuantityRulesEditor
          title="Together (consecutive, same block + price)"
          description="Consecutive seat numbers in one row at the same price. Unlisted bucket sizes pass through unchanged."
          offerType="together"
          rules={config.togetherRules}
          previewRuntime={previewRuntime}
          onChange={(togetherRules) => setConfig((c) => (c ? { ...c, togetherRules } : c))}
        />
        <QuantityRulesEditor
          title="Single (non-consecutive, same block + price)"
          description="Isolated seats at the same price in the same block. Unlisted sizes keep full seat count as SB quantity."
          offerType="single"
          rules={config.singleRules}
          previewRuntime={previewRuntime}
          onChange={(singleRules) => setConfig((c) => (c ? { ...c, singleRules } : c))}
        />
      </div>

      <section className="rounded-2xl border border-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_6%,transparent)] p-5 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)]">
        <h2 className="text-sm font-semibold text-zinc-100">Rule preview</h2>
        <p className="mt-1 text-xs text-zinc-500">See SB quantity for a bucket size before saving (uses current form values).</p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Seats in bucket
            </label>
            <input
              type="number"
              min={1}
              max={99}
              className={`${inputClass} w-28`}
              value={previewSeats}
              onChange={(e) => setPreviewSeats(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Offer type
            </label>
            <select
              className={inputClass}
              value={previewType}
              onChange={(e) => setPreviewType(e.target.value as "together" | "single")}
            >
              <option value="together">Together</option>
              <option value="single">Single</option>
            </select>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">SB quantity</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[color:var(--ticketing-accent)]">
              {previewOutput}
            </p>
            {previewOutput === previewSeats ? (
              <p className="mt-1 text-[11px] text-zinc-500">No rule for this count — sent as-is</p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-500">
                Rule: {previewSeats} → {previewOutput}
              </p>
            )}
          </div>
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Markup % is set on the{" "}
        <Link href="/" className="font-medium text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline">
          Matches
        </Link>{" "}
        page. SB API credentials stay in <code className="text-zinc-400">.env.local</code>.
      </p>
    </div>
  );
}
