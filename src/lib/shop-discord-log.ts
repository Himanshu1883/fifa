import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ShopDiscordNotifySummary } from "@/lib/shop-discord-notify";

export async function persistShopDiscordNotifyLog(summary: ShopDiscordNotifySummary): Promise<void> {
  if (summary.mode === "skipped" || !summary.attempted) return;

  const primary = summary.results[0];
  const status = primary?.status ?? primary?.response?.status ?? null;
  const error =
    summary.results.find((r) => r.error)?.error?.slice(0, 2000) ??
    (summary.ok ? null : "One or more Discord requests failed");

  try {
    await prisma.shopDiscordNotifyLog.create({
      data: {
        mode: summary.mode,
        matchCount: primary?.matchCount ?? summary.changedCount,
        changedCount: summary.changedCount,
        attempted: summary.attempted,
        ok: summary.ok,
        status: status ?? undefined,
        error,
        notifyRaw: summary.results as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    /* best-effort */
  }
}
