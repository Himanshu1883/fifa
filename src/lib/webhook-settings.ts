import "server-only";

import { prisma } from "@/lib/prisma";

const SETTINGS_ID = 1;

export type WebhookUrlSource = "db" | "env" | null;

export type AppWebhookSettingsView = {
  discordNewListingsWebhookUrl: string | null;
  discordNewListingsWebhookUrlMasked: string | null;
  discordNewListingsWebhookSource: WebhookUrlSource;
  discordShopWebhookUrl: string | null;
  discordShopWebhookUrlMasked: string | null;
  discordShopWebhookSource: WebhookUrlSource;
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

export async function getAppWebhookSettings(): Promise<AppWebhookSettingsView> {
  const row = await readSettingsRow();

  const dbResale = row?.discordNewListingsWebhookUrl?.trim() || null;
  const envResale = envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const resolvedResale = dbResale || envResale || null;

  const dbShop = row?.discordShopWebhookUrl?.trim() || null;
  const envShop = envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const resolvedShop = dbShop || envShop || null;

  if (dbResale && dbShop && dbResale === dbShop) {
    console.warn(
      "[webhook-settings] app_webhook_settings has the same URL for resale and shop webhooks; update via Webhook logs tab.",
    );
  }

  return {
    discordNewListingsWebhookUrl: resolvedResale,
    discordNewListingsWebhookUrlMasked: resolvedResale ? maskWebhookUrl(resolvedResale) : null,
    discordNewListingsWebhookSource: dbResale ? "db" : envResale ? "env" : null,
    discordShopWebhookUrl: resolvedShop,
    discordShopWebhookUrlMasked: resolvedShop ? maskWebhookUrl(resolvedShop) : null,
    discordShopWebhookSource: dbShop ? "db" : envShop ? "env" : null,
    shopDiscordBaselineSentAt: row?.shopDiscordBaselineSentAt?.toISOString() ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function resolveDiscordNewListingsWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordNewListingsWebhookUrl;
}

export async function resolveDiscordShopWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordShopWebhookUrl;
}

export async function setDiscordNewListingsWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const row = await readSettingsRow();
  const shopUrl = row?.discordShopWebhookUrl?.trim() || envTrim("DISCORD_SHOP_WEBHOOK_URL");
  if (next && shopUrl && next === shopUrl) {
    throw new Error("Resale webhook URL must differ from the shop webhook URL.");
  }
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordNewListingsWebhookUrl: next },
    update: { discordNewListingsWebhookUrl: next },
  });
  return getAppWebhookSettings();
}

export async function setDiscordShopWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;
  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }
  const prev = await readSettingsRow();
  const resaleUrl = prev?.discordNewListingsWebhookUrl?.trim() || envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  if (next && resaleUrl && next === resaleUrl) {
    throw new Error("Shop webhook URL must differ from the resale webhook URL.");
  }
  const urlChanged = (prev?.discordShopWebhookUrl?.trim() ?? "") !== (next ?? "");
  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordShopWebhookUrl: next, shopDiscordBaselineSentAt: null },
    update: {
      discordShopWebhookUrl: next,
      ...(urlChanged ? { shopDiscordBaselineSentAt: null } : {}),
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
