"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Props = {
  connected: boolean;
  tokenSecretOk: boolean;
};

function buttonClass(kind: "primary" | "danger" | "neutral", disabled: boolean): string {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-medium ring-1 ring-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ticketing-surface)]";
  const dis = disabled ? "opacity-60 pointer-events-none" : "";
  if (kind === "primary")
    return `${base} bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] text-zinc-100 hover:bg-[color:color-mix(in_oklab,var(--ticketing-accent)_18%,transparent)] ${dis}`;
  if (kind === "danger") return `${base} bg-red-500/15 text-red-100 hover:bg-red-500/20 ${dis}`;
  return `${base} bg-white/[0.08] text-zinc-200 hover:bg-white/[0.12] ${dis}`;
}

export function GmailControlsClient({ connected, tokenSecretOk }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const canConnect = tokenSecretOk;
  const connectLabel = useMemo(() => {
    if (!tokenSecretOk) return "Connect (set token secret first)";
    return connected ? "Connect another Gmail" : "Connect Gmail";
  }, [connected, tokenSecretOk]);

  async function postJson(path: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(path, { method: "POST" });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) return { ok: true };
    const msg =
      json && typeof json === "object" && "error" in json
        ? typeof (json as { error?: unknown }).error === "string"
          ? String((json as { error?: unknown }).error)
          : `Request failed (${res.status})`
        : `Request failed (${res.status})`;
    return { ok: false, error: msg };
  }

  return (
    <div className="space-y-3">
      {status ? (
        <p className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-zinc-300">{status}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass("primary", isPending || !canConnect)}
          onClick={() => {
            setStatus(null);
            window.location.href = "/api/gmail/oauth/start";
          }}
          disabled={isPending || !canConnect}
        >
          {connectLabel}
        </button>

        <button
          type="button"
          className={buttonClass("neutral", isPending || !connected)}
          onClick={() => {
            setStatus(null);
            startTransition(async () => {
              const res = await fetch("/api/gmail/sync?limit=20", { method: "POST" });
              const text = await res.text();
              if (!res.ok) {
                setStatus(text.slice(0, 240));
                return;
              }
              setStatus("Sync complete.");
              router.refresh();
            });
          }}
          disabled={isPending || !connected}
        >
          {isPending ? "Syncing…" : "Sync"}
        </button>

        <button
          type="button"
          className={buttonClass("danger", isPending || !connected)}
          onClick={() => {
            setStatus(null);
            startTransition(async () => {
              const res = await postJson("/api/gmail/disconnect");
              if (!res.ok) {
                setStatus(res.error ?? "Disconnect failed.");
                return;
              }
              setStatus("Disconnected.");
              router.refresh();
            });
          }}
          disabled={isPending || !connected}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

