"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const trimmedNonEmpty = (label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, `${label} is required.`));

const optionalTrimmedNullable = z
  .union([z.string(), z.undefined(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const t = String(v).trim();
    return t === "" ? null : t;
  });

const updateEventFormSchema = z.object({
  id: z.number().int().positive(),
  matchLabel: trimmedNonEmpty("Match label"),
  name: trimmedNonEmpty("Event name"),
  stage: optionalTrimmedNullable,
  venue: optionalTrimmedNullable,
  country: optionalTrimmedNullable,
  prefId: trimmedNonEmpty("Pref ID"),
  resalePrefId: optionalTrimmedNullable,
  isImportant: z.boolean(),
  sortOrder: z.number().int(),
});

function parseRequiredInteger(
  raw: string,
  label: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const s = raw.trim();
  if (s === "") return { ok: false, message: `${label} is required.` };
  if (!/^-?\d+$/.test(s)) return { ok: false, message: `${label} must be an integer.` };
  const n = Number.parseInt(s, 10);
  if (!Number.isSafeInteger(n)) return { ok: false, message: `${label} must be a safe integer.` };
  return { ok: true, value: n };
}

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

export type UpdateEventActionResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string> };

export async function updateEventAction(formData: FormData): Promise<UpdateEventActionResult> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, fieldErrors: { _form: "Invalid event id." } };
  }

  const sortRaw = String(formData.get("sortOrder") ?? "");
  const sortParsed = parseRequiredInteger(sortRaw, "Sort order");
  if (!sortParsed.ok) {
    return { ok: false, fieldErrors: { sortOrder: sortParsed.message } };
  }

  const resaleRaw = formData.get("resalePrefId");
  const raw = {
    id,
    matchLabel: String(formData.get("matchLabel") ?? ""),
    name: String(formData.get("name") ?? ""),
    stage: formData.get("stage"),
    venue: formData.get("venue"),
    country: formData.get("country"),
    prefId: String(formData.get("prefId") ?? ""),
    resalePrefId:
      resaleRaw == null ? null : typeof resaleRaw === "string" ? resaleRaw : String(resaleRaw),
    isImportant: formData.get("isImportant") != null,
    sortOrder: sortParsed.value,
  };

  const parsed = updateEventFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  }

  try {
    await prisma.event.update({
      where: { id: parsed.data.id },
      data: {
        matchLabel: parsed.data.matchLabel,
        sortOrder: parsed.data.sortOrder,
        name: parsed.data.name,
        stage: parsed.data.stage,
        venue: parsed.data.venue,
        country: parsed.data.country,
        prefId: parsed.data.prefId,
        resalePrefId: parsed.data.resalePrefId,
        isImportant: parsed.data.isImportant,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fieldErrors: {
        _form:
          msg.includes("Unique") || msg.includes("unique")
            ? "Could not save: matching row may already exist."
            : `Could not save: ${msg}`,
      },
    };
  }

  revalidatePath("/");
  return { ok: true };
}

