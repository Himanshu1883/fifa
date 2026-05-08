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

export async function createEventWithPrefs(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const matchLabel = String(formData.get("matchLabel") ?? "").trim();
  const prefId = String(formData.get("prefId") ?? "").trim();
  const resaleRaw = String(formData.get("resalePrefId") ?? "").trim();

  if (!name) {
    redirectWithPrefError("Event name is required.");
  }
  if (!prefId) {
    redirectWithPrefError("Pref ID is required.");
  }

  const last = await prisma.event.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;
  const label = matchLabel.length > 0 ? matchLabel : `Match${sortOrder}`;

  await prisma.event.create({
    data: {
      name,
      matchLabel: label,
      sortOrder,
      prefId,
      resalePrefId: resaleRaw.length > 0 ? resaleRaw : null,
    },
  });

  revalidatePath("/");
}
