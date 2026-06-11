import "server-only";

import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import {
  resolveDiscordMatch3ResaleWebhookUrl,
  resolveDiscordMatch4ResaleWebhookUrl,
  resolveDiscordMatch5WebhookUrl,
  resolveDiscordMatch7WebhookUrl,
} from "@/lib/webhook-settings";

/** Matches with dedicated shop + resale Discord webhooks (exclusive routing). */
export const DEDICATED_MATCH_WEBHOOK_NUMBERS = [3, 4, 5, 7] as const;

export type DedicatedMatchWebhookNumber = (typeof DEDICATED_MATCH_WEBHOOK_NUMBERS)[number];

export function isDedicatedMatchWebhook(matchNum: number | null | undefined): matchNum is DedicatedMatchWebhookNumber {
  if (matchNum == null) return false;
  return (DEDICATED_MATCH_WEBHOOK_NUMBERS as readonly number[]).includes(matchNum);
}

export function parseDedicatedMatchNumber(matchLabel: string, name: string): DedicatedMatchWebhookNumber | null {
  const n = parseEventMatchNumber(matchLabel, name);
  return isDedicatedMatchWebhook(n) ? n : null;
}

export async function resolveDedicatedMatchWebhookUrl(
  matchNum: DedicatedMatchWebhookNumber,
): Promise<string | null> {
  switch (matchNum) {
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
