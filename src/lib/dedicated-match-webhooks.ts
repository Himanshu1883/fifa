import "server-only";

import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import {
  resolveDiscordMatch1WebhookUrl,
  resolveDiscordMatch3ResaleWebhookUrl,
  resolveDiscordMatch4ResaleWebhookUrl,
  resolveDiscordMatch5WebhookUrl,
  resolveDiscordMatch7WebhookUrl,
} from "@/lib/webhook-settings";

/** All matches with dedicated Discord webhooks for resale routing. */
export const DEDICATED_MATCH_WEBHOOK_NUMBERS = [1, 3, 4, 5, 7] as const;

/** Dedicated resale webhooks — M3/M4 are resale-only; M5/M7 also receive shop. */
export const DEDICATED_RESALE_MATCHES = [3, 4, 5, 7] as const;

/** Dedicated shop webhooks (M5/M7) — M3/M4 shop uses general DISCORD_SHOP_WEBHOOK_URL. */
export const DEDICATED_SHOP_MATCHES = [5, 7] as const;

/** All matches whose shop traffic uses a dedicated webhook (M1 + DEDICATED_SHOP_MATCHES). */
export const DEDICATED_SHOP_ROUTING_MATCHES = [1, 5, 7] as const;

export type DedicatedMatchWebhookNumber = (typeof DEDICATED_MATCH_WEBHOOK_NUMBERS)[number];
export type DedicatedShopMatchNumber = (typeof DEDICATED_SHOP_ROUTING_MATCHES)[number];
export type DedicatedResaleMatchNumber = (typeof DEDICATED_RESALE_MATCHES)[number];

export function isDedicatedMatchWebhook(matchNum: number | null | undefined): matchNum is DedicatedMatchWebhookNumber {
  if (matchNum == null) return false;
  return (DEDICATED_MATCH_WEBHOOK_NUMBERS as readonly number[]).includes(matchNum);
}

export function isDedicatedMatchShopWebhook(
  matchNum: number | null | undefined,
): matchNum is DedicatedShopMatchNumber {
  if (matchNum == null) return false;
  return (DEDICATED_SHOP_ROUTING_MATCHES as readonly number[]).includes(matchNum);
}

export function isDedicatedResaleMatch(
  matchNum: number | null | undefined,
): matchNum is DedicatedResaleMatchNumber {
  if (matchNum == null) return false;
  return (DEDICATED_RESALE_MATCHES as readonly number[]).includes(matchNum);
}

export function parseDedicatedResaleMatchNumber(
  matchLabel: string,
  name: string,
): DedicatedResaleMatchNumber | null {
  const n = parseEventMatchNumber(matchLabel, name);
  return isDedicatedResaleMatch(n) ? n : null;
}

export function parseDedicatedMatchNumber(matchLabel: string, name: string): DedicatedMatchWebhookNumber | null {
  const n = parseEventMatchNumber(matchLabel, name);
  return isDedicatedMatchWebhook(n) ? n : null;
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
