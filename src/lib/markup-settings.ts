import { prisma } from "@/lib/prisma";

const MARKUP_SETTINGS_ID = 1;

export async function getPersistedMarkupPercent(): Promise<number> {
  const row = await prisma.markupSettings.findUnique({
    where: { id: MARKUP_SETTINGS_ID },
    select: { markupPercent: true },
  });
  const n = row?.markupPercent ?? 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setPersistedMarkupPercent(value: number): Promise<void> {
  const n = Number.isFinite(value) && value >= 0 ? value : 0;
  await prisma.markupSettings.upsert({
    where: { id: MARKUP_SETTINGS_ID },
    create: { id: MARKUP_SETTINGS_ID, markupPercent: n },
    update: { markupPercent: n },
  });
}
