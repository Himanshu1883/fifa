import "server-only";

import {
  DEDICATED_MATCH_WEBHOOK_NUMBERS,
  DEDICATED_SHOP_ROUTING_MATCHES,
  isDedicatedMatchShopWebhook,
  isDedicatedMatchWebhook,
  parseDedicatedMatchNumber,
  type DedicatedMatchWebhookNumber,
  type DedicatedShopMatchNumber,
} from "@/lib/dedicated-match-webhooks";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const SETTINGS_ID = 1;

export type WebhookUrlSource = "db" | "env" | null;

export type AppWebhookSettingsView = {
  discordNewListingsWebhookUrl: string | null;
  discordNewListingsWebhookUrlMasked: string | null;
  discordNewListingsWebhookSource: WebhookUrlSource;
  discordMatch1WebhookUrl: string | null;
  discordMatch1WebhookUrlMasked: string | null;
  discordMatch1WebhookSource: WebhookUrlSource;
  discordMatch3ResaleWebhookUrl: string | null;
  discordMatch3ResaleWebhookUrlMasked: string | null;
  discordMatch3ResaleWebhookSource: WebhookUrlSource;
  discordMatch4ResaleWebhookUrl: string | null;
  discordMatch4ResaleWebhookUrlMasked: string | null;
  discordMatch4ResaleWebhookSource: WebhookUrlSource;
  discordMatch5WebhookUrl: string | null;
  discordMatch5WebhookUrlMasked: string | null;
  discordMatch5WebhookSource: WebhookUrlSource;
  discordMatch7WebhookUrl: string | null;
  discordMatch7WebhookUrlMasked: string | null;
  discordMatch7WebhookSource: WebhookUrlSource;
  discordShopWebhookUrl: string | null;
  discordShopWebhookUrlMasked: string | null;
  discordShopWebhookSource: WebhookUrlSource;
  discordPriceListWebhookUrl: string | null;
  discordPriceListWebhookUrlMasked: string | null;
  discordPriceListWebhookSource: WebhookUrlSource;
  shopDiscordBaselineSentAt: string | null;
  updatedAt: string | null;
};

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

export function isDiscordWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      (u.hostname === "discord.com" || u.hostname === "discordapp.com") &&
      u.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

export function maskWebhookUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const token = segments[segments.length - 1];
    if (token && token.length > 10) {
      segments[segments.length - 1] = `${token.slice(0, 4)}…${token.slice(-4)}`;
      u.pathname = `/${segments.join("/")}`;
    }
    return u.toString();
  } catch {
    return "(invalid url)";
  }
}

async function readSettingsRow() {
  try {
    return await prisma.appWebhookSettings.findUnique({ where: { id: SETTINGS_ID } });
  } catch {
    return null;
  }
}

type DedicatedShopBaselinesSent = Partial<Record<string, string>>;

function parseDedicatedShopBaselinesSent(raw: unknown): DedicatedShopBaselinesSent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DedicatedShopBaselinesSent = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

type DedicatedShopLastHeartbeatAt = Partial<Record<string, string>>;

function parseDedicatedShopLastHeartbeatAt(raw: unknown): DedicatedShopLastHeartbeatAt {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DedicatedShopLastHeartbeatAt = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

function dedicatedLastHeartbeatJson(map: DedicatedShopLastHeartbeatAt): Prisma.InputJsonValue {
  return map as Prisma.InputJsonValue;
}

/** Default 12 min — resend full shop listings when prices unchanged (override via SHOP_DISCORD_HEARTBEAT_INTERVAL_MINUTES). */
export function shopDiscordHeartbeatIntervalMs(): number {
  const fromEnv = Number(process.env.SHOP_DISCORD_HEARTBEAT_INTERVAL_MINUTES);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv * 60 * 1000;
  }
  return 12 * 60 * 1000;
}

/** @deprecated Use shopDiscordHeartbeatIntervalMs() — kept for imports that read the constant at module load. */
export const SHOP_DISCORD_HEARTBEAT_INTERVAL_MS = 12 * 60 * 1000;

/** Combined resale+shop price list webhook heartbeat when fingerprint is unchanged. */
export const PRICE_LIST_DISCORD_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

export type ShopDiscordWebhookHeartbeatTarget = "general" | DedicatedShopMatchNumber;

export async function getShopDiscordLastHeartbeatAt(
  target: ShopDiscordWebhookHeartbeatTarget,
): Promise<Date | null> {
  const row = await readSettingsRow();
  if (!row) return null;
  if (target === "general") {
    return row.shopDiscordLastHeartbeatAt ?? null;
  }
  const map = parseDedicatedShopLastHeartbeatAt(row.dedicatedShopDiscordLastHeartbeatAt);
  const iso = map[String(target)];
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function shouldSendShopDiscordHeartbeat(
  target: ShopDiscordWebhookHeartbeatTarget,
): Promise<boolean> {
  const last = await getShopDiscordLastHeartbeatAt(target);
  if (!last) return true;
  return Date.now() - last.getTime() >= shopDiscordHeartbeatIntervalMs();
}

export async function markShopDiscordLastHeartbeatAt(
  target: ShopDiscordWebhookHeartbeatTarget,
): Promise<void> {
  const at = new Date();
  if (target === "general") {
    await prisma.appWebhookSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, shopDiscordLastHeartbeatAt: at },
      update: { shopDiscordLastHeartbeatAt: at },
    });
    return;
  }
  const row = await readSettingsRow();
  const map = parseDedicatedShopLastHeartbeatAt(row?.dedicatedShopDiscordLastHeartbeatAt);
  map[String(target)] = at.toISOString();
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      dedicatedShopDiscordLastHeartbeatAt: dedicatedLastHeartbeatJson(map),
    },
    update: { dedicatedShopDiscordLastHeartbeatAt: dedicatedLastHeartbeatJson(map) },
  });
}

async function clearDedicatedShopDiscordLastHeartbeatAt(
  matchNum: DedicatedShopMatchNumber,
): Promise<void> {
  const row = await readSettingsRow();
  const map = parseDedicatedShopLastHeartbeatAt(row?.dedicatedShopDiscordLastHeartbeatAt);
  if (!(String(matchNum) in map)) return;
  delete map[String(matchNum)];
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      dedicatedShopDiscordLastHeartbeatAt: dedicatedLastHeartbeatJson(map),
    },
    update: { dedicatedShopDiscordLastHeartbeatAt: dedicatedLastHeartbeatJson(map) },
  });
}

function dedicatedBaselinesSentJson(
  map: DedicatedShopBaselinesSent,
): Prisma.InputJsonValue {
  return map as Prisma.InputJsonValue;
}

export async function isDedicatedMatchShopDiscordBaselineSent(
  matchNum: DedicatedMatchWebhookNumber,
): Promise<boolean> {
  const row = await readSettingsRow();
  const sent = parseDedicatedShopBaselinesSent(row?.dedicatedShopDiscordBaselinesSent);
  return Boolean(sent[String(matchNum)]);
}

export async function markDedicatedMatchShopDiscordBaselineSent(
  matchNum: DedicatedShopMatchNumber,
): Promise<void> {
  const row = await readSettingsRow();
  const sent = parseDedicatedShopBaselinesSent(row?.dedicatedShopDiscordBaselinesSent);
  sent[String(matchNum)] = new Date().toISOString();
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      dedicatedShopDiscordBaselinesSent: dedicatedBaselinesSentJson(sent),
    },
    update: { dedicatedShopDiscordBaselinesSent: dedicatedBaselinesSentJson(sent) },
  });
}

export async function clearDedicatedMatchShopDiscordBaselineSent(
  matchNum: DedicatedShopMatchNumber,
): Promise<void> {
  const row = await readSettingsRow();
  const sent = parseDedicatedShopBaselinesSent(row?.dedicatedShopDiscordBaselinesSent);
  if (!(String(matchNum) in sent)) return;
  delete sent[String(matchNum)];
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      dedicatedShopDiscordBaselinesSent: dedicatedBaselinesSentJson(sent),
    },
    update: { dedicatedShopDiscordBaselinesSent: dedicatedBaselinesSentJson(sent) },
  });
}

async function resetDedicatedMatchNotifyStateOnWebhookChange(matchNum: number): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.resaleDiscordMatchNotifyState.deleteMany({ where: { matchNum } });
      await tx.resaleDiscordMatchNotifyLog.deleteMany({ where: { matchNum } });
    });
  } catch {
    // best-effort reset so resale baseline fires after webhook configure
  }
}

async function onDedicatedMatchWebhookUrlChanged(
  matchNum: DedicatedMatchWebhookNumber,
  previousUrl: string | null,
  nextUrl: string | null,
): Promise<void> {
  const urlChanged = (previousUrl ?? "") !== (nextUrl ?? "");
  if (!urlChanged) return;
  if (isDedicatedMatchShopWebhook(matchNum)) {
    await clearDedicatedMatchShopDiscordBaselineSent(matchNum);
    await clearDedicatedShopDiscordLastHeartbeatAt(matchNum);
  }
  if (nextUrl) {
    await resetDedicatedMatchNotifyStateOnWebhookChange(matchNum);
  }
}

export async function getAppWebhookSettings(): Promise<AppWebhookSettingsView> {
  const row = await readSettingsRow();

  const dbResale = row?.discordNewListingsWebhookUrl?.trim() || null;
  const envResale = envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const resolvedResale = dbResale || envResale || null;

  const dbMatch1 = row?.discordMatch1WebhookUrl?.trim() || null;
  const envMatch1 = envTrim("DISCORD_MATCH1_WEBHOOK_URL");
  const resolvedMatch1 = dbMatch1 || envMatch1 || null;

  const dbMatch3 = row?.discordMatch3ResaleWebhookUrl?.trim() || null;
  const envMatch3 = envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL");
  const resolvedMatch3 = dbMatch3 || envMatch3 || null;

  const dbMatch4 = row?.discordMatch4ResaleWebhookUrl?.trim() || null;
  const envMatch4 = envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL");
  const resolvedMatch4 = dbMatch4 || envMatch4 || null;

  const dbMatch5 = row?.discordMatch5WebhookUrl?.trim() || null;
  const envMatch5 = envTrim("DISCORD_MATCH5_WEBHOOK_URL");
  const resolvedMatch5 = dbMatch5 || envMatch5 || null;

  const dbMatch7 = row?.discordMatch7WebhookUrl?.trim() || null;
  const envMatch7 = envTrim("DISCORD_MATCH7_WEBHOOK_URL");
  const resolvedMatch7 = dbMatch7 || envMatch7 || null;

  const dbShop = row?.discordShopWebhookUrl?.trim() || null;
  const envShop = envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const resolvedShop = dbShop || envShop || null;

  const dbPriceList = row?.discordPriceListWebhookUrl?.trim() || null;
  const envPriceList = envTrim("DISCORD_PRICE_LIST_WEBHOOK_URL");
  const resolvedPriceList = dbPriceList || envPriceList || null;

  if (dbResale && dbShop && dbResale === dbShop) {
    console.warn(
      "[webhook-settings] app_webhook_settings has the same URL for resale and shop webhooks; update via Webhook logs tab.",
    );
  }

  return {
    discordNewListingsWebhookUrl: resolvedResale,
    discordNewListingsWebhookUrlMasked: resolvedResale ? maskWebhookUrl(resolvedResale) : null,
    discordNewListingsWebhookSource: dbResale ? "db" : envResale ? "env" : null,
    discordMatch1WebhookUrl: resolvedMatch1,
    discordMatch1WebhookUrlMasked: resolvedMatch1 ? maskWebhookUrl(resolvedMatch1) : null,
    discordMatch1WebhookSource: dbMatch1 ? "db" : envMatch1 ? "env" : null,
    discordMatch3ResaleWebhookUrl: resolvedMatch3,
    discordMatch3ResaleWebhookUrlMasked: resolvedMatch3 ? maskWebhookUrl(resolvedMatch3) : null,
    discordMatch3ResaleWebhookSource: dbMatch3 ? "db" : envMatch3 ? "env" : null,
    discordMatch4ResaleWebhookUrl: resolvedMatch4,
    discordMatch4ResaleWebhookUrlMasked: resolvedMatch4 ? maskWebhookUrl(resolvedMatch4) : null,
    discordMatch4ResaleWebhookSource: dbMatch4 ? "db" : envMatch4 ? "env" : null,
    discordMatch5WebhookUrl: resolvedMatch5,
    discordMatch5WebhookUrlMasked: resolvedMatch5 ? maskWebhookUrl(resolvedMatch5) : null,
    discordMatch5WebhookSource: dbMatch5 ? "db" : envMatch5 ? "env" : null,
    discordMatch7WebhookUrl: resolvedMatch7,
    discordMatch7WebhookUrlMasked: resolvedMatch7 ? maskWebhookUrl(resolvedMatch7) : null,
    discordMatch7WebhookSource: dbMatch7 ? "db" : envMatch7 ? "env" : null,
    discordShopWebhookUrl: resolvedShop,
    discordShopWebhookUrlMasked: resolvedShop ? maskWebhookUrl(resolvedShop) : null,
    discordShopWebhookSource: dbShop ? "db" : envShop ? "env" : null,
    discordPriceListWebhookUrl: resolvedPriceList,
    discordPriceListWebhookUrlMasked: resolvedPriceList ? maskWebhookUrl(resolvedPriceList) : null,
    discordPriceListWebhookSource: dbPriceList ? "db" : envPriceList ? "env" : null,
    shopDiscordBaselineSentAt: row?.shopDiscordBaselineSentAt?.toISOString() ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function resolveDiscordNewListingsWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordNewListingsWebhookUrl;
}

export async function resolveDiscordMatch1WebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordMatch1WebhookUrl;
}

export async function resolveDiscordMatch3ResaleWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordMatch3ResaleWebhookUrl;
}

export async function resolveDiscordMatch4ResaleWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordMatch4ResaleWebhookUrl;
}

export async function resolveDiscordMatch5WebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordMatch5WebhookUrl;
}

export async function resolveDiscordMatch7WebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordMatch7WebhookUrl;
}

/** Match 1/3/4/5/7 resale → dedicated webhooks; all other matches → general resale webhook. */
export async function resolveDiscordResaleWebhookUrlForEvent(
  matchLabel: string,
  name: string,
): Promise<string | null> {
  const matchNum = parseEventMatchNumber(matchLabel, name);
  if (isDedicatedMatchWebhook(matchNum)) {
    return resolveDedicatedMatchWebhookUrl(matchNum);
  }
  return resolveDiscordNewListingsWebhookUrl();
}

function assertDistinctWebhookUrls(
  candidate: string,
  others: Array<{ label: string; url: string | null }>,
): void {
  for (const other of others) {
    if (other.url && candidate === other.url) {
      throw new Error(`${other.label} webhook URL must differ from this URL.`);
    }
  }
}

export async function resolveDiscordShopWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordShopWebhookUrl;
}

export async function resolveDiscordPriceListWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordPriceListWebhookUrl;
}

/** Match 1/5/7 shop → dedicated webhook; M3/M4 and all others → general shop webhook. */
export async function resolveDiscordShopWebhookUrlForMatch(matchNum: number): Promise<string | null> {
  if (isDedicatedMatchShopWebhook(matchNum)) {
    return resolveDedicatedMatchWebhookUrl(matchNum);
  }
  return resolveDiscordShopWebhookUrl();
}

/** Match 1/5/7 shop → dedicated webhook; M3/M4 and all others → general shop webhook. */
export async function resolveDiscordShopWebhookUrlForEvent(
  matchLabel: string,
  name: string,
): Promise<string | null> {
  const matchNum = parseEventMatchNumber(matchLabel, name);
  if (isDedicatedMatchShopWebhook(matchNum)) {
    return resolveDedicatedMatchWebhookUrl(matchNum);
  }
  return resolveDiscordShopWebhookUrl();
}

export async function resolveDedicatedMatchWebhookUrl(
  matchNum: DedicatedMatchWebhookNumber,
): Promise<string | null> {
  switch (matchNum) {
    case 1:
      return resolveDiscordMatch1WebhookUrl();
    case 3:
      return resolveDiscordMatch3ResaleWebhookUrl();
    case 4:
      return resolveDiscordMatch4ResaleWebhookUrl();
    case 5:
      return resolveDiscordMatch5WebhookUrl();
    case 7:
      return resolveDiscordMatch7WebhookUrl();
  }
}

export async function resolveDedicatedMatchWebhookUrlForEvent(
  matchLabel: string,
  name: string,
): Promise<string | null> {
  const matchNum = parseDedicatedMatchNumber(matchLabel, name);
  if (!matchNum) return null;
  return resolveDedicatedMatchWebhookUrl(matchNum);
}

export async function hasAnyDedicatedShopWebhookConfigured(): Promise<boolean> {
  for (const matchNum of DEDICATED_SHOP_ROUTING_MATCHES) {
    const url = await resolveDedicatedMatchWebhookUrl(matchNum);
    if (url) return true;
  }
  return false;
}

export async function hasAnyDedicatedMatchWebhookConfigured(): Promise<boolean> {
  for (const matchNum of DEDICATED_MATCH_WEBHOOK_NUMBERS) {
    const url = await resolveDedicatedMatchWebhookUrl(matchNum);
    if (url) return true;
  }
  return false;
}

function dedicatedMatchWebhookUrlFromRow(
  matchNum: DedicatedMatchWebhookNumber,
  row: Awaited<ReturnType<typeof readSettingsRow>>,
): string | null {
  switch (matchNum) {
    case 1:
      return row?.discordMatch1WebhookUrl?.trim() || envTrim("DISCORD_MATCH1_WEBHOOK_URL") || null;
    case 3:
      return row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL") || null;
    case 4:
      return row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL") || null;
    case 5:
      return row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL") || null;
    case 7:
      return row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL") || null;
  }
}

function dedicatedWebhookDistinctChecks(
  matchNum: DedicatedMatchWebhookNumber,
  row: Awaited<ReturnType<typeof readSettingsRow>>,
): Array<{ label: string; url: string | null }> {
  const resaleUrl = row?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const others: Array<{ label: string; url: string | null }> = [
    { label: "General resale", url: resaleUrl || null },
    { label: "Shop", url: shopUrl || null },
  ];
  for (const n of DEDICATED_MATCH_WEBHOOK_NUMBERS) {
    if (n === matchNum) continue;
    others.push({ label: `Match ${n}`, url: dedicatedMatchWebhookUrlFromRow(n, row) });
  }
  return others;
}

export async function setDiscordNewListingsWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const match1Url = row?.discordMatch1WebhookUrl?.trim() || envTrim("DISCORD_MATCH1_WEBHOOK_URL");
  const match3Url = row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL");
  const match4Url = row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL");
  const match5Url = row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL");
  const match7Url = row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL");
  if (next) {
    assertDistinctWebhookUrls(next, [
      { label: "Shop", url: shopUrl || null },
      { label: "Match 1", url: match1Url || null },
      { label: "Match 3", url: match3Url || null },
      { label: "Match 4", url: match4Url || null },
      { label: "Match 5", url: match5Url || null },
      { label: "Match 7", url: match7Url || null },
    ]);
  }
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordNewListingsWebhookUrl: next },
    update: { discordNewListingsWebhookUrl: next },
  });
  return getAppWebhookSettings();
}

export async function setDiscordMatch1WebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  if (next) {
    assertDistinctWebhookUrls(next, dedicatedWebhookDistinctChecks(1, row));
  }
  const prevUrl = row?.discordMatch1WebhookUrl?.trim() || envTrim("DISCORD_MATCH1_WEBHOOK_URL") || null;
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordMatch1WebhookUrl: next },
    update: { discordMatch1WebhookUrl: next },
  });
  await onDedicatedMatchWebhookUrlChanged(1, prevUrl, next);
  return getAppWebhookSettings();
}

export async function setDiscordMatch3ResaleWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  const resaleUrl = row?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const match4Url = row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL");
  const match5Url = row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL");
  const match7Url = row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL");
  if (next) {
    assertDistinctWebhookUrls(next, dedicatedWebhookDistinctChecks(3, row));
  }
  const prevUrl =
    row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL") || null;
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordMatch3ResaleWebhookUrl: next },
    update: { discordMatch3ResaleWebhookUrl: next },
  });
  await onDedicatedMatchWebhookUrlChanged(3, prevUrl, next);
  return getAppWebhookSettings();
}

export async function setDiscordMatch4ResaleWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  const resaleUrl = row?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const match3Url = row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL");
  const match5Url = row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL");
  const match7Url = row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL");
  if (next) {
    assertDistinctWebhookUrls(next, dedicatedWebhookDistinctChecks(4, row));
  }
  const prevUrl =
    row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL") || null;
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordMatch4ResaleWebhookUrl: next },
    update: { discordMatch4ResaleWebhookUrl: next },
  });
  await onDedicatedMatchWebhookUrlChanged(4, prevUrl, next);
  return getAppWebhookSettings();
}

export async function setDiscordMatch5WebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  const resaleUrl = row?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const match3Url = row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL");
  const match4Url = row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL");
  if (next) {
    assertDistinctWebhookUrls(next, dedicatedWebhookDistinctChecks(5, row));
  }
  const prevUrl = row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL") || null;
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordMatch5WebhookUrl: next },
    update: { discordMatch5WebhookUrl: next },
  });
  await onDedicatedMatchWebhookUrlChanged(5, prevUrl, next);
  return getAppWebhookSettings();
}

export async function setDiscordMatch7WebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  if (next) {
    assertDistinctWebhookUrls(next, dedicatedWebhookDistinctChecks(7, row));
  }
  const prevUrl = row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL") || null;
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordMatch7WebhookUrl: next },
    update: { discordMatch7WebhookUrl: next },
  });
  await onDedicatedMatchWebhookUrlChanged(7, prevUrl, next);
  return getAppWebhookSettings();
}

function allConfiguredWebhookUrls(
  row: Awaited<ReturnType<typeof readSettingsRow>>,
): Array<{ label: string; url: string | null }> {
  return [
    { label: "General resale", url: row?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL") || null },
    { label: "Match 1", url: row?.discordMatch1WebhookUrl?.trim() || envTrim("DISCORD_MATCH1_WEBHOOK_URL") || null },
    { label: "Match 3", url: row?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL") || null },
    { label: "Match 4", url: row?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL") || null },
    { label: "Match 5", url: row?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL") || null },
    { label: "Match 7", url: row?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL") || null },
    { label: "Shop", url: row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL") || null },
    { label: "Price list", url: row?.discordPriceListWebhookUrl?.trim() || envTrim("DISCORD_PRICE_LIST_WEBHOOK_URL") || null },
  ];
}

export async function setDiscordPriceListWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  if (next) {
    assertDistinctWebhookUrls(
      next,
      allConfiguredWebhookUrls(row).filter((entry) => entry.label !== "Price list"),
    );
  }
  const urlChanged = (row?.discordPriceListWebhookUrl?.trim() ?? "") !== (next ?? "");
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordPriceListWebhookUrl: next },
    update: { discordPriceListWebhookUrl: next },
  });
  if (urlChanged) {
    try {
      await prisma.priceListDiscordNotifyState.deleteMany({ where: { id: 1 } });
    } catch {
      /* best-effort reset so baseline fires after webhook configure */
    }
  }
  return getAppWebhookSettings();
}

export async function setDiscordShopWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const prev = await readSettingsRow();
  const match1Url = prev?.discordMatch1WebhookUrl?.trim() || envTrim("DISCORD_MATCH1_WEBHOOK_URL");
  const match3Url = prev?.discordMatch3ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH3_RESALE_WEBHOOK_URL");
  const match4Url = prev?.discordMatch4ResaleWebhookUrl?.trim() || envTrim("DISCORD_MATCH4_RESALE_WEBHOOK_URL");
  const match5Url = prev?.discordMatch5WebhookUrl?.trim() || envTrim("DISCORD_MATCH5_WEBHOOK_URL");
  const match7Url = prev?.discordMatch7WebhookUrl?.trim() || envTrim("DISCORD_MATCH7_WEBHOOK_URL");
  const resaleUrl = prev?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const priceListUrl = prev?.discordPriceListWebhookUrl?.trim() || envTrim("DISCORD_PRICE_LIST_WEBHOOK_URL");
  if (next) {
    assertDistinctWebhookUrls(next, [
      { label: "General resale", url: resaleUrl || null },
      { label: "Match 1", url: match1Url || null },
      { label: "Match 3", url: match3Url || null },
      { label: "Match 4", url: match4Url || null },
      { label: "Match 5", url: match5Url || null },
      { label: "Match 7", url: match7Url || null },
      { label: "Price list", url: priceListUrl || null },
    ]);
  }
  const urlChanged = (prev?.discordShopWebhookUrl?.trim() ?? "") !== (next ?? "");
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordShopWebhookUrl: next, shopDiscordBaselineSentAt: null },
    update: {
      discordShopWebhookUrl: next,
      ...(urlChanged ? { shopDiscordBaselineSentAt: null, shopDiscordLastHeartbeatAt: null } : {}),
    },
  });
  return getAppWebhookSettings();
}

export async function markShopDiscordBaselineSent(): Promise<void> {
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, shopDiscordBaselineSentAt: new Date() },
    update: { shopDiscordBaselineSentAt: new Date() },
  });
}

export async function isShopDiscordBaselineSent(): Promise<boolean> {
  const row = await readSettingsRow();
  return row?.shopDiscordBaselineSentAt != null;
}
