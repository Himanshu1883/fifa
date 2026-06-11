import "server-only";

import {
  amountRawToUsdString,
  sendDiscordResaleDedicatedMessage,
  type DiscordNotifyResult,
} from "@/lib/discord-webhook";
import { resolveDedicatedMatchWebhookUrl } from "@/lib/webhook-settings";
import { isDedicatedMatchWebhook, parseDedicatedMatchNumber } from "@/lib/dedicated-match-webhooks";
import { parseEventMatchNumber } from "@/lib/parse-match-label-number";
import { prisma } from "@/lib/prisma";

type ResaleInventoryRow = {
  categoryId: string;
  categoryName: string;
  amount: unknown;
};

export type ResaleCategoryPriceState = {
  categoryId: string;
  categoryName: string;
  minAmountRaw: number | null;
  count: number;
};

function amountToRaw(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && "toNumber" in v && typeof (v as { toNumber: () => number }).toNumber === "function") {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Aggregate min price + listing count per category — target-price fingerprint for dedicated resale webhooks. */
export function buildResaleCategoryPriceState(rows: ResaleInventoryRow[]): ResaleCategoryPriceState[] {
  const byCategory = new Map<string, ResaleCategoryPriceState>();
  for (const row of rows) {
    const categoryId = row.categoryId?.trim() || "unknown";
    const existing = byCategory.get(categoryId);
    const amountRaw = amountToRaw(row.amount);
    if (!existing) {
      byCategory.set(categoryId, {
        categoryId,
        categoryName: row.categoryName?.trim() || categoryId,
        minAmountRaw: amountRaw,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (amountRaw != null && (existing.minAmountRaw == null || amountRaw < existing.minAmountRaw)) {
      existing.minAmountRaw = amountRaw;
    }
  }
  return [...byCategory.values()].sort((a, b) =>
    a.categoryId.localeCompare(b.categoryId, undefined, { numeric: true }),
  );
}

export function resaleDiscordNotifyFingerprint(rows: ResaleInventoryRow[]): string {
  const states = buildResaleCategoryPriceState(rows);
  if (states.length === 0) return "";
  return states
    .map((s) => `${s.categoryId}:${s.minAmountRaw ?? ""}:${s.count}`)
    .join(";");
}

export function parseResaleDiscordNotifyFingerprint(
  fingerprint: string | null | undefined,
): Map<string, { minAmountRaw: number | null; count: number }> {
  const map = new Map<string, { minAmountRaw: number | null; count: number }>();
  if (!fingerprint) return map;
  for (const part of fingerprint.split(";")) {
    if (!part) continue;
    const bits = part.split(":");
    if (bits.length < 3) continue;
    const categoryId = bits[0];
    const minRaw = bits[1] === "" ? null : Number(bits[1]);
    const count = Number(bits[2]);
    if (!categoryId || !Number.isFinite(count)) continue;
    map.set(categoryId, {
      minAmountRaw: minRaw != null && Number.isFinite(minRaw) ? minRaw : null,
      count,
    });
  }
  return map;
}

export function shouldSendResaleDiscordDelta(
  rows: ResaleInventoryRow[],
  storedFingerprint: string | null | undefined,
): boolean {
  const fingerprint = resaleDiscordNotifyFingerprint(rows);
  if (!fingerprint) return false;
  const stored = storedFingerprint ?? null;
  if (stored === null) return true;
  return fingerprint !== stored;
}

export function computeChangedResaleCategoryStates(
  storedFingerprint: string | null | undefined,
  rows: ResaleInventoryRow[],
): ResaleCategoryPriceState[] {
  const current = buildResaleCategoryPriceState(rows);
  const stored = parseResaleDiscordNotifyFingerprint(storedFingerprint);
  const changed: ResaleCategoryPriceState[] = [];
  for (const state of current) {
    const prev = stored.get(state.categoryId);
    if (!prev || prev.minAmountRaw !== state.minAmountRaw || prev.count !== state.count) {
      changed.push(state);
    }
  }
  return changed;
}

export type ResaleDiscordFingerprintClaim =
  | { action: "skip"; reason: "same_fingerprint" | "no_inventory" | "no_webhook" }
  | { action: "send"; previousFingerprint: string | null; fingerprint: string; notifyLogId: number; mode: "baseline" | "delta" }
  | { action: "error"; message: string };

export async function loadResaleDiscordNotifyFingerprint(matchNum: number): Promise<string | null> {
  try {
    const row = await prisma.resaleDiscordMatchNotifyState.findUnique({
      where: { matchNum },
      select: { lastDiscordNotifyFingerprint: true },
    });
    return row?.lastDiscordNotifyFingerprint ?? null;
  } catch {
    return null;
  }
}

export async function claimResaleDiscordNotifyFingerprint(
  matchNum: number,
  rows: ResaleInventoryRow[],
): Promise<ResaleDiscordFingerprintClaim> {
  const fp = resaleDiscordNotifyFingerprint(rows);
  if (!fp) {
    return { action: "skip", reason: "no_inventory" };
  }

  const webhookUrl = isDedicatedMatchWebhook(matchNum)
    ? await resolveDedicatedMatchWebhookUrl(matchNum)
    : null;
  if (!webhookUrl) {
    return { action: "skip", reason: "no_webhook" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${matchNum + 1_000_000})`;

      const existing = await tx.resaleDiscordMatchNotifyState.findUnique({
        where: { matchNum },
        select: { lastDiscordNotifyFingerprint: true },
      });
      const stored = existing?.lastDiscordNotifyFingerprint ?? null;
      if (!shouldSendResaleDiscordDelta(rows, stored)) {
        return { action: "skip", reason: "same_fingerprint" as const };
      }

      const priorNotify = await tx.resaleDiscordMatchNotifyLog.findFirst({
        where: { matchNum, fingerprint: fp },
        select: { id: true },
      });
      if (priorNotify) {
        if (stored !== fp) {
          await tx.resaleDiscordMatchNotifyState.upsert({
            where: { matchNum },
            create: { matchNum, lastDiscordNotifyFingerprint: fp },
            update: { lastDiscordNotifyFingerprint: fp },
          });
        }
        return { action: "skip", reason: "same_fingerprint" as const };
      }

      const notifyLog = await tx.resaleDiscordMatchNotifyLog.create({
        data: { matchNum, fingerprint: fp },
      });

      await tx.resaleDiscordMatchNotifyState.upsert({
        where: { matchNum },
        create: { matchNum, lastDiscordNotifyFingerprint: fp },
        update: { lastDiscordNotifyFingerprint: fp },
      });

      return {
        action: "send",
        previousFingerprint: stored,
        fingerprint: fp,
        notifyLogId: notifyLog.id,
        mode: stored === null ? "baseline" : "delta",
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { action: "error", message: msg };
  }
}

export async function revertResaleDiscordNotifyFingerprint(
  matchNum: number,
  previousFingerprint: string | null,
  notifyLogId?: number,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.resaleDiscordMatchNotifyState.upsert({
        where: { matchNum },
        create: { matchNum, lastDiscordNotifyFingerprint: previousFingerprint },
        update: { lastDiscordNotifyFingerprint: previousFingerprint },
      });
      if (notifyLogId != null) {
        await tx.resaleDiscordMatchNotifyLog.deleteMany({ where: { id: notifyLogId } });
      }
    });
  } catch {
    // best-effort revert
  }
}

function formatResaleCategoryLines(states: ResaleCategoryPriceState[]): string {
  return states
    .map((s) => {
      const price = amountRawToUsdString(s.minAmountRaw);
      const label = s.categoryName || s.categoryId;
      return `• **${label}** · min **${price}** · ${s.count.toLocaleString("en-US")} listing${s.count === 1 ? "" : "s"}`;
    })
    .join("\n");
}

export async function maybeNotifyDedicatedResaleDiscord(input: {
  eventId: number;
  eventLabel: string;
  eventName: string;
  prefId: string;
}): Promise<DiscordNotifyResult & { mode?: "baseline" | "delta" | "skipped" }> {
  const provider = "discord" as const;
  const matchNum = parseDedicatedMatchNumber(input.eventLabel, input.eventName);
  if (!matchNum) {
    return { attempted: false, ok: false, provider, mode: "skipped" };
  }

  let rows: ResaleInventoryRow[];
  try {
    rows = await prisma.sockAvailable.findMany({
      where: { eventId: input.eventId, kind: "RESALE" },
      select: { categoryId: true, categoryName: true, amount: true },
    });
  } catch {
    return { attempted: false, ok: false, provider, mode: "skipped" };
  }

  const claim = await claimResaleDiscordNotifyFingerprint(matchNum, rows);
  if (claim.action === "skip") {
    return { attempted: false, ok: true, provider, mode: "skipped" };
  }
  if (claim.action === "error") {
    return { attempted: false, ok: false, provider, error: claim.message, mode: "skipped" };
  }

  const currentStates = buildResaleCategoryPriceState(rows);
  const changedStates =
    claim.mode === "baseline"
      ? currentStates
      : computeChangedResaleCategoryStates(claim.previousFingerprint, rows);

  if (changedStates.length === 0) {
    await revertResaleDiscordNotifyFingerprint(matchNum, claim.previousFingerprint, claim.notifyLogId);
    return { attempted: false, ok: true, provider, mode: "skipped" };
  }

  const result = await sendDiscordResaleDedicatedMessage({
    eventLabel: input.eventLabel,
    eventName: input.eventName,
    eventId: input.eventId,
    prefId: input.prefId,
    matchNum,
    mode: claim.mode,
    categoryLines: formatResaleCategoryLines(changedStates),
    totalListings: rows.length,
  });

  if (!result.ok) {
    await revertResaleDiscordNotifyFingerprint(matchNum, claim.previousFingerprint, claim.notifyLogId);
  }

  return { ...result, mode: claim.mode };
}

/** @internal exported for tests */
export function isDedicatedResaleEvent(matchLabel: string, name: string): boolean {
  const matchNum = parseEventMatchNumber(matchLabel, name);
  return isDedicatedMatchWebhook(matchNum);
}
