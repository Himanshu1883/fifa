import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await prisma.gmailAccount.deleteMany({
    where: { userId },
  });

  return NextResponse.json({ ok: true, deletedAccounts: deleted.count });
}

