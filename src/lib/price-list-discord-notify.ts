import "server-only";

import { amountRawToUsdString } from "@/lib/discord-webhook";
import { sockAmountToUsd } from "@/lib/format-usd";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { persistPriceListDiscordNotifyLog } from "@/lib/price-list-discord-log";
import { prisma } from "@/lib/prisma";
import { ensureAllShopMatches } from "@/lib/shop-match-grid";
import type { ShopMarketEvent } from "@/lib/shop-marketplace-types";
import { formatShopPrice } from "@/app/shop/shop-utils";
import {
  loadShopEventsFromDatabase,
  safeLoadShopEventMetaLookup,
} from "@/lib/shop-sync-service";
import { shopLog } from "@/lib/shop-service";
import {
  maskWebhookUrl,
  PRICE_LIST_DISCORD_HEARTBEAT_INTERVAL_MS,
  resolveDiscordPriceListWebhookUrl,
} from "@/lib/webhook-settings";

const PRICE_LIST_EMBED_COLOR = 0x6366f1;
const MAX_EMBED_DESCRIPTION = 3900;

export type PriceListResaleEntry = {
  matchNum: number;
  matchLabel: string;
  matchName: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatNumber: string;
  seatId: string;
  priceUsd: number;
};

export type PriceListShopEntry = {
  matchNum: number;
  matchLabel: string;
  matchName: string;
  categoryLabel: string;
  price: number;
  currency: string;
};

export type PriceListDiscordNotifyResult = {
  attempted: boolean;
  ok: boolean;
  provider: "discord-price-list";
  status?: number;
  error?: string;
  mode?: "baseline" | "delta" | "heartbeat";
  request?: {
    webhookUrlMasked: string;
    method: "POST";
    headers: Record<string, string>;
    body: unknown;
  };
  response?: { status: number; body: string };
};

export type PriceListDiscordNotifySummary = {
  attempted: boolean;
  ok: boolean;
  mode: "baseline" | "delta" | "heartbeat" | "skipped";
  results: PriceListDiscordNotifyResult[];
  resaleCount: number;
  shopCount: number;
  skipReason?: string;
};

const STATE_ID = 1;

function matchTitle(matchNum: number, matchLabel: string, matchName: string): string {
  const label = matchLabel.trim() || `Match ${matchNum}`;
  const name = matchName.trim();
  return name ? `${label} — ${name}` : label;
}

function formatResaleLine(entry: PriceListResaleEntry): string {
  const title = matchTitle(entry.matchNum, entry.matchLabel, entry.matchName);
  const cat = entry.categoryName.trim() || "—";
  const price = amountRawToUsdString(Math.round(entry.priceUsd * 1000));
  return `• ${title} — ${cat} — Block ${entry.blockName} Row ${entry.row} Seat ${entry.seatNumber} — ${price}`;
}

function formatShopLine(entry: PriceListShopEntry): string {
  const title = matchTitle(entry.matchNum, entry.matchLabel, entry.matchName);
  const price = formatShopPrice(entry.price, entry.currency);
  return `• ${title} — ${entry.categoryLabel} — ${price}`;
}

export function priceListNotifyFingerprint(
  resale: PriceListResaleEntry[],
  shop: PriceListShopEntry[],
): string {
  const resaleParts = [...resale]
    .sort((a, b) => a.priceUsd - b.priceUsd || a.seatId.localeCompare(b.seatId))
    .map((e) => `R:${e.matchNum}:${e.seatId}:${e.priceUsd.toFixed(2)}`);
  const shopParts = [...shop]
    .sort(
      (a, b) =>
        a.price - b.price ||
        a.matchNum - b.matchNum ||
        a.categoryLabel.localeCompare(b.categoryLabel, undefined, { numeric: true }),
    )
    .map((e) => `S:${e.matchNum}:${e.categoryLabel}:${e.price}`);
  return [...resaleParts, ...shopParts].join(";");
}

export async function gatherResalePriceEntries(): Promise<PriceListResaleEntry[]> {
  const rows = await prisma.sockAvailable.findMany({
    where: { kind: "RESALE" },
    select: {
      seatId: true,
      blockName: true,
      row: true,
      seatNumber: true,
      categoryName: true,
      amount: true,
      event: { select: { matchLabel: true, name: true } },
    },
  });

  const out: PriceListResaleEntry[] = [];
  for (const row of rows) {
    const amountStr = row.amount != null ? String(row.amount) : null;
    const priceUsd = sockAmountToUsd(amountStr);
    if (priceUsd === null) continue;
    const matchNum = parseEventMatchNumber(row.event.matchLabel ?? "", row.event.name) ?? 0;
    out.push({
      matchNum,
      matchLabel: row.event.matchLabel?.trim() || (matchNum > 0 ? `Match ${matchNum}` : "Match ?"),
      matchName: row.event.name,
      categoryName: row.categoryName,
      blockName: row.blockName,
      row: row.row,
      seatNumber: row.seatNumber,
      seatId: row.seatId,
      priceUsd,
    });
  }
  return out.sort((a, b) => a.priceUsd - b.priceUsd || a.seatId.localeCompare(b.seatId));
}

export function gatherShopPriceEntries(events: ShopMarketEvent[]): PriceListShopEntry[] {
  const out: PriceListShopEntry[] = [];
  for (const event of events) {
    const matchLabel = event.catalogue.matchLabel?.trim() || `Match ${event.matchNum}`;
    const matchName = event.catalogue.eventName;
    for (const listing of event.listings) {
      if (!listing.available || listing.price === null) continue;
      out.push({
        matchNum: event.matchNum,
        matchLabel,
        matchName,
        categoryLabel: listing.categoryLabel,
        price: listing.price,
        currency: event.currency,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.price - b.price ||
      a.matchNum - b.matchNum ||
      a.categoryLabel.localeCompare(b.categoryLabel, undefined, { numeric: true }),
  );
}

function chunkLines(lines: string[], maxChars: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    const add = (current.length > 0 ? 1 : 0) + line.length;
    if (current.length > 0 && size + add > maxChars) {
      batches.push(current);
      current = [line];
      size = line.length;
    } else {
      current.push(line);
      size += add;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function buildSectionBlocks(
  header: string,
  lines: string[],
  emptyLabel: string,
): string[] {
  if (lines.length === 0) return [`${header}\n_${emptyLabel}_`];
  const batches = chunkLines(lines, MAX_EMBED_DESCRIPTION - header.length - 2);
  return batches.map((batch, idx) => {
    const title = idx === 0 ? header : `${header} (cont. ${idx + 1})`;
    return `${title}\n${batch.join("\n")}`;
  });
}

export function buildPriceListEmbeds(input: {
  resale: PriceListResaleEntry[];
  shop: PriceListShopEntry[];
  mode: "baseline" | "delta" | "heartbeat";
}): Array<Record<string, unknown>> {
  const resaleLines = input.resale.map(formatResaleLine);
  const shopLines = input.shop.map(formatShopLine);

  const resaleBlocks = buildSectionBlocks(
    "🔵 RESALE (cheapest → priciest)",
    resaleLines,
    "no resale listings",
  );
  const shopBlocks = buildSectionBlocks(
    "🛒 SHOP (cheapest → priciest)",
    shopLines,
    "no shop listings",
  );

  const descriptions = [...resaleBlocks, ...shopBlocks];
  const modeLabel =
    input.mode === "baseline"
      ? "Full price list"
      : input.mode === "heartbeat"
        ? "Price list (unchanged)"
        : "Price list update";

  return descriptions.map((description, idx) => ({
    title: idx === 0 ? "📋 Combined price list" : `📋 Combined price list (cont. ${idx + 1})`,
    description: description.slice(0, MAX_EMBED_DESCRIPTION),
    color: PRICE_LIST_EMBED_COLOR,
    footer: { text: `${modeLabel} · resale ${input.resale.length} · shop ${input.shop.length}` },
    timestamp: idx === 0 ? new Date().toISOString() : undefined,
  }));
}

function heartbeatContent(mode: "baseline" | "delta" | "heartbeat"): string {
  if (mode === "heartbeat") return "**Price list** — No changes (last 30+ min)";
  if (mode === "baseline") return "**Price list** — Initial snapshot";
  return "**Price list** — Prices updated";
}

async function loadStoredFingerprint(): Promise<{
  fingerprint: string | null;
  lastHeartbeatAt: Date | null;
}> {
  try {
    const row = await prisma.priceListDiscordNotifyState.findUnique({ where: { id: STATE_ID } });
    return {
      fingerprint: row?.lastDiscordNotifyFingerprint ?? null,
      lastHeartbeatAt: row?.lastHeartbeatAt ?? null,
    };
  } catch {
    return { fingerprint: null, lastHeartbeatAt: null };
  }
}

async function persistNotifyState(fingerprint: string): Promise<void> {
  const now = new Date();
  await prisma.priceListDiscordNotifyState.upsert({
    where: { id: STATE_ID },
    create: {
      id: STATE_ID,
      lastDiscordNotifyFingerprint: fingerprint,
      lastHeartbeatAt: now,
    },
    update: {
      lastDiscordNotifyFingerprint: fingerprint,
      lastHeartbeatAt: now,
    },
  });
}

function shouldSendHeartbeat(lastHeartbeatAt: Date | null): boolean {
  if (!lastHeartbeatAt) return true;
  return Date.now() - lastHeartbeatAt.getTime() >= PRICE_LIST_DISCORD_HEARTBEAT_INTERVAL_MS;
}

async function sendPriceListDiscordPayload(input: {
  content: string;
  embeds: Array<Record<string, unknown>>;
  mode: "baseline" | "delta" | "heartbeat";
  webhookUrl: string;
}): Promise<PriceListDiscordNotifyResult> {
  const provider = "discord-price-list" as const;
  const body: Record<string, unknown> = { content: input.content, embeds: input.embeds };
  const requestMeta = {
    webhookUrlMasked: maskWebhookUrl(input.webhookUrl),
    method: "POST" as const,
    headers: { "content-type": "application/json" },
    body,
  };

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15_000);
  try {
    const res = await fetch(input.webhookUrl, {
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
      error: msg.slice(0, 240),
      request: requestMeta,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPriceListMessages(input: {
  resale: PriceListResaleEntry[];
  shop: PriceListShopEntry[];
  mode: "baseline" | "delta" | "heartbeat";
  webhookUrl: string;
}): Promise<PriceListDiscordNotifyResult[]> {
  const embeds = buildPriceListEmbeds(input);
  const batches: Array<Record<string, unknown>[]> = [];
  for (let i = 0; i < embeds.length; i += 10) {
    batches.push(embeds.slice(i, i + 10));
  }

  const results: PriceListDiscordNotifyResult[] = [];
  for (let i = 0; i < batches.length; i++) {
    const result = await sendPriceListDiscordPayload({
      content: i === 0 ? heartbeatContent(input.mode) : "",
      embeds: batches[i],
      mode: input.mode,
      webhookUrl: input.webhookUrl,
    });
    results.push(result);
    if (!result.ok) break;
  }
  return results;
}

async function resolveShopEvents(shopEvents?: ShopMarketEvent[]): Promise<ShopMarketEvent[]> {
  if (shopEvents && shopEvents.length > 0) {
    return ensureAllShopMatches(shopEvents);
  }
  const metaByMatch = await safeLoadShopEventMetaLookup();
  return ensureAllShopMatches(await loadShopEventsFromDatabase(metaByMatch), metaByMatch);
}

async function finishNotify(summary: PriceListDiscordNotifySummary): Promise<PriceListDiscordNotifySummary> {
  await persistPriceListDiscordNotifyLog(summary);
  return summary;
}

export async function maybeNotifyPriceListDiscord(input?: {
  shopEvents?: ShopMarketEvent[];
  forceBaseline?: boolean;
}): Promise<PriceListDiscordNotifySummary> {
  const webhookUrl = await resolveDiscordPriceListWebhookUrl();
  if (!webhookUrl) {
    shopLog("Discord price list skip (no webhook configured)");
    return finishNotify({
      attempted: false,
      ok: false,
      mode: "skipped",
      results: [],
      resaleCount: 0,
      shopCount: 0,
      skipReason: "no_webhook_url",
    });
  }

  const resale = await gatherResalePriceEntries();
  const shopEvents = await resolveShopEvents(input?.shopEvents);
  const shop = gatherShopPriceEntries(shopEvents);
  const fingerprint = priceListNotifyFingerprint(resale, shop);
  const stored = await loadStoredFingerprint();

  let mode: "baseline" | "delta" | "heartbeat";
  if (input?.forceBaseline || stored.fingerprint === null) {
    mode = "baseline";
  } else if (fingerprint !== stored.fingerprint) {
    mode = "delta";
  } else if (shouldSendHeartbeat(stored.lastHeartbeatAt)) {
    mode = "heartbeat";
  } else {
    shopLog("Discord price list skip (fingerprint unchanged, heartbeat not due)");
    return finishNotify({
      attempted: false,
      ok: true,
      mode: "skipped",
      results: [],
      resaleCount: resale.length,
      shopCount: shop.length,
      skipReason: "no_fingerprint_changes",
    });
  }

  shopLog(`Discord price list ${mode} send (resale ${resale.length}, shop ${shop.length})`);
  const results = await sendPriceListMessages({ resale, shop, mode, webhookUrl });
  const attempted = results.some((r) => r.attempted);
  const ok = results.length > 0 && results.every((r) => r.ok || !r.attempted);

  if (attempted && ok) {
    await persistNotifyState(fingerprint);
  }

  shopLog(`Discord price list ${mode} ${ok ? "OK" : "failed"}`);
  return finishNotify({
    attempted,
    ok,
    mode,
    results,
    resaleCount: resale.length,
    shopCount: shop.length,
  });
}

export async function sendPriceListBaselineNow(): Promise<PriceListDiscordNotifySummary> {
  return maybeNotifyPriceListDiscord({ forceBaseline: true });
}
