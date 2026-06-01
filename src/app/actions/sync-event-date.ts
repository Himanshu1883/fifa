"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseEventDateInput } from "@/lib/sb-date-to-ship";

export async function syncEventDateAction(
  eventId: number,
  eventDateIso: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(eventId) || eventId < 1) {
    return { ok: false, error: "Invalid event id." };
  }
  const eventDate = parseEventDateInput(eventDateIso);
  if (!eventDate) {
    return { ok: false, error: "Invalid event date." };
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { eventDate },
  });

  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
