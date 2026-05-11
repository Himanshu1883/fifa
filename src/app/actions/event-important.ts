"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function setEventImportant(eventId: number, isImportant: boolean): Promise<void> {
  if (!Number.isFinite(eventId) || eventId < 1) return;

  await prisma.event.update({
    where: { id: eventId },
    data: { isImportant: Boolean(isImportant) },
  });

  revalidatePath("/");
}

