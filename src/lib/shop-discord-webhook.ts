import type { ShopMarketEvent, ShopMarketListing } from "@/lib/shop-marketplace-types";
import { formatShopPrice } from "@/app/shop/shop-utils";
import { buildMatchBuyUrl } from "@/lib/shop-buy-urls";
import { DEDICATED_SHOP_ROUTING_MATCHES, isDedicatedMatchShopWebhook } from "@/lib/dedicated-match-webhooks";
import {
  maskWebhookUrl,
  resolveDedicatedMatchWebhookUrl,
  resolveDiscordShopWebhookUrl,
  resolveDiscordShopWebhookUrlForEvent,
} from "@/lib/webhook-settings";

export type ShopDiscordNotifyResult = {
  attempted: boolean;
  ok: boolean;
  provider: "discord-shop";
  status?: number;
  error?: string;
  mode?: "baseline" | "delta" | "heartbeat";
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
/** FIFA Last Minute shop prices from vivalafifa are USD (fwc26-shop-usd). */
const SHOP_DISCORD_CURRENCY = "USD";

function availableListings(event: ShopMarketEvent): ShopMarketListing[] {
  return event.listings.filter((l) => l.available);
}

/** In-stock listings that have a price — omit unavailable (—) rows from embeds. */
function availablePricedListings(event: ShopMarketEvent): ShopMarketListing[] {
  return availableListings(event).filter((l) => l.price !== null);
}

/** Priced categories for Discord, or Low/High when no per-category prices exist. */
export function resolveShopDiscordDisplayListings(event: ShopMarketEvent): ShopMarketListing[] {
  const priced = availablePricedListings(event);
  if (priced.length > 0) return priced;
  if (event.lowestPrice == null) return [];

  const listings: ShopMarketListing[] = [
    {
      marketKey: `${event.matchNum}-low`,
      categoryKey: "low",
      categoryLabel: "Low",
      available: true,
      price: event.lowestPrice,
    },
  ];
  if (event.highestPrice != null && event.highestPrice !== event.lowestPrice) {
    listings.push({
      marketKey: `${event.matchNum}-high`,
      categoryKey: "high",
      categoryLabel: "High",
      available: true,
      price: event.highestPrice,
    });
  }
  return listings;
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
  const priced = availablePricedListings(event);

  if (compact) {
    if (avail.length === 0) return `**M${event.matchNum}** ${title} — _no stock_`;
    const prices = priced
      .map((l) => `${l.categoryKey} ${formatShopPrice(l.price, SHOP_DISCORD_CURRENCY)}`)
      .join(" · ");
    return `**M${event.matchNum}** ${name} — ${prices || `${avail.length} avail`}`;
  }

  const lines = priced.map((l) => formatAvailableListingLine(l, SHOP_DISCORD_CURRENCY));
  if (lines.length > 0) return lines.join("\n");
  if (avail.length > 0) return avail.map((l) => formatAvailableListingLine(l, SHOP_DISCORD_CURRENCY)).join("\n");
  return "_no stock_";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Discord link button (style 5) — omitted when buyUrl is null. */
export function buildShopBuyNowComponents(buyUrl: string | null): Array<Record<string, unknown>> | undefined {
  if (!buyUrl) return undefined;
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "Buy Now",
          url: buyUrl,
        },
      ],
    },
  ];
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

function shopMatchEmbedTitle(event: ShopMarketEvent): string {
  const label = event.catalogue.matchLabel?.trim() || `Match ${event.matchNum}`;
  return `M${event.matchNum} · ${label}`;
}

/** Prefer event.buyUrl; fall back to FIFA checkout mapping by match number. */
export function resolveShopBuyUrl(event: ShopMarketEvent): string | null {
  const direct = event.buyUrl?.trim();
  if (direct) return direct;
  return buildMatchBuyUrl(event.matchNum);
}

function formatChangedListingLines(listings: ShopMarketListing[], currency: string): string {
  return listings.map((l) => formatAvailableListingLine(l, currency)).join("\n");
}

/** Categories newly available with a price, or whose price changed vs previous scrape. */
export function computeChangedListings(
  prev: ShopMarketEvent | undefined,
  next: ShopMarketEvent,
): ShopMarketListing[] {
  const prevByKey = new Map<string, number>();
  for (const listing of prev?.listings ?? []) {
    if (listing.available && listing.price !== null) {
      prevByKey.set(listing.categoryKey, listing.price);
    }
  }

  const changed: ShopMarketListing[] = [];
  for (const listing of next.listings) {
    if (!listing.available || listing.price === null) continue;
    const prevPrice = prevByKey.get(listing.categoryKey);
    if (prevPrice === undefined || prevPrice !== listing.price) {
      changed.push(listing);
    }
  }

  return changed.sort((a, b) =>
    a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }),
  );
}

/** Embed diff vs last successfully notified fingerprint (not transient scrape prev). */
export function computeChangedListingsFromStoredFingerprint(
  storedFingerprint: string | null | undefined,
  next: ShopMarketEvent,
): ShopMarketListing[] {
  const prevByKey = new Map<string, number>();
  if (storedFingerprint) {
    for (const part of storedFingerprint.split(";")) {
      if (!part) continue;
      const colon = part.indexOf(":");
      if (colon <= 0) continue;
      const key = part.slice(0, colon);
      const price = Number(part.slice(colon + 1));
      if (key && Number.isFinite(price)) prevByKey.set(key, price);
    }
  }

  const changed: ShopMarketListing[] = [];
  for (const listing of next.listings) {
    if (!listing.available || listing.price === null) continue;
    const prevPrice = prevByKey.get(listing.categoryKey);
    if (prevPrice === undefined || prevPrice !== listing.price) {
      changed.push(listing);
    }
  }

  return changed.sort((a, b) =>
    a.categoryKey.localeCompare(b.categoryKey, undefined, { numeric: true }),
  );
}

function buildShopListingEmbed(
  event: ShopMarketEvent,
  listings: ShopMarketListing[],
  options: { footerText: string },
): Record<string, unknown> | null {
  if (listings.length === 0) return null;
  const description = formatChangedListingLines(listings, SHOP_DISCORD_CURRENCY).trim();
  if (!description) return null;

  const buyUrl = resolveShopBuyUrl(event);
  const descriptionWithBuyLink = buyUrl
    ? `${description}\n\n[Click here to buy](${buyUrl})`
    : description;
  const embed: Record<string, unknown> = {
    title: shopMatchEmbedTitle(event),
    description: descriptionWithBuyLink.slice(0, 3900),
    color: SHOP_EMBED_COLOR_IN_STOCK,
    fields: [{ name: "Source", value: "🛒 Shop", inline: true }],
    footer: { text: options.footerText },
    timestamp: new Date().toISOString(),
  };
  if (buyUrl) {
    embed.url = buyUrl;
  } else {
    (embed.fields as Array<Record<string, unknown>>).push({
      name: "Buy",
      value: "Checkout link unavailable for this match",
      inline: false,
    });
  }
  return embed;
}

function buildShopDeltaEmbed(
  event: ShopMarketEvent,
  changedListings: ShopMarketListing[],
): Record<string, unknown> | null {
  return buildShopListingEmbed(event, changedListings, {
    footerText: "🛒 Shop · price/availability update",
  });
}

export function buildShopDeltaEmbeds(
  candidates: Array<{ event: ShopMarketEvent; changedListings: ShopMarketListing[] }>,
): Array<Record<string, unknown>> {
  const embeds: Array<Record<string, unknown>> = [];
  for (const { event, changedListings } of candidates) {
    const embed = buildShopDeltaEmbed(event, changedListings);
    if (!embed) continue;
    embeds.push(embed);
    if (embeds.length >= 10) break;
  }
  return embeds;
}

export async function sendShopDiscordPayload(input: {
  content: string;
  embeds: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  mode: "baseline" | "delta" | "heartbeat";
  matchCount: number;
  webhookUrl?: string | null;
}): Promise<ShopDiscordNotifyResult> {
  const provider = "discord-shop" as const;
  const webhookUrl = input.webhookUrl ?? (await resolveDiscordShopWebhookUrl());
  if (!webhookUrl) return { attempted: false, ok: false, provider };

  const body: Record<string, unknown> = { content: input.content, embeds: input.embeds };
  // Discord requires action rows at message level (sibling to embeds), not inside embeds.
  if (input.components !== undefined && input.components.length > 0) {
    body.components = input.components;
  }
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

/** One event per matchNum — last occurrence wins (defensive against duplicate inputs). */
export function dedupeShopEventsByMatchNum(events: ShopMarketEvent[]): ShopMarketEvent[] {
  const map = new Map<number, ShopMarketEvent>();
  for (const event of events) {
    map.set(event.matchNum, event);
  }
  return [...map.values()].sort((a, b) => a.matchNum - b.matchNum);
}

function deltaEventsForNotify(
  candidates: Array<{ event: ShopMarketEvent; changedListings: ShopMarketListing[] }>,
): Array<{ event: ShopMarketEvent; changedListings: ShopMarketListing[] }> {
  const out: Array<{ event: ShopMarketEvent; changedListings: ShopMarketListing[] }> = [];
  const seen = new Set<number>();
  for (const candidate of candidates) {
    const { event, changedListings } = candidate;
    if (seen.has(event.matchNum)) continue;
    if (changedListings.length === 0) continue;
    if (!buildShopDeltaEmbed(event, changedListings)) continue;
    seen.add(event.matchNum);
    out.push(candidate);
    if (out.length >= 10) break;
  }
  return out.sort((a, b) => a.event.matchNum - b.event.matchNum);
}

export async function sendOneShopListingToDiscord(
  event: ShopMarketEvent,
  options: {
    listings: ShopMarketListing[];
    mode: "delta" | "heartbeat";
    footerText: string;
    webhookUrl?: string | null;
  },
): Promise<ShopDiscordNotifyResult> {
  const embed = buildShopListingEmbed(event, options.listings, { footerText: options.footerText });
  if (!embed) {
    return { attempted: false, ok: true, provider: "discord-shop", mode: options.mode, matchCount: 0 };
  }
  const buyUrl = resolveShopBuyUrl(event);
  const matchLabel = event.catalogue.matchLabel ?? `Match${event.matchNum}`;
  const webhookUrl =
    options.webhookUrl ??
    (await resolveDiscordShopWebhookUrlForEvent(matchLabel, event.catalogue.eventName));
  return sendShopDiscordPayload({
    content: "",
    embeds: [embed],
    components: buildShopBuyNowComponents(buyUrl),
    mode: options.mode,
    matchCount: 1,
    webhookUrl,
  });
}

export async function sendOneShopDeltaToDiscord(
  event: ShopMarketEvent,
  options: { changedListings: ShopMarketListing[] },
): Promise<ShopDiscordNotifyResult> {
  return sendOneShopListingToDiscord(event, {
    listings: options.changedListings,
    mode: "delta",
    footerText: "🛒 Shop · price/availability update",
  });
}

async function sendShopBaselineBatchToWebhook(
  events: ShopMarketEvent[],
  webhookUrl: string | null,
  options: { dedicatedMatchNum?: number; variant?: "baseline" | "refresh" },
): Promise<ShopDiscordNotifyResult[]> {
  if (!webhookUrl || events.length === 0) return [];
  const variant = options.variant ?? "baseline";
  const sorted = [...events].sort((a, b) => a.matchNum - b.matchNum);
  const batches = chunk(sorted, 12);
  const hasAnyStock = sorted.some((e) => availableListings(e).length > 0);
  const dedicatedMatchNum = options.dedicatedMatchNum;
  const results: ShopDiscordNotifyResult[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const title = (() => {
      if (variant === "refresh") {
        if (dedicatedMatchNum) {
          return i === 0
            ? `🛒 SHOP — Match ${dedicatedMatchNum} · current listings`
            : `🛒 SHOP — Match ${dedicatedMatchNum} · current listings (cont. ${i + 1})`;
        }
        return i === 0 ? "🛒 SHOP — Current listings" : `🛒 SHOP — Current listings (cont. ${i + 1})`;
      }
      if (dedicatedMatchNum) {
        return i === 0
          ? `🛒 SHOP — Match ${dedicatedMatchNum} snapshot`
          : `🛒 SHOP — Match ${dedicatedMatchNum} snapshot (cont. ${i + 1})`;
      }
      return i === 0 ? "🛒 SHOP — Full marketplace snapshot" : `🛒 SHOP snapshot (cont. ${i + 1})`;
    })();
    const content = (() => {
      if (variant === "refresh") {
        if (dedicatedMatchNum) {
          return i === 0 ? `**SHOP** — Latest listings · M${dedicatedMatchNum}` : "";
        }
        return i === 0 ? "**SHOP** — Latest listings (refresh)" : "";
      }
      if (dedicatedMatchNum) {
        return i === 0 ? `**SHOP** — Match ${dedicatedMatchNum} initial listing dump` : "";
      }
      return i === 0 ? "**SHOP** — Initial full listing dump (all matches)" : "";
    })();
    const footer = (() => {
      if (variant === "refresh") {
        return dedicatedMatchNum
          ? { text: `🛒 Shop · Match ${dedicatedMatchNum} · listing refresh` }
          : { text: `🛒 Shop · listing refresh · Matches ${batch[0]?.matchNum}–${batch[batch.length - 1]?.matchNum}` };
      }
      return dedicatedMatchNum
        ? { text: `🛒 Shop · Match ${dedicatedMatchNum} baseline` }
        : { text: `🛒 Shop · Matches ${batch[0]?.matchNum}–${batch[batch.length - 1]?.matchNum}` };
    })();
    const embed = {
      title,
      description: batch.map((e) => matchSummaryLine(e, true)).join("\n").slice(0, 3900),
      color: hasAnyStock ? SHOP_EMBED_COLOR_IN_STOCK : SHOP_EMBED_COLOR_NO_STOCK,
      footer,
    };
    const res = await sendShopDiscordPayload({
      content,
      embeds: [embed],
      components: batch.length === 1 ? buildShopBuyNowComponents(resolveShopBuyUrl(batch[0])) : undefined,
      mode: variant === "refresh" ? "heartbeat" : "baseline",
      matchCount: events.length,
      webhookUrl,
    });
    results.push(res);
    if (!res.ok) break;
  }
  return results;
}

/** Baseline may require multiple Discord messages (embed limit). Dedicated matches route to their webhooks. */
export async function sendShopBaselineToDiscord(events: ShopMarketEvent[]): Promise<ShopDiscordNotifyResult[]> {
  const sorted = dedupeShopEventsByMatchNum(events);
  const generalEvents = sorted.filter((e) => !isDedicatedMatchShopWebhook(e.matchNum));
  const generalWebhook = await resolveDiscordShopWebhookUrl();
  const results: ShopDiscordNotifyResult[] = [];

  if (generalEvents.length > 0) {
    results.push(...(await sendShopBaselineBatchToWebhook(generalEvents, generalWebhook, {})));
    if (results.some((r) => r.attempted && !r.ok)) return results;
  }

  for (const matchNum of DEDICATED_SHOP_ROUTING_MATCHES) {
    const dedicatedEvents = sorted.filter((e) => e.matchNum === matchNum);
    if (dedicatedEvents.length === 0) continue;
    const webhook = await resolveDedicatedMatchWebhookUrl(matchNum);
    results.push(
      ...(await sendShopBaselineBatchToWebhook(dedicatedEvents, webhook, { dedicatedMatchNum: matchNum })),
    );
    if (results.some((r) => r.attempted && !r.ok)) return results;
  }

  return results;
}

/** Re-post current in-stock listings (same per-match format as deltas) when prices are unchanged. */
export async function sendShopListingRefreshToDiscord(input: {
  events: ShopMarketEvent[];
  webhookUrl: string;
  dedicatedMatchNum?: number;
}): Promise<ShopDiscordNotifyResult[]> {
  const sorted = dedupeShopEventsByMatchNum(input.events);
  if (sorted.length === 0) {
    return [{ attempted: false, ok: true, provider: "discord-shop", mode: "heartbeat", matchCount: 0 }];
  }

  const footerText = input.dedicatedMatchNum
    ? `🛒 Shop · Match ${input.dedicatedMatchNum} · listing refresh`
    : "🛒 Shop · listing refresh";

  const results: ShopDiscordNotifyResult[] = [];
  for (const event of sorted) {
    if (event.availableCount <= 0) continue;
    const listings = resolveShopDiscordDisplayListings(event);
    if (listings.length === 0) continue;

    const result = await sendOneShopListingToDiscord(event, {
      listings,
      mode: "heartbeat",
      footerText,
      webhookUrl: input.webhookUrl,
    });
    results.push(result);
    if (result.attempted && !result.ok) break;
  }

  if (results.length === 0) {
    return [{ attempted: false, ok: true, provider: "discord-shop", mode: "heartbeat", matchCount: 0 }];
  }
  return results;
}

/** Legacy batch path — prefer sendHardenedShopDelta. Never adds a summary content header. */
export async function sendShopDeltaToDiscord(
  candidates: Array<{ event: ShopMarketEvent; changedListings: ShopMarketListing[] }>,
): Promise<ShopDiscordNotifyResult[]> {
  const notifyCandidates = deltaEventsForNotify(candidates);
  if (notifyCandidates.length === 0) {
    return [{ attempted: false, ok: true, provider: "discord-shop", mode: "delta", matchCount: 0 }];
  }
  const results: ShopDiscordNotifyResult[] = [];
  for (let i = 0; i < notifyCandidates.length; i++) {
    const { event, changedListings } = notifyCandidates[i];
    const res = await sendOneShopDeltaToDiscord(event, { changedListings });
    results.push(res);
    if (!res.ok) break;
  }
  return results;
}
