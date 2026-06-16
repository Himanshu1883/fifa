import "server-only";

import type { SockAvailableKind } from "@/generated/prisma/enums";
import {
  combineDiscordNotifyResults,
  sendDiscordNewListingsMessage,
  type DiscordNotifyResult,
} from "@/lib/discord-webhook";
import type { SockAvailableNewListingKey } from "@/lib/sock-available-diff";

export type SeatsidekickDualDiscordPostInput = {
  eventLabel: string;
  eventName: string;
  eventId: number;
  prefId: string;
  matchNum: number | null;
  newCount: number;
  newSeatIds: SockAvailableNewListingKey[];
  dedicatedWebhookUrl: string | null;
  generalWebhookUrl: string | null;
  kind?: SockAvailableKind;
  isNewListings?: boolean;
  titleOverride?: string;
};

export type SeatsidekickDualDiscordPostResult = {
  dedicated: DiscordNotifyResult;
  general: DiscordNotifyResult;
  combined: DiscordNotifyResult;
};

/** Post two separate Discord messages: per-match channel + #resale-drop mirror. */
export async function postSeatsidekickListingsDualDiscord(
  input: SeatsidekickDualDiscordPostInput,
): Promise<SeatsidekickDualDiscordPostResult> {
  const kind = input.kind ?? "RESALE";
  const base = {
    eventLabel: input.eventLabel,
    eventName: input.eventName,
    eventId: input.eventId,
    prefId: input.prefId,
    kind,
    newCount: input.newCount,
    newSeatIds: input.newSeatIds,
    matchNum: input.matchNum ?? undefined,
    isNewListings: input.isNewListings,
    titleOverride: input.titleOverride,
  };

  const skip: DiscordNotifyResult = { attempted: false, ok: false, provider: "discord" };

  let dedicated = skip;
  if (input.dedicatedWebhookUrl) {
    dedicated = await sendDiscordNewListingsMessage({
      ...base,
      webhookUrl: input.dedicatedWebhookUrl,
    });
  }

  let general = skip;
  const generalUrl = input.generalWebhookUrl?.trim() || null;
  const dedicatedUrl = input.dedicatedWebhookUrl?.trim() || null;

  if (generalUrl && generalUrl !== dedicatedUrl) {
    general = await sendDiscordNewListingsMessage({
      ...base,
      webhookUrl: generalUrl,
    });
  } else if (!dedicatedUrl && generalUrl) {
    general = await sendDiscordNewListingsMessage({
      ...base,
      webhookUrl: generalUrl,
    });
  }

  let combined = dedicated;
  if (general.attempted) {
    combined = combineDiscordNotifyResults(dedicated, general);
  } else if (!dedicated.attempted && general.attempted) {
    combined = general;
  }

  return { dedicated, general, combined };
}

export function dualDiscordPostSucceeded(result: SeatsidekickDualDiscordPostResult): boolean {
  const { dedicated, general, combined } = result;
  if (!combined.attempted) return false;
  if (!combined.ok) return false;
  if (dedicated.attempted && !dedicated.ok) return false;
  if (general.attempted && !general.ok) return false;
  return true;
}
