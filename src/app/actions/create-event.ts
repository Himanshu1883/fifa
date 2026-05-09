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

const createEventFormSchema = z.object({
  matchLabel: trimmedNonEmpty("Match label"),
  name: trimmedNonEmpty("Event name"),
  stage: optionalTrimmedNullable,
  venue: optionalTrimmedNullable,
  country: optionalTrimmedNullable,
  prefId: trimmedNonEmpty("Pref ID"),
  resalePrefId: optionalTrimmedNullable,
});

function parseSortOrderInput(
  raw: string,
):
  | { ok: true; mode: "auto" }
  | { ok: true; mode: "fixed"; value: number }
  | { ok: false; message: string } {
  const s = raw.trim();
  if (s === "") {
    return { ok: true, mode: "auto" };
  }
  if (!/^-?\d+$/.test(s)) {
    return { ok: false, message: "Sort order must be an integer." };
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isSafeInteger(n)) {
    return { ok: false, message: "Sort order must be a safe integer." };
  }
  return { ok: true, mode: "fixed", value: n };
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

export type CreateEventActionResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string> };

export async function createEventAction(formData: FormData): Promise<CreateEventActionResult> {
  const resaleRaw = formData.get("resalePrefId");

  const raw = {
    matchLabel: String(formData.get("matchLabel") ?? ""),
    name: String(formData.get("name") ?? ""),
    stage: formData.get("stage"),
    venue: formData.get("venue"),
    country: formData.get("country"),
    prefId: String(formData.get("prefId") ?? ""),
    resalePrefId:
      resaleRaw == null ? null : typeof resaleRaw === "string" ? resaleRaw : String(resaleRaw),
  };

  const parsed = createEventFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  }

  const sortParsed = parseSortOrderInput(String(formData.get("sortOrder") ?? ""));
  if (!sortParsed.ok) {
    return { ok: false, fieldErrors: { sortOrder: sortParsed.message } };
  }

  let sortOrder: number;
  if (sortParsed.mode === "auto") {
    const last = await prisma.event.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? 0) + 1;
  } else {
    sortOrder = sortParsed.value;
  }

  try {
    await prisma.event.create({
      data: {
        matchLabel: parsed.data.matchLabel,
        sortOrder,
        name: parsed.data.name,
        stage: parsed.data.stage,
        venue: parsed.data.venue,
        country: parsed.data.country,
        prefId: parsed.data.prefId,
        resalePrefId: parsed.data.resalePrefId,
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
