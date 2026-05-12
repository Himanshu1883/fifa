"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export type BuyingCriteriaRow = {
  eventId: number;
  cat1: string;
  cat2: string;
  cat3: string;
  cat3FrontRow: boolean;
  cat4: string;
};

const eventIdSchema = z.number().int().positive();

const listSchema = z
  .array(
    z.object({
      eventId: eventIdSchema,
      cat1: z.string(),
      cat2: z.string(),
      cat3: z.string(),
      cat3FrontRow: z.boolean(),
      cat4: z.string(),
    }),
  )
  .max(2000);

const idsSchema = z.array(eventIdSchema).max(2000);

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export async function fetchBuyingCriteriaAction(eventIds: number[]): Promise<{
  ok: true;
  rows: BuyingCriteriaRow[];
} | { ok: false; error: string }> {
  const parsed = idsSchema.safeParse(eventIds);
  if (!parsed.success) {
    return { ok: false, error: "Invalid event id list." };
  }

  try {
    const criteria = await prisma.eventBuyingCriteria.findMany({
      where: { eventId: { in: parsed.data } },
      select: { eventId: true, cat1: true, cat2: true, cat3: true, cat3FrontRow: true, cat4: true },
    });

    return {
      ok: true,
      rows: criteria.map((r) => ({
        eventId: r.eventId,
        cat1: r.cat1 ?? "",
        cat2: r.cat2 ?? "",
        cat3: r.cat3 ?? "",
        cat3FrontRow: r.cat3FrontRow,
        cat4: r.cat4 ?? "",
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not load buying criteria. (${msg})` };
  }
}

export async function saveBuyingCriteriaBulkAction(input: BuyingCriteriaRow[]): Promise<
  | { ok: true; saved: number }
  | { ok: false; error: string }
> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid buying criteria payload." };
  }

  const data = parsed.data;

  try {
    await prisma.$transaction(
      data.map((r) =>
        prisma.eventBuyingCriteria.upsert({
          where: { eventId: r.eventId },
          create: {
            eventId: r.eventId,
            cat1: emptyToNull(r.cat1),
            cat2: emptyToNull(r.cat2),
            cat3: emptyToNull(r.cat3),
            cat3FrontRow: r.cat3FrontRow,
            cat4: emptyToNull(r.cat4),
          },
          update: {
            cat1: emptyToNull(r.cat1),
            cat2: emptyToNull(r.cat2),
            cat3: emptyToNull(r.cat3),
            cat3FrontRow: r.cat3FrontRow,
            cat4: emptyToNull(r.cat4),
          },
        }),
      ),
      { timeout: 30_000 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save buying criteria. (${msg})` };
  }

  revalidatePath("/");
  return { ok: true, saved: data.length };
}

export async function setCat3FrontRowAction(
  eventId: number,
  cat3FrontRow: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsedId = eventIdSchema.safeParse(eventId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid event id." };
  }

  try {
    await prisma.eventBuyingCriteria.upsert({
      where: { eventId: parsedId.data },
      create: {
        eventId: parsedId.data,
        cat1: null,
        cat2: null,
        cat3: null,
        cat3FrontRow,
        cat4: null,
      },
      update: { cat3FrontRow },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not update CAT 3 front row. (${msg})` };
  }

  revalidatePath("/");
  return { ok: true };
}

