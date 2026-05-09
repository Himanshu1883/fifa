"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function redirectWithPrefError(message: string): never {
  redirect(`/?prefsErr=${encodeURIComponent(message)}`);
}

export async function updateEventPrefs(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const prefId = String(formData.get("prefId") ?? "").trim();
  const resaleRaw = String(formData.get("resalePrefId") ?? "").trim();

  if (!Number.isFinite(id) || id < 1) {
    redirectWithPrefError("Invalid event id.");
  }
  if (!prefId) {
    redirectWithPrefError("Pref ID cannot be empty.");
  }

  const exists = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    redirectWithPrefError("Event not found.");
  }

  await prisma.event.update({
    where: { id },
    data: {
      prefId,
      resalePrefId: resaleRaw.length > 0 ? resaleRaw : null,
    },
  });

  revalidatePath("/");
}
