import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { parseMarkupPercentInput } from "@/lib/markup";
import { getPersistedMarkupPercent } from "@/lib/markup-settings";
import {
  applyMarkupPercentToTransformResult,
  transformSeatOffersFromSockRows,
  type TransformedSeatOffer,
} from "@/lib/seat-offers-transform";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["RESALE", "LAST_MINUTE"]).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    kind: url.searchParams.get("kind")?.trim().toUpperCase() || undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query. kind must be RESALE or LAST_MINUTE." },
      { status: 400 },
    );
  }

  const markupRaw = url.searchParams.get("markupPercent")?.trim() ?? "";
  let markupPercent = 0;
  if (markupRaw !== "") {
    const parsedMarkup = parseMarkupPercentInput(markupRaw);
    if (!parsedMarkup.ok) {
      return NextResponse.json({ ok: false, error: parsedMarkup.message }, { status: 400 });
    }
    markupPercent = parsedMarkup.value;
  } else {
    markupPercent = await getPersistedMarkupPercent();
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, sbEventId: true, prefId: true, resalePrefId: true, name: true },
    });
    if (!event) {
      return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
    }

    const rows = await prisma.sockAvailable.findMany({
      where: {
        eventId: id,
        ...(parsedQuery.data.kind ? { kind: parsedQuery.data.kind } : {}),
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

    const transformed = transformSeatOffersFromSockRows(payload);
    const { offers, skippedEmptyBuckets, summary } = applyMarkupPercentToTransformResult(
      transformed,
      markupPercent,
    );

    return NextResponse.json({
      ok: true,
      eventId: event.id,
      sbEventId: event.sbEventId,
      prefId: event.prefId,
      resalePrefId: event.resalePrefId,
      eventName: event.name,
      sourceRowCount: payload.length,
      offerCount: offers.length,
      skippedEmptyBuckets,
      markupPercent,
      rules: {
        together: "4→1, 5→2, 6→2, 7→4, 10→4; other counts pass through",
        single: "4→1, 5→2, 6→2, 7→2; other counts pass through",
        markup:
          "Uses persisted UI markup when ?markupPercent is omitted; ?markupPercent=N overrides for testing; multiplies priceUsd and priceRaw by (1 + N/100); UI prices are unmarked",
        note: "See TOGETHER_QUANTITY_MAP / SINGLE_QUANTITY_MAP in seat-offers-transform.ts",
      },
      offers: offers satisfies TransformedSeatOffer[],
      summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}
