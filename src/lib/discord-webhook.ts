import type { SockAvailableKind } from "@/generated/prisma/enums";
import type { SockAvailableNewListingKey } from "@/lib/sock-available-diff";
import { maskWebhookUrl, resolveDiscordNewListingsWebhookUrl } from "@/lib/webhook-settings";

export type DiscordNotifyResult = {
  attempted: boolean;
  ok: boolean;
  provider: "discord";
  status?: number;
  error?: string;
  request?: {
    webhookUrlMasked: string;
    method: "POST";
    headers: Record<string, string>;
    body: unknown;
  };
  response?: {
    status: number;
    body: string;
  };
};

function clampError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const t = msg.trim();
  if (!t) return "Unknown error";
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

export function amountRawToUsdString(raw: number | null): string {
  if (raw === null) return "—";
  const usd = raw / 1000;
  if (!Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(2)}`;
}

function formatNewListingLine(item: SockAvailableNewListingKey): string {
  const cat = item.categoryName?.trim() || item.categoryId?.trim() || "—";
  return `• ${item.blockName} · Row ${item.row} · Seat ${item.seatNumber} · ${cat} · ${amountRawToUsdString(item.amountRaw)}`;
}

export function buildDiscordNewListingsPayload(input: {
  eventLabel: string;
  eventName: string;
  eventId: number;
  prefId: string;
  kind: SockAvailableKind;
  newCount: number;
  newSeatIds: SockAvailableNewListingKey[];
}): { content: string; embeds: Array<Record<string, unknown>> } {
  const { eventLabel, eventName, eventId, prefId, kind, newCount, newSeatIds } = input;
  const appBase = envTrim("APP_BASE_URL").replace(/\/+$/, "");
  const eventPath = `/events/${eventId}?kind=${kind === "LAST_MINUTE" ? "LAST_MINUTE" : "RESALE"}&panel=sock`;
  const eventUrl = appBase ? `${appBase}${eventPath}` : null;

  const maxLines = 45;
  const lines = newSeatIds.slice(0, maxLines).map(formatNewListingLine);
  if (newCount > maxLines) {
    lines.push(`…and ${(newCount - maxLines).toLocaleString("en-US")} more`);
  }

  let description = lines.join("\n");
  if (description.length > 3900) {
    description = `${description.slice(0, 3900)}…`;
  }

  const title = `🆕 ${newCount.toLocaleString("en-US")} new ${kind === "LAST_MINUTE" ? "shop" : "resale"} listing${newCount === 1 ? "" : "s"}`;
  const embed: Record<string, unknown> = {
    title,
    description: description || "—",
    color: 0x22c55e,
    fields: [
      { name: "Match", value: `${eventLabel} — ${eventName}`, inline: false },
      { name: "Event", value: `ID ${eventId} · pref ${prefId}`, inline: true },
      { name: "Source", value: kind === "LAST_MINUTE" ? "Last minute" : "Resale", inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  if (eventUrl) {
    embed.url = eventUrl;
  }

  return {
    content: `New inventory for **${eventName}** (${eventLabel})`,
    embeds: [embed],
  };
}

export async function sendDiscordNewListingsMessage(input: {
  eventLabel: string;
  eventName: string;
  eventId: number;
  prefId: string;
  kind: SockAvailableKind;
  newCount: number;
  newSeatIds: SockAvailableNewListingKey[];
}): Promise<DiscordNotifyResult> {
  const provider = "discord" as const;
  const webhookUrl = await resolveDiscordNewListingsWebhookUrl();

  if (!webhookUrl) {
    return { attempted: false, ok: false, provider };
  }

  if (input.newCount <= 0) {
    return { attempted: false, ok: false, provider };
  }

  const payload = buildDiscordNewListingsPayload(input);
  const requestMeta = {
    webhookUrlMasked: maskWebhookUrl(webhookUrl),
    method: "POST" as const,
    headers: { "content-type": "application/json" },
    body: payload,
  };

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: requestMeta.headers,
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    const responseBody = await res.text().catch(() => "");

    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        provider,
        status: res.status,
        error: `Discord returned HTTP ${res.status}${responseBody ? `: ${responseBody.slice(0, 120)}` : ""}`,
        request: requestMeta,
        response: { status: res.status, body: responseBody.slice(0, 2000) },
      };
    }

    return {
      attempted: true,
      ok: true,
      provider,
      status: res.status,
      request: requestMeta,
      response: { status: res.status, body: responseBody.slice(0, 2000) },
    };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      provider,
      error: clampError(err),
      request: requestMeta,
    };
  } finally {
    clearTimeout(timeout);
  }
}
