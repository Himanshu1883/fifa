import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type CategoryHierarchyItem = {
  categoryId: string;
  categoryName: string;
  blocks: { blockId: string; blockName: string; availabilityResale: number | null }[];
};

const getCategoryHierarchyForEvent = unstable_cache(
  async (eventId: number): Promise<{ hierarchy: CategoryHierarchyItem[] }> => {
    const [categoryRows, seatNowRows] = await Promise.all([
      prisma.shopEventCategoryBlock.findMany({
        where: { eventId },
        select: {
          categoryId: true,
          categoryName: true,
          categoryBlockId: true,
          categoryBlockName: true,
        },
        orderBy: [{ categoryId: "asc" }, { categoryBlockId: "asc" }],
      }),
      prisma.eventBlockSeatNow.findMany({
        where: { eventId },
        select: { categoryId: true, blockId: true, availabilityResale: true },
      }),
    ]);

    const resaleByKey = new Map<string, number>();
    for (const r of seatNowRows) {
      resaleByKey.set(`${r.categoryId}::${r.blockId}`, r.availabilityResale);
    }

    const cats = new Map<string, { name: string; blocks: Map<string, string> }>();
    for (const r of categoryRows) {
      let entry = cats.get(r.categoryId);
      if (!entry) {
        entry = { name: r.categoryName, blocks: new Map() };
        cats.set(r.categoryId, entry);
      }
      entry.blocks.set(r.categoryBlockId, r.categoryBlockName);
    }

    const hierarchy: CategoryHierarchyItem[] = [...cats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoryId, { name, blocks }]) => ({
        categoryId,
        categoryName: name,
        blocks: [...blocks.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([blockId, blockName]) => ({
            blockId,
            blockName,
            availabilityResale: resaleByKey.get(`${categoryId}::${blockId}`) ?? null,
          })),
      }));

    return { hierarchy };
  },
  ["event-category-hierarchy-v2"],
  { revalidate: 15 },
);

export async function GET(_req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await ctx.params;
  const id = Number.parseInt(eventId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid eventId." }, { status: 400 });
  }

  try {
    const data = await getCategoryHierarchyForEvent(id);
    return NextResponse.json({ ok: true, eventId: id, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 503 });
  }
}

