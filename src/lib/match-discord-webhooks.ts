import "server-only";

import {
  DEDICATED_SHOP_ROUTING_MATCHES,
  isDedicatedMatchShopWebhook,
  isDedicatedMatchWebhook,
  type DedicatedMatchWebhookNumber,
} from "@/lib/dedicated-match-webhooks";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { prisma } from "@/lib/prisma";
import { SHOP_MATCH_COUNT } from "@/lib/shop-match-grid";
import { isDiscordWebhookUrl, maskWebhookUrl } from "@/lib/webhook-settings";

export type MatchDiscordWebhookRow = {
  matchNum: number;
  resaleWebhookUrl: string | null;
  shopWebhookUrl: string | null;
  resaleWebhookUrlMasked: string | null;
  shopWebhookUrlMasked: string | null;
  eventName: string;
  matchLabel: string;
  channelSlug: string;
};

export type MatchDiscordWebhookUpsert = {
  matchNum: number;
  resaleWebhookUrl?: string | null;
  shopWebhookUrl?: string | null;
};

const SETTINGS_ID = 1;

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

function normalizeWebhookUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function assertValidWebhookUrl(url: string | null): void {
  if (url && !isDiscordWebhookUrl(url)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
}

/** Suggested Discord channel slug, e.g. "France vs Senegal" → "france-vs-senegal". */
export function eventNameToChannelSlug(name: string): string {
  let text = name.trim();
  text = text.replace(/^match\s*\d+\s*[—–\-:|]\s*/i, "");
  text = text.replace(/^match\s*\d+\s+/i, "");
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

type WebhookMap = Map<number, { resale: string | null; shop: string | null }>;

let cachedMap: { at: number; map: WebhookMap } | null = null;
const CACHE_MS = 3_000;

function invalidateMatchWebhookCache(): void {
  cachedMap = null;
}

async function readSettingsRow() {
  try {
    return await prisma.appWebhookSettings.findUnique({ where: { id: SETTINGS_ID } });
  } catch {
    return null;
  }
}

function legacyResaleUrlFromSettings(
  matchNum: number,
  row: Awaited<ReturnType<typeof readSettingsRow>>,
): string | null {
  if (!isDedicatedMatchWebhook(matchNum)) return null;
  switch (matchNum as DedicatedMatchWebhookNumber) {
    case 1:
      return normalizeWebhookUrl(row?.discordMatch1WebhookUrl) || envTrim("DISCORD_MATCH1_WEBHOOK_URL") || null;
    case 3:
      return (
        normalizeWebhookUrl(row?.discordMatch3ResaleWebhookUrl) ||
        envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL") ||
        null
      );
    case 4:
      return (
        normalizeWebhookUrl(row?.discordMatch4ResaleWebhookUrl) ||
        envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL") ||
        null
      );
    case 5:
      return normalizeWebhookUrl(row?.discordMatch5WebhookUrl) || envTrim("DISCORD_MATCH5_WEBHOOK_URL") || null;
    case 7:
      return normalizeWebhookUrl(row?.discordMatch7WebhookUrl) || envTrim("DISCORD_MATCH7_WEBHOOK_URL") || null;
  }
}

function legacyShopUrlFromSettings(
  matchNum: number,
  row: Awaited<ReturnType<typeof readSettingsRow>>,
): string | null {
  if (!isDedicatedMatchShopWebhook(matchNum)) return null;
  switch (matchNum) {
    case 1:
      return normalizeWebhookUrl(row?.discordMatch1WebhookUrl) || envTrim("DISCORD_MATCH1_WEBHOOK_URL") || null;
    case 5:
      return normalizeWebhookUrl(row?.discordMatch5WebhookUrl) || envTrim("DISCORD_MATCH5_WEBHOOK_URL") || null;
    case 7:
      return normalizeWebhookUrl(row?.discordMatch7WebhookUrl) || envTrim("DISCORD_MATCH7_WEBHOOK_URL") || null;
  }
  return null;
}

async function loadWebhookMap(): Promise<WebhookMap> {
  const now = Date.now();
  if (cachedMap && now - cachedMap.at < CACHE_MS) {
    return cachedMap.map;
  }

  const map: WebhookMap = new Map();
  const row = await readSettingsRow();
  const dbMatchNums = new Set<number>();

  try {
    const dbRows = await prisma.matchDiscordWebhook.findMany({
      select: { matchNum: true, resaleWebhookUrl: true, shopWebhookUrl: true },
    });
    for (const r of dbRows) {
      dbMatchNums.add(r.matchNum);
      map.set(r.matchNum, {
        resale: normalizeWebhookUrl(r.resaleWebhookUrl),
        shop: normalizeWebhookUrl(r.shopWebhookUrl),
      });
    }
  } catch {
    /* table may not exist yet */
  }

  for (let m = 1; m <= SHOP_MATCH_COUNT; m++) {
    const existing = map.get(m) ?? { resale: null, shop: null };
    if (!dbMatchNums.has(m)) {
      if (!existing.resale) {
        existing.resale = legacyResaleUrlFromSettings(m, row);
      }
      if (!existing.shop) {
        existing.shop = legacyShopUrlFromSettings(m, row);
      }
    }
    map.set(m, existing);
  }

  cachedMap = { at: now, map };
  return map;
}

/** Per-match resale webhook only (no general fallback). */
export async function resolveMatchResaleWebhookUrlDedicatedOnly(matchNum: number): Promise<string | null> {
  if (!Number.isInteger(matchNum) || matchNum < 1 || matchNum > SHOP_MATCH_COUNT) return null;
  const map = await loadWebhookMap();
  return map.get(matchNum)?.resale ?? null;
}

/** Per-match shop/LMS webhook only (no general fallback). */
export async function resolveMatchShopWebhookUrlDedicatedOnly(matchNum: number): Promise<string | null> {
  if (!Number.isInteger(matchNum) || matchNum < 1 || matchNum > SHOP_MATCH_COUNT) return null;
  const map = await loadWebhookMap();
  return map.get(matchNum)?.shop ?? null;
}

export async function listMatchNumsWithPerMatchResaleWebhook(): Promise<number[]> {
  const map = await loadWebhookMap();
  const out: number[] = [];
  for (let m = 1; m <= SHOP_MATCH_COUNT; m++) {
    if (map.get(m)?.resale) out.push(m);
  }
  return out;
}

export async function listMatchNumsWithPerMatchShopWebhook(): Promise<number[]> {
  const map = await loadWebhookMap();
  const out: number[] = [];
  for (let m = 1; m <= SHOP_MATCH_COUNT; m++) {
    if (map.get(m)?.shop) out.push(m);
  }
  return out;
}

export async function hasAnyPerMatchResaleWebhookConfigured(): Promise<boolean> {
  return (await listMatchNumsWithPerMatchResaleWebhook()).length > 0;
}

export async function hasAnyPerMatchShopWebhookConfigured(): Promise<boolean> {
  return (await listMatchNumsWithPerMatchShopWebhook()).length > 0;
}

export function parseEventMatchNumFromLabels(
  matchLabel: string | null | undefined,
  name: string,
): number | null {
  return parseEventMatchNumber(matchLabel?.trim() || "", name);
}

async function loadEventMetaByMatchNum(): Promise<Map<number, { name: string; matchLabel: string }>> {
  const out = new Map<number, { name: string; matchLabel: string }>();
  try {
    const events = await prisma.event.findMany({
      select: { matchLabel: true, name: true },
    });
    for (const ev of events) {
      const matchNum = parseEventMatchNumber(ev.matchLabel, ev.name);
      if (matchNum == null) continue;
      out.set(matchNum, { name: ev.name, matchLabel: ev.matchLabel });
    }
  } catch {
    /* best-effort */
  }
  return out;
}

export async function listMatchDiscordWebhookRows(): Promise<MatchDiscordWebhookRow[]> {
  const map = await loadWebhookMap();
  const eventMeta = await loadEventMetaByMatchNum();
  const rows: MatchDiscordWebhookRow[] = [];

  for (let matchNum = 1; matchNum <= SHOP_MATCH_COUNT; matchNum++) {
    const urls = map.get(matchNum) ?? { resale: null, shop: null };
    const meta = eventMeta.get(matchNum);
    const eventName = meta?.name ?? `Match ${matchNum}`;
    const matchLabel = meta?.matchLabel ?? `Match ${matchNum}`;
    rows.push({
      matchNum,
      resaleWebhookUrl: urls.resale,
      shopWebhookUrl: urls.shop,
      resaleWebhookUrlMasked: urls.resale ? maskWebhookUrl(urls.resale) : null,
      shopWebhookUrlMasked: urls.shop ? maskWebhookUrl(urls.shop) : null,
      eventName,
      matchLabel,
      channelSlug: eventNameToChannelSlug(eventName),
    });
  }

  return rows;
}

async function resetResaleNotifyStateForMatch(matchNum: number): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.resaleDiscordMatchNotifyState.deleteMany({ where: { matchNum } });
      await tx.resaleDiscordMatchNotifyLog.deleteMany({ where: { matchNum } });
    });
  } catch {
    /* best-effort */
  }
}

export async function onMatchDiscordWebhookUrlChanged(input: {
  matchNum: number;
  kind: "resale" | "shop";
  previousUrl: string | null;
  nextUrl: string | null;
}): Promise<void> {
  const urlChanged = (input.previousUrl ?? "") !== (input.nextUrl ?? "");
  if (!urlChanged) return;
  invalidateMatchWebhookCache();

  if (input.kind === "resale" && input.nextUrl) {
    await resetResaleNotifyStateForMatch(input.matchNum);
  }

  if (input.kind === "shop" && input.nextUrl) {
    const { clearMatchShopDiscordBaselineSent, clearMatchShopDiscordLastHeartbeatAt } =
      await import("@/lib/webhook-settings");
    await clearMatchShopDiscordBaselineSent(input.matchNum);
    await clearMatchShopDiscordLastHeartbeatAt(input.matchNum);
  }
}

export async function upsertMatchDiscordWebhooks(
  items: MatchDiscordWebhookUpsert[],
): Promise<{ updated: number }> {
  let updated = 0;

  for (const item of items) {
    if (!Number.isInteger(item.matchNum) || item.matchNum < 1 || item.matchNum > SHOP_MATCH_COUNT) {
      throw new Error(`Invalid matchNum: ${item.matchNum}`);
    }

    const existing = await prisma.matchDiscordWebhook.findUnique({
      where: { matchNum: item.matchNum },
    });

    const nextResale =
      "resaleWebhookUrl" in item
        ? normalizeWebhookUrl(item.resaleWebhookUrl ?? null)
        : normalizeWebhookUrl(existing?.resaleWebhookUrl);
    const nextShop =
      "shopWebhookUrl" in item
        ? normalizeWebhookUrl(item.shopWebhookUrl ?? null)
        : normalizeWebhookUrl(existing?.shopWebhookUrl);

    assertValidWebhookUrl(nextResale);
    assertValidWebhookUrl(nextShop);

    const prevResale = normalizeWebhookUrl(existing?.resaleWebhookUrl);
    const prevShop = normalizeWebhookUrl(existing?.shopWebhookUrl);

    if (!existing && !nextResale && !nextShop) continue;

    await prisma.matchDiscordWebhook.upsert({
      where: { matchNum: item.matchNum },
      create: {
        matchNum: item.matchNum,
        resaleWebhookUrl: nextResale,
        shopWebhookUrl: nextShop,
      },
      update: {
        resaleWebhookUrl: "resaleWebhookUrl" in item ? nextResale : undefined,
        shopWebhookUrl: "shopWebhookUrl" in item ? nextShop : undefined,
      },
    });

    if ("resaleWebhookUrl" in item) {
      await onMatchDiscordWebhookUrlChanged({
        matchNum: item.matchNum,
        kind: "resale",
        previousUrl: prevResale,
        nextUrl: nextResale,
      });
    }
    if ("shopWebhookUrl" in item) {
      await onMatchDiscordWebhookUrlChanged({
        matchNum: item.matchNum,
        kind: "shop",
        previousUrl: prevShop,
        nextUrl: nextShop,
      });
    }

    updated += 1;
  }

  invalidateMatchWebhookCache();
  return { updated };
}

/** @deprecated Use listMatchNumsWithPerMatchShopWebhook */
export const LEGACY_DEDICATED_SHOP_MATCHES = DEDICATED_SHOP_ROUTING_MATCHES;
