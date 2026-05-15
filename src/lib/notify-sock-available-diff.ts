import type { Prisma } from "@/generated/prisma/client";
import type { SockAvailableKind } from "@/generated/prisma/enums";
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

export type SockAvailableNotifyResponse = WhatsAppNotifyResult;

function amountRawToUsdString(raw: number | null): string {
  if (raw === null) return "—";
  const usd = raw / 1000;
  if (!Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(2)}`;
}

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
  event: { id: number; label: string } | null;
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
    event: { id: ev.id, label: ev.matchLabel || ev.name },
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

export async function maybeNotifySockAvailableDiff(input: {
  prefId: string;
  event: { id: number; label: string } | null;
  diff: SockAvailableWebhookDiffResponse;
}): Promise<SockAvailableNotifyResponse> {
  const { prefId, event, diff } = input;
  if (!event) return { attempted: false, ok: false, provider: "ultramsg" };

  // Notify only for new seats or price changes (avoid spam).
  const shouldNotify = diff.newCount > 0 || diff.priceChangedCount > 0;
  if (!shouldNotify) return { attempted: false, ok: false, provider: "ultramsg" };

  const text = buildWhatsAppText({
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
  });

  return sendUltraMsgWhatsAppMessage(text);
}

