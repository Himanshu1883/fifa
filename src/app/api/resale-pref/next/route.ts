import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Returns the next distinct `Event.resalePrefId` in stable order (match list order),
 * advancing a persisted cursor so each GET returns the following id until the list ends, then wraps to the first.
 *
 * Optional lock: set `RESALE_PREF_ROTATION_SECRET` and send `Authorization: Bearer <secret>` or `?secret=<secret>`.
 */
function unauthorized(req: Request): NextResponse | null {
  const secret = process.env.RESALE_PREF_ROTATION_SECRET?.trim();
  if (!secret) {
    return null;
  }
  const auth = req.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const q = new URL(req.url).searchParams.get("secret")?.trim() ?? "";
  if (bearer === secret || q === secret) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const denied = unauthorized(req);
  if (denied) {
    return denied;
  }

  try {
    const payload = await prisma.$transaction(async (tx) => {
      const rows = await tx.event.findMany({
        where: { resalePrefId: { not: null } },
        select: { resalePrefId: true, sortOrder: true, id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });

      const resalePrefIds: string[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        const pid = r.resalePrefId!;
        if (!seen.has(pid)) {
          seen.add(pid);
          resalePrefIds.push(pid);
        }
      }

      if (resalePrefIds.length === 0) {
        return { kind: "empty" as const };
      }

      await tx.resalePrefRotationState.upsert({
        where: { id: 1 },
        create: { id: 1, nextIndex: 0 },
        update: {},
      });

      const state = await tx.resalePrefRotationState.findUniqueOrThrow({
        where: { id: 1 },
      });

      const n = resalePrefIds.length;
      const idx = ((state.nextIndex % n) + n) % n;
      const resalePrefId = resalePrefIds[idx]!;
      const nextIndex = (state.nextIndex + 1) % n;

      await tx.resalePrefRotationState.update({
        where: { id: 1 },
        data: { nextIndex },
      });

      return {
        kind: "ok" as const,
        resalePrefId,
        index: idx,
        total: n,
        wrappedToStart: nextIndex === 0,
      };
    });

    if (payload.kind === "empty") {
      return NextResponse.json(
        { error: "No events with resalePrefId" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      resalePrefId: payload.resalePrefId,
      index: payload.index,
      total: payload.total,
      wrappedToStart: payload.wrappedToStart,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message.slice(0, 400) },
      { status: 500 },
    );
  }
}
