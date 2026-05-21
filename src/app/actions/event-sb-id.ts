"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const optionalTrimmedSbId = z
  .union([z.string(), z.undefined(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  });

const updateSbEventIdSchema = z.object({
  id: z.number().int().positive(),
  sbEventId: optionalTrimmedSbId,
});

function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const head = issue.path[0];
    const key =
      typeof head === "string" || typeof head === "number" ? String(head) : "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export type UpdateSbEventIdActionResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string> };

export async function updateSbEventIdAction(formData: FormData): Promise<UpdateSbEventIdActionResult> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, fieldErrors: { _form: "Invalid event id." } };
  }

  const parsed = updateSbEventIdSchema.safeParse({
    id,
    sbEventId: formData.get("sbEventId"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  }

  try {
    await prisma.event.update({
      where: { id: parsed.data.id },
      data: { sbEventId: parsed.data.sbEventId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, fieldErrors: { _form: `Could not save: ${msg}` } };
  }

  revalidatePath("/");
  revalidatePath("/resale");
  revalidatePath(`/events/${parsed.data.id}`);
  return { ok: true };
}
