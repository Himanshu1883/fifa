"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export type BuyingCriteriaRuleRow = {
  id: number;
  eventId: number;
  categoryNum: number;
  kind: "QTY_UNDER_PRICE" | "TOGETHER_UNDER_PRICE";
  minQty: number | null;
  togetherCount: number | null;
  maxPriceUsdCents: number | null;
};

export type BuyingCriteriaRuleInput =
  | { kind: "QTY_UNDER_PRICE"; minQty: number; maxPriceUsd: string }
  | { kind: "TOGETHER_UNDER_PRICE"; togetherCount: number; maxPriceUsd: string };

const eventIdSchema = z.number().int().positive();
const idsSchema = z.array(eventIdSchema).max(2000);
const categoryNumSchema = z.number().int().min(1).max(4);

const moneySchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => /^\d+(\.\d{0,2})?$/.test(v), "Invalid USD amount.");

const ruleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("QTY_UNDER_PRICE"),
    minQty: z.number().int().min(1).max(9999),
    maxPriceUsd: moneySchema,
  }),
  z.object({
    kind: z.literal("TOGETHER_UNDER_PRICE"),
    togetherCount: z.number().int().min(2).max(6),
    maxPriceUsd: moneySchema,
  }),
]);

const replaceSchema = z.object({
  eventId: eventIdSchema,
  categoryNum: categoryNumSchema,
  rules: z.array(ruleSchema).max(25),
});

const qtyBulkItemSchema = z.object({
  eventId: eventIdSchema,
  categoryNum: categoryNumSchema,
  minQty: z.number().int().min(1).max(9999).nullable(),
  maxPriceUsd: z.string().trim().nullable(),
});

const qtyBulkSchema = z.array(qtyBulkItemSchema).max(8000);

function parseUsdToCents(amount: string): number {
  const trimmed = amount.trim();
  const [whole, frac = ""] = trimmed.split(".");
  const frac2 = (frac + "00").slice(0, 2);
  const dollars = Number(whole);
  const cents = Number(frac2);
  if (!Number.isFinite(dollars) || !Number.isFinite(cents)) throw new Error("Invalid USD amount.");
  return dollars * 100 + cents;
}

export async function fetchBuyingCriteriaRulesAction(eventIds: number[]): Promise<
  | { ok: true; rules: BuyingCriteriaRuleRow[] }
  | { ok: false; error: string }
> {
  const parsed = idsSchema.safeParse(eventIds);
  if (!parsed.success) {
    return { ok: false, error: "Invalid event id list." };
  }

  try {
    const rules = await prisma.eventBuyingCriteriaRule.findMany({
      where: { eventId: { in: parsed.data } },
      select: {
        id: true,
        eventId: true,
        categoryNum: true,
        kind: true,
        minQty: true,
        togetherCount: true,
        maxPriceUsdCents: true,
      },
      orderBy: [{ eventId: "asc" }, { categoryNum: "asc" }, { kind: "asc" }, { togetherCount: "asc" }, { minQty: "asc" }],
    });

    return {
      ok: true,
      rules: rules.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        categoryNum: r.categoryNum,
        kind: r.kind,
        minQty: r.minQty ?? null,
        togetherCount: r.togetherCount ?? null,
        maxPriceUsdCents: r.maxPriceUsdCents ?? null,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not load buying criteria rules. (${msg})` };
  }
}

export async function replaceBuyingCriteriaRulesAction(
  eventId: number,
  categoryNum: number,
  rules: BuyingCriteriaRuleInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = replaceSchema.safeParse({ eventId, categoryNum, rules });
  if (!parsed.success) {
    return { ok: false, error: "Invalid buying criteria rules payload." };
  }

  const data = parsed.data;
  let createData: Array<{
    eventId: number;
    categoryNum: number;
    kind: "QTY_UNDER_PRICE" | "TOGETHER_UNDER_PRICE";
    minQty: number | null;
    togetherCount: number | null;
    maxPriceUsdCents: number;
  }>;

  try {
    createData = data.rules.map((r) => {
      const maxPriceUsdCents = parseUsdToCents(r.maxPriceUsd);
      if (r.kind === "QTY_UNDER_PRICE") {
        return {
          eventId: data.eventId,
          categoryNum: data.categoryNum,
          kind: r.kind,
          minQty: r.minQty,
          togetherCount: null,
          maxPriceUsdCents,
        };
      }
      return {
        eventId: data.eventId,
        categoryNum: data.categoryNum,
        kind: r.kind,
        minQty: null,
        togetherCount: r.togetherCount,
        maxPriceUsdCents,
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  try {
    await prisma.$transaction(
      [
        prisma.eventBuyingCriteriaRule.deleteMany({
          where: { eventId: data.eventId, categoryNum: data.categoryNum },
        }),
        ...(createData.length
          ? [
              prisma.eventBuyingCriteriaRule.createMany({
                data: createData,
              }),
            ]
          : []),
      ],
      { timeout: 30_000 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save buying criteria rules. (${msg})` };
  }

  revalidatePath("/");
  revalidatePath("/resale");
  return { ok: true };
}

export async function saveBuyingCriteriaQtyRulesBulkAction(
  input: Array<{ eventId: number; categoryNum: number; minQty: number | null; maxPriceUsd: string | null }>,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const parsed = qtyBulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid buying criteria qty rules payload." };

  const items = parsed.data;
  if (items.length === 0) return { ok: true, saved: 0 };

  try {
    const payload = items.map((it) => {
      const hasPrice = it.maxPriceUsd !== null && it.maxPriceUsd.trim() !== "";
      if (!hasPrice) {
        return {
          event_id: it.eventId,
          category_num: it.categoryNum,
          min_qty: null,
          max_price_usd_cents: null,
        };
      }

      const moneyParsed = moneySchema.safeParse(it.maxPriceUsd);
      if (!moneyParsed.success) {
        throw new Error(moneyParsed.error.issues[0]?.message ?? "Invalid USD amount.");
      }

      return {
        event_id: it.eventId,
        category_num: it.categoryNum,
        min_qty: it.minQty,
        max_price_usd_cents: parseUsdToCents(moneyParsed.data),
      };
    });

    const json = JSON.stringify(payload);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb)
    AS x(event_id int, category_num int, min_qty int, max_price_usd_cents int)
)
DELETE FROM "event_buying_criteria_rules" r
USING input i
WHERE r."event_id" = i.event_id
  AND r."category_num" = i.category_num
  AND r."kind" = 'QTY_UNDER_PRICE';
        `,
        json,
      );

      await tx.$executeRawUnsafe(
        `
WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb)
    AS x(event_id int, category_num int, min_qty int, max_price_usd_cents int)
),
dedup AS (
  SELECT DISTINCT ON (event_id, category_num)
    event_id, category_num, min_qty, max_price_usd_cents
  FROM input
  WHERE max_price_usd_cents IS NOT NULL
  ORDER BY event_id, category_num, max_price_usd_cents ASC, min_qty ASC NULLS LAST
)
INSERT INTO "event_buying_criteria_rules" (
  "event_id",
  "category_num",
  "kind",
  "min_qty",
  "max_price_usd_cents",
  "created_at",
  "updated_at"
)
SELECT
  d.event_id,
  d.category_num,
  'QTY_UNDER_PRICE',
  d.min_qty,
  d.max_price_usd_cents,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM dedup d;
        `,
        json,
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save qty rules. (${msg})` };
  }

  revalidatePath("/");
  revalidatePath("/resale");
  return { ok: true, saved: items.length };
}

