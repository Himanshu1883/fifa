import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
import { decryptRefreshToken } from "@/lib/gmail/token-crypto";
import { gmailGetMessageMetadata, gmailListMessages, refreshAccessToken } from "@/lib/gmail/gmail-api";

export const runtime = "nodejs";

function parseLimit(req: Request): number {
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit")?.trim() ?? "";
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function safeDateFromHeader(raw: string | undefined): Date | null {
  const v = raw?.trim();
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(req);

  const account = await prisma.gmailAccount.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (!account) {
    return NextResponse.json({ error: "No Gmail account connected." }, { status: 404 });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(account.encryptedRefreshToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(refreshToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 800) }, { status: 502 });
  }

  let ids: string[];
  try {
    ids = await gmailListMessages(accessToken, limit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 800) }, { status: 502 });
  }

  let upserted = 0;
  const errors: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      const meta = await gmailGetMessageMetadata(accessToken, id);
      const internalMsRaw = meta.internalDate?.trim() ?? "";
      const internalDateMs = internalMsRaw ? BigInt(internalMsRaw) : null;

      await prisma.gmailMessage.upsert({
        where: { gmailMessageId: meta.id },
        create: {
          gmailAccountId: account.id,
          gmailMessageId: meta.id,
          threadId: meta.threadId ?? null,
          from: meta.headers["from"] ?? null,
          subject: meta.headers["subject"] ?? null,
          date: safeDateFromHeader(meta.headers["date"]) ?? null,
          snippet: meta.snippet ?? null,
          internalDateMs,
          rawHeaders: meta.rawHeaders as unknown as object,
        },
        update: {
          gmailAccountId: account.id,
          threadId: meta.threadId ?? null,
          from: meta.headers["from"] ?? null,
          subject: meta.headers["subject"] ?? null,
          date: safeDateFromHeader(meta.headers["date"]) ?? null,
          snippet: meta.snippet ?? null,
          internalDateMs,
          rawHeaders: meta.rawHeaders as unknown as object,
        },
      });

      upserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ id, error: msg.slice(0, 220) });
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: ids.length,
    upserted,
    ...(errors.length ? { errors } : {}),
  });
}

