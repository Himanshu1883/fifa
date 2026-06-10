import "server-only";

import { prisma } from "@/lib/prisma";

const SETTINGS_ID = 1;

export type WebhookUrlSource = "db" | "env" | null;

export type AppWebhookSettingsView = {
  discordNewListingsWebhookUrl: string | null;
  discordNewListingsWebhookUrlMasked: string | null;
  discordNewListingsWebhookSource: WebhookUrlSource;
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

export async function getAppWebhookSettings(): Promise<AppWebhookSettingsView> {
  let dbUrl: string | null = null;
  let updatedAt: string | null = null;

  try {
    const row = await prisma.appWebhookSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row?.discordNewListingsWebhookUrl?.trim()) {
      dbUrl = row.discordNewListingsWebhookUrl.trim();
      updatedAt = row.updatedAt.toISOString();
    }
  } catch {
    /* table may not exist before migrate */
  }

  const envUrl = envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const resolved = dbUrl || envUrl || null;
  const source: WebhookUrlSource = dbUrl ? "db" : envUrl ? "env" : null;

  return {
    discordNewListingsWebhookUrl: resolved,
    discordNewListingsWebhookUrlMasked: resolved ? maskWebhookUrl(resolved) : null,
    discordNewListingsWebhookSource: source,
    updatedAt,
  };
}

export async function resolveDiscordNewListingsWebhookUrl(): Promise<string | null> {
  const settings = await getAppWebhookSettings();
  return settings.discordNewListingsWebhookUrl;
}

export async function setDiscordNewListingsWebhookUrl(raw: string | null): Promise<AppWebhookSettingsView> {
  const trimmed = raw?.trim() ?? "";
  const next = trimmed.length > 0 ? trimmed : null;

  if (next && !isDiscordWebhookUrl(next)) {
    throw new Error("URL must be a Discord webhook (https://discord.com/api/webhooks/…).");
  }

  await prisma.appWebhookSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, discordNewListingsWebhookUrl: next },
    update: { discordNewListingsWebhookUrl: next },
  });

  return getAppWebhookSettings();
}
