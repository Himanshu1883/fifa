import type { Prisma } from "@/generated/prisma/client";
import type { SockAvailableKind } from "@/generated/prisma/enums";
import {
  amountRawToUsdString,
  sendDiscordNewListingsMessage,
  type DiscordNotifyResult,
} from "@/lib/discord-webhook";
import type { SockAvailableRowInput } from "@/lib/parse-sock-available-geojson-webhook";
import { computeSockAvailableDiff } from "@/lib/sock-available-diff";
import { sendUltraMsgWhatsAppMessage, type WhatsAppNotifyResult } from "@/lib/whatsapp-ultramsg";

type Tx = Pick<Prisma.TransactionClient, "event" | "sockAvailable">;

export type SockAvailableWebhookDiffResponse = {
  kind: SockAvailableKind;
  newCount: number;
  changedCount: number;
  priceChangedCount: number;
  newSeatIds: ReturnType<typeof computeSockAvailableDiff>["newSeatIds"];
  sample: ReturnType<typeof computeSockAvailableDiff>["sample"];
};

export type SockAvailableNotifyEvent = {
  id: number;
  label: string;
  name: string;
  matchLabel: string;
};

export type SockAvailableNotifyResponse = {
  whatsapp: WhatsAppNotifyResult;
  discord: DiscordNotifyResult;
};

function buildWhatsAppText(input: {
  eventLabel: string;
  eventId: number;
  prefId: string;
  kind: SockAvailableKind;
  newCount: number;
  changedCount: number;
  priceChangedCount: number;
  sample: Array<{ line: string }>;
}): string {
  const { eventLabel, eventId, prefId, kind, newCount, changedCount, priceChangedCount, sample } = input;
  const header = `Sock available diff (${kind}): ${eventLabel}\n(eventId ${eventId}, prefId ${prefId})`;
  const counts = `New ${newCount} · Changed ${changedCount} · Price ${priceChangedCount}`;
  const lines = sample.map((s) => s.line).filter(Boolean);
  const body = lines.length ? `\n\nSamples:\n${lines.join("\n")}` : "";
  const text = `${header}\n${counts}${body}`;
  return text.length > 1400 ? `${text.slice(0, 1400)}…` : text;
}

export async function computeSockAvailableDiffInTx(params: {
  tx: Tx;
  prefId: string;
  kind: SockAvailableKind;
  rows: SockAvailableRowInput[];
  sampleLimit?: number;
}): Promise<{
  event: SockAvailableNotifyEvent | null;
  diff: SockAvailableWebhookDiffResponse;
}> {
  const { tx, prefId, kind, rows, sampleLimit = 10 } = params;

  const ev = await tx.event.findFirst({
    where: { OR: [{ prefId }, { resalePrefId: prefId }] },
    select: { id: true, matchLabel: true, name: true },
  });

  if (!ev) {
    return {
      event: null,
      diff: { kind, newCount: 0, changedCount: 0, priceChangedCount: 0, newSeatIds: [], sample: [] },
    };
  }

  const existing = await tx.sockAvailable.findMany({
    where: { eventId: ev.id, kind },
    select: {
      areaId: true,
      areaName: true,
      blockId: true,
      blockName: true,
      seatId: true,
      seatNumber: true,
      resaleMovementId: true,
      row: true,
      categoryName: true,
      categoryId: true,
      amount: true,
    },
  });

  const summary = computeSockAvailableDiff({
    kind,
    incoming: rows,
    existing,
    sampleLimit,
  });

  return {
    event: {
      id: ev.id,
      label: ev.matchLabel || ev.name,
      name: ev.name,
      matchLabel: ev.matchLabel,
    },
    diff: {
      kind,
      newCount: summary.newCount,
      changedCount: summary.changedCount,
      priceChangedCount: summary.priceChangedCount,
      newSeatIds: summary.newSeatIds,
      sample: summary.sample,
    },
  };
}

const emptyWhatsApp: WhatsAppNotifyResult = { attempted: false, ok: false, provider: "ultramsg" };
const emptyDiscord: DiscordNotifyResult = { attempted: false, ok: false, provider: "discord" };

export async function maybeNotifySockAvailableDiff(input: {
  prefId: string;
  event: SockAvailableNotifyEvent | null;
  diff: SockAvailableWebhookDiffResponse;
}): Promise<SockAvailableNotifyResponse> {
  const { prefId, event, diff } = input;
  if (!event) return { whatsapp: emptyWhatsApp, discord: emptyDiscord };

  const discord =
    diff.newCount > 0
      ? await sendDiscordNewListingsMessage({
          eventLabel: event.matchLabel || event.label,
          eventName: event.name,
          eventId: event.id,
          prefId,
          kind: diff.kind,
          newCount: diff.newCount,
          newSeatIds: diff.newSeatIds,
        })
      : emptyDiscord;

  const shouldNotifyWhatsApp = diff.newCount > 0 || diff.priceChangedCount > 0;
  const whatsapp = shouldNotifyWhatsApp
    ? await sendUltraMsgWhatsAppMessage(
        buildWhatsAppText({
          eventLabel: event.label,
          eventId: event.id,
          prefId,
          kind: diff.kind,
          newCount: diff.newCount,
          changedCount: diff.changedCount,
          priceChangedCount: diff.priceChangedCount,
          sample: diff.sample.slice(0, 10).map((s) => {
            if (s.change === "new") {
              return {
                line: `+ ${s.blockName} Row ${s.row} Seat ${s.seatNumber} Cat ${s.categoryId} ${amountRawToUsdString(s.amountRaw)}`,
              };
            }
            const changed = (s.changedFields ?? []).filter((f) => f !== "amount");
            const changeLabel = changed.length ? ` (${changed.join(",")})` : "";
            const priceLabel =
              s.prev && s.amountRaw !== s.prev.amountRaw
                ? ` ${amountRawToUsdString(s.prev.amountRaw)}→${amountRawToUsdString(s.amountRaw)}`
                : ` ${amountRawToUsdString(s.amountRaw)}`;
            return {
              line: `~ ${s.blockName} Row ${s.row} Seat ${s.seatNumber} Cat ${s.categoryId}${changeLabel}${priceLabel}`,
            };
          }),
        }),
      )
    : emptyWhatsApp;

  return { whatsapp, discord };
}

export function summarizeNotifyForDiffLog(notify: SockAvailableNotifyResponse): {
  notifyAttempted: boolean;
  notifyOk: boolean;
  notifyProvider: string | null;
  notifyStatus: string | null;
  notifyError: string | null;
} {
  const attempted = notify.discord.attempted || notify.whatsapp.attempted;
  const providers = [
    notify.discord.attempted ? "discord" : null,
    notify.whatsapp.attempted ? "ultramsg" : null,
  ].filter(Boolean);

  const discordOk = !notify.discord.attempted || notify.discord.ok;
  const whatsappOk = !notify.whatsapp.attempted || notify.whatsapp.ok;

  const errors = [notify.discord.error, notify.whatsapp.error].filter(Boolean);
  const statuses = [
    notify.discord.status != null ? `discord:${notify.discord.status}` : null,
    notify.whatsapp.status != null ? `ultramsg:${notify.whatsapp.status}` : null,
  ].filter(Boolean);

  return {
    notifyAttempted: attempted,
    notifyOk: attempted ? discordOk && whatsappOk : false,
    notifyProvider: providers.length ? providers.join("+") : null,
    notifyStatus: statuses.length ? statuses.join(",") : null,
    notifyError: errors.length ? errors.join(" | ") : null,
  };
}
