"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type MatchRow = {
  matchNum: number;
  eventName: string;
  matchLabel: string;
  channelSlug: string;
  resaleWebhookUrl: string | null;
  shopWebhookUrl: string | null;
  resaleWebhookUrlMasked: string | null;
  shopWebhookUrlMasked: string | null;
};

type FilterMode = "all" | "configured" | "missing";

const inputClass =
  "w-full min-w-0 rounded-lg border border-white/[0.09] bg-[color:color-mix(in_oklab,var(--ticketing-surface-elevated)_92%,white_8%)] px-2 py-1.5 font-mono text-[11px] text-zinc-100 shadow-inner shadow-black/35 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none";

const btnPrimary =
  "rounded-lg bg-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] px-3 py-1.5 text-xs font-semibold text-zinc-50 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_32%,transparent)] disabled:opacity-50";

const btnSecondary =
  "rounded-lg border border-white/[0.10] bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-300 disabled:opacity-50";

function rowKey(r: MatchRow): string {
  return String(r.matchNum);
}

export function MatchDiscordWebhooksClient() {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { resale: string; shop: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/match-discord-webhooks", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; rows?: MatchRow[]; error?: string };
      if (!json.ok || !json.rows) {
        throw new Error(json.error ?? "Failed to load match webhooks");
      }
      setRows(json.rows);
      const nextDrafts: Record<string, { resale: string; shop: string }> = {};
      for (const r of json.rows) {
        nextDrafts[rowKey(r)] = {
          resale: r.resaleWebhookUrl ?? "",
          shop: r.shopWebhookUrl ?? "",
        };
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "configured") {
        if (!r.resaleWebhookUrl && !r.shopWebhookUrl) return false;
      } else if (filter === "missing") {
        if (r.resaleWebhookUrl || r.shopWebhookUrl) return false;
      }
      if (!q) return true;
      return (
        String(r.matchNum).includes(q) ||
        r.eventName.toLowerCase().includes(q) ||
        r.channelSlug.includes(q) ||
        r.matchLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search]);

  async function saveRows(matchNums: number[]) {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const items = matchNums.map((matchNum) => {
        const d = drafts[rowKey({ matchNum } as MatchRow)] ?? { resale: "", shop: "" };
        return {
          matchNum,
          resaleWebhookUrl: d.resale.trim() || null,
          shopWebhookUrl: d.shop.trim() || null,
        };
      });
      const res = await fetch("/api/match-discord-webhooks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; updated?: number };
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setSavedMsg(`Saved ${json.updated ?? matchNums.length} match(es).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function applyBulkImport() {
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const updates: Record<string, { resale: string; shop: string }> = { ...drafts };
    for (const line of lines) {
      if (line.toLowerCase().startsWith("matchnum")) continue;
      const parts = line.split(",").map((p) => p.trim());
      const matchNum = Number(parts[0]);
      if (!Number.isInteger(matchNum) || matchNum < 1) continue;
      const key = String(matchNum);
      const prev = updates[key] ?? { resale: "", shop: "" };
      updates[key] = {
        resale: parts[1] ?? prev.resale,
        shop: parts[2] ?? prev.shop,
      };
    }
    setDrafts(updates);
    setBulkOpen(false);
    setSavedMsg("Bulk import applied to drafts — click Save all to persist.");
  }

  const configuredCount = rows.filter((r) => r.resaleWebhookUrl || r.shopWebhookUrl).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/35 p-5 ring-1 ring-white/[0.04]">
        <p className="text-sm leading-relaxed text-zinc-400">
          Map each match (1–104) to its own Discord webhook URLs for{" "}
          <strong className="font-medium text-zinc-200">Resale</strong> and{" "}
          <strong className="font-medium text-zinc-200">LMS/Shop</strong> channels. Create a webhook in
          each Discord channel (Integrations → Webhooks), then paste the URL here. Suggested channel
          names use the slug column (e.g. <span className="font-mono text-zinc-300">#france-vs-senegal</span>
          ).
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {configuredCount} / {rows.length || 104} matches with at least one webhook configured.
          General fallbacks on{" "}
          <Link href="/webhook-logs" className="text-sky-300/90 hover:underline">
            Webhook logs
          </Link>{" "}
          still apply for matches without URLs here.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search match #, name, slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-lg border border-white/[0.09] bg-black/30 px-3 py-2 text-sm text-zinc-100"
          />
          {(["all", "configured", "missing"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={
                filter === mode
                  ? btnPrimary
                  : "rounded-lg border border-white/[0.10] bg-black/20 px-3 py-1.5 text-xs font-medium text-zinc-400"
              }
            >
              {mode === "all" ? "All" : mode === "configured" ? "Configured" : "Missing"}
            </button>
          ))}
          <button type="button" className={btnSecondary} onClick={() => setBulkOpen((v) => !v)}>
            Bulk CSV import
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={saving || loading}
            onClick={() => void saveRows(rows.map((r) => r.matchNum))}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>

        {bulkOpen ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/25 p-4">
            <p className="text-xs text-zinc-400">
              One line per match: <span className="font-mono">matchNum,resaleWebhookUrl,shopWebhookUrl</span>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"matchNum,resaleWebhookUrl,shopWebhookUrl\n18,https://discord.com/api/webhooks/...,https://discord.com/api/webhooks/..."}
              className="mt-2 w-full rounded-lg border border-white/[0.09] bg-black/40 px-3 py-2 font-mono text-xs text-zinc-200"
            />
            <button type="button" className={`${btnPrimary} mt-2`} onClick={applyBulkImport}>
              Apply to drafts
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        {savedMsg ? <p className="mt-3 text-sm text-emerald-300/90">{savedMsg}</p> : null}
      </section>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading matches…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] ring-1 ring-white/[0.04]">
          <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.08] bg-black/30 text-zinc-500">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Match</th>
                <th className="px-3 py-2 font-semibold">Channel slug</th>
                <th className="px-3 py-2 font-semibold">Resale webhook</th>
                <th className="px-3 py-2 font-semibold">LMS / Shop webhook</th>
                <th className="px-3 py-2 font-semibold">Save</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const key = rowKey(r);
                const d = drafts[key] ?? { resale: "", shop: "" };
                return (
                  <tr key={key} className="border-b border-white/[0.05] text-zinc-300">
                    <td className="px-3 py-2 tabular-nums font-semibold text-zinc-100">M{r.matchNum}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-100">{r.eventName}</div>
                      <div className="text-[10px] text-zinc-500">{r.matchLabel}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">#{r.channelSlug || "—"}</td>
                    <td className="px-3 py-2">
                      <input
                        type="url"
                        value={d.resale}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: { ...d, resale: e.target.value },
                          }))
                        }
                        placeholder={r.resaleWebhookUrlMasked ?? "https://discord.com/api/webhooks/…"}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="url"
                        value={d.shop}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: { ...d, shop: e.target.value },
                          }))
                        }
                        placeholder={r.shopWebhookUrlMasked ?? "https://discord.com/api/webhooks/…"}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={saving}
                        onClick={() => void saveRows([r.matchNum])}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
