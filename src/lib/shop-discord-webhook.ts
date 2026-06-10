import type { ShopMarketEvent, ShopMarketListing } from "@/lib/shop-marketplace-types";
import { formatShopPrice } from "@/app/shop/shop-utils";
import { maskWebhookUrl, resolveDiscordShopWebhookUrl } from "@/lib/webhook-settings";

export type ShopDiscordNotifyResult = {
  attempted: boolean;
  ok: boolean;
  provider: "discord-shop";
  status?: number;
  error?: string;
  mode?: "baseline" | "delta";
  matchCount?: number;
  request?: {
    webhookUrlMasked: string;
    method: "POST";
    headers: Record<string, string>;
    body: unknown;
  };
  response?: { status: number; body: string };
};

const SHOP_EMBED_COLOR_IN_STOCK = 0x3b82f6;
const SHOP_EMBED_COLOR_NO_STOCK = 0xef4444;

function availableListings(event: ShopMarketEvent): ShopMarketListing[] {
  return event.listings.filter((l) => l.available);
}

function formatAvailableListingLine(listing: ShopMarketListing, currency: string): string {
  if (listing.price !== null) {
    return `${listing.categoryLabel}: **${formatShopPrice(listing.price, currency)}**`;
  }
  return `${listing.categoryLabel}: Avail`;
}

function matchSummaryLine(event: ShopMarketEvent, compact: boolean): string {
  const title = event.catalogue.matchLabel ?? `Match ${event.matchNum}`;
  const name = event.catalogue.eventName;
  const avail = availableListings(event);

  if (compact) {
    if (avail.length === 0) return `**M${event.matchNum}** ${title} — _no stock_`;
    const prices = avail
      .filter((l) => l.price !== null)
      .map((l) => `${l.categoryKey} ${formatShopPrice(l.price, event.currency)}`)
      .join(" · ");
    return `**M${event.matchNum}** ${name} — ${prices || `${avail.length} avail`}`;
  }

  const lines = avail.map((l) => formatAvailableListingLine(l, event.currency));
  return lines.join("\n");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildShopBaselineEmbeds(events: ShopMarketEvent[]): Array<Record<string, unknown>> {
  const sorted = [...events].sort((a, b) => a.matchNum - b.matchNum);
  const batches = chunk(sorted, 12);
  const hasAnyStock = sorted.some((e) => availableListings(e).length > 0);
  return batches.map((batch, idx) => ({
    title: idx === 0 ? "🛒 SHOP — Full marketplace snapshot" : `🛒 SHOP snapshot (cont. ${idx + 1})`,
    description: batch.map((e) => matchSummaryLine(e, true)).join("\n").slice(0, 3900),
    color: hasAnyStock ? SHOP_EMBED_COLOR_IN_STOCK : SHOP_EMBED_COLOR_NO_STOCK,
    footer: { text: `Matches ${batch[0]?.matchNum}–${batch[batch.length - 1]?.matchNum}` },
  }));
}

function deltaEmbedTitle(event: ShopMarketEvent): string {
  return `M${event.matchNum} · ${event.catalogue.eventName}`;
}

export function buildShopDeltaEmbeds(changed: ShopMarketEvent[]): Array<Record<string, unknown>> {
  return changed
    .filter((event) => availableListings(event).length > 0)
    .slice(0, 10)
    .map((event) => {
      const inStock = availableListings(event).length > 0;
      return {
        title: deltaEmbedTitle(event),
        description: matchSummaryLine(event, false).slice(0, 3900),
        color: inStock ? SHOP_EMBED_COLOR_IN_STOCK : SHOP_EMBED_COLOR_NO_STOCK,
        timestamp: new Date().toISOString(),
      };
    });
}

export async function sendShopDiscordPayload(input: {
  content: string;
  embeds: Array<Record<string, unknown>>;
  mode: "baseline" | "delta";
  matchCount: number;
}): Promise<ShopDiscordNotifyResult> {
  const provider = "discord-shop" as const;
  const webhookUrl = await resolveDiscordShopWebhookUrl();
  if (!webhookUrl) return { attempted: false, ok: false, provider };

  const body = { content: input.content, embeds: input.embeds };
  const requestMeta = {
    webhookUrlMasked: maskWebhookUrl(webhookUrl),
    method: "POST" as const,
    headers: { "content-type": "application/json" },
    body,
  };

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: requestMeta.headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const responseBody = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        provider,
        status: res.status,
        mode: input.mode,
        matchCount: input.matchCount,
        error: `Discord returned HTTP ${res.status}`,
        request: requestMeta,
        response: { status: res.status, body: responseBody.slice(0, 2000) },
      };
    }
    return {
      attempted: true,
      ok: true,
      provider,
      status: res.status,
      mode: input.mode,
      matchCount: input.matchCount,
      request: requestMeta,
      response: { status: res.status, body: responseBody.slice(0, 2000) },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      attempted: true,
      ok: false,
      provider,
      mode: input.mode,
      matchCount: input.matchCount,
      error: msg.slice(0, 240),
      request: requestMeta,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Baseline may require multiple Discord messages (embed limit). */
export async function sendShopBaselineToDiscord(events: ShopMarketEvent[]): Promise<ShopDiscordNotifyResult[]> {
  const embeds = buildShopBaselineEmbeds(events);
  const results: ShopDiscordNotifyResult[] = [];
  for (let i = 0; i < embeds.length; i++) {
    const batch = embeds[i];
    const res = await sendShopDiscordPayload({
      content: i === 0 ? "**SHOP** — Initial full listing dump (all matches)" : "",
      embeds: [batch],
      mode: "baseline",
      matchCount: events.length,
    });
    results.push(res);
    if (!res.ok) break;
  }
  return results;
}

export async function sendShopDeltaToDiscord(changed: ShopMarketEvent[]): Promise<ShopDiscordNotifyResult> {
  const embeds = buildShopDeltaEmbeds(changed);
  if (embeds.length === 0) {
    return { attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 };
  }
  const inStockCount = changed.filter((e) => availableListings(e).length > 0).length;
  return sendShopDiscordPayload({
    content: `**SHOP updates** — ${inStockCount} match${inStockCount === 1 ? "" : "es"} changed`,
    embeds,
    mode: "delta",
    matchCount: inStockCount,
  });
}
