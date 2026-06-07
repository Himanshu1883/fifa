import "server-only";

import { prisma } from "@/lib/prisma";
import { parseMarkupPercentInput } from "@/lib/markup";
import { getPersistedMarkupPercent } from "@/lib/markup-settings";
import { getSbPushRulesRuntime } from "@/lib/sb-push-rules-settings";
import {
  applyMarkupPercentToTransformResult,
  transformSeatOffersFromSockRows,
  type TransformSeatOffersResult,
} from "@/lib/seat-offers-transform";

/** SockAvailable kind used for SeatsBrokers preview/push (resale inventory only). */
export const SEATS_BROKERS_PUSH_INVENTORY_KIND = "RESALE" as const;

export type LoadTransformedSeatOffersOptions = {
  kind?: "RESALE" | "LAST_MINUTE";
  markupPercent?: number | "persisted";
};

export type LoadedTransformedSeatOffers = {
  event: {
    id: number;
    sbEventId: string | null;
    prefId: string;
    resalePrefId: string | null;
    name: string;
    eventDate: Date | null;
  };
  markupPercent: number;
  sourceRowCount: number;
  transform: TransformSeatOffersResult;
};

export async function resolveMarkupPercentForOffers(
  explicit: number | "persisted" | undefined,
): Promise<number> {
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  return getPersistedMarkupPercent();
}

export async function loadTransformedSeatOffersForEvent(
  eventId: number,
  options: LoadTransformedSeatOffersOptions = {},
): Promise<LoadedTransformedSeatOffers | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, sbEventId: true, prefId: true, resalePrefId: true, name: true, eventDate: true },
  });
  if (!event) return null;

  const rows = await prisma.sockAvailable.findMany({
    where: {
      eventId,
      ...(options.kind ? { kind: options.kind } : {}),
    },
    select: {
      id: true,
      amount: true,
      areaName: true,
      blockName: true,
      contingentId: true,
      row: true,
      seatNumber: true,
      seatId: true,
      resaleMovementId: true,
      categoryName: true,
      categoryId: true,
      areaId: true,
      blockId: true,
      kind: true,
    },
    orderBy: [
      { kind: "asc" },
      { categoryId: "asc" },
      { blockName: "asc" },
      { row: "asc" },
      { seatNumber: "asc" },
      { resaleMovementId: "asc" },
    ],
  });

  const payload = rows.map((r) => ({
    id: r.id,
    amount: r.amount?.toString() ?? null,
    areaName: r.areaName,
    blockName: r.blockName,
    contingentId: r.contingentId,
    row: r.row,
    seatNumber: r.seatNumber,
    seatId: r.seatId,
    resaleMovementId: r.resaleMovementId,
    categoryName: r.categoryName,
    categoryId: r.categoryId,
    areaId: r.areaId,
    blockId: r.blockId,
    kind: r.kind,
  }));

  const pushRules = await getSbPushRulesRuntime();
  const transformed = transformSeatOffersFromSockRows(payload, pushRules);
  const markupPercent = await resolveMarkupPercentForOffers(options.markupPercent ?? "persisted");
  const withMarkup = applyMarkupPercentToTransformResult(transformed, markupPercent);

  return {
    event,
    markupPercent,
    sourceRowCount: payload.length,
    transform: withMarkup,
  };
}

export function parseOptionalMarkupPercentParam(raw: string | null): number | "persisted" {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return "persisted";
  const parsed = parseMarkupPercentInput(trimmed);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}
