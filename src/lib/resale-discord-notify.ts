import "server-only";

import {
  sendDiscordNewListingsMessage,
  type DiscordNotifyResult,
} from "@/lib/discord-webhook";
import { resolveDedicatedMatchWebhookUrl } from "@/lib/webhook-settings";
import {
  isDedicatedResaleMatch,
  parseDedicatedResaleMatchNumber,
  type DedicatedResaleMatchNumber,
} from "@/lib/dedicated-match-webhooks";
import { sortNewListingsByPriceAsc, type SockAvailableNewListingKey } from "@/lib/sock-available-diff";
import { prisma } from "@/lib/prisma";

type ResaleInventoryRow = {
  categoryId: string;
  categoryName: string;
  amount: unknown;
};

type ResaleSeatRow = {
  seatId: string;
  resaleMovementId: string | null;
  categoryId: string;
  categoryName: string;
  blockName: string;
  row: string;
  seatNumber: string;
  amount: unknown;
};

function resaleSeatRowToListingKey(row: ResaleSeatRow): SockAvailableNewListingKey {
  const key = row.resaleMovementId ? `m:${row.resaleMovementId}` : `s:${row.seatId}`;
  return {
    key,
    seatId: row.seatId,
    resaleMovementId: row.resaleMovementId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    blockName: row.blockName,
    row: row.row,
    seatNumber: row.seatNumber,
    amountRaw: amountToRaw(row.amount),
  };
}

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

  const webhookUrl = isDedicatedResaleMatch(matchNum)
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

/** Clear resale notify dedup so the next scrape sends a baseline to a newly configured webhook. */
export async function resetDedicatedResaleDiscordNotifyState(matchNum: number): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.resaleDiscordMatchNotifyState.deleteMany({ where: { matchNum } });
      await tx.resaleDiscordMatchNotifyLog.deleteMany({ where: { matchNum } });
    });
  } catch {
    // best-effort reset
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

async function loadResaleSeatRows(eventId: number): Promise<ResaleSeatRow[]> {
  return prisma.sockAvailable.findMany({
    where: { eventId, kind: "RESALE" },
    select: {
      seatId: true,
      resaleMovementId: true,
      categoryId: true,
      categoryName: true,
      blockName: true,
      row: true,
      seatNumber: true,
      amount: true,
    },
  });
}

export async function maybeNotifyDedicatedResaleDiscord(input: {
  eventId: number;
  eventLabel: string;
  eventName: string;
  prefId: string;
}): Promise<DiscordNotifyResult & { mode?: "baseline" | "delta" | "skipped" }> {
  const provider = "discord" as const;
  const matchNum = parseDedicatedResaleMatchNumber(input.eventLabel, input.eventName);
  if (!matchNum) {
    return { attempted: false, ok: false, provider, mode: "skipped" };
  }

  let seatRows: ResaleSeatRow[];
  try {
    seatRows = await loadResaleSeatRows(input.eventId);
  } catch {
    return { attempted: false, ok: false, provider, mode: "skipped" };
  }

  const fingerprintRows: ResaleInventoryRow[] = seatRows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    amount: r.amount,
  }));

  const claim = await claimResaleDiscordNotifyFingerprint(matchNum, fingerprintRows);
  if (claim.action === "skip") {
    return { attempted: false, ok: true, provider, mode: "skipped" };
  }
  if (claim.action === "error") {
    return { attempted: false, ok: false, provider, error: claim.message, mode: "skipped" };
  }

  const listings = sortNewListingsByPriceAsc(seatRows.map(resaleSeatRowToListingKey));
  if (listings.length === 0) {
    await revertResaleDiscordNotifyFingerprint(matchNum, claim.previousFingerprint, claim.notifyLogId);
    return { attempted: false, ok: true, provider, mode: "skipped" };
  }

  const result = await sendDiscordNewListingsMessage({
    eventLabel: input.eventLabel,
    eventName: input.eventName,
    eventId: input.eventId,
    prefId: input.prefId,
    kind: "RESALE",
    newCount: listings.length,
    newSeatIds: listings,
    dedicatedMatchNum: matchNum,
    isNewListings: false,
  });

  if (!result.ok) {
    await revertResaleDiscordNotifyFingerprint(matchNum, claim.previousFingerprint, claim.notifyLogId);
  }

  return { ...result, mode: claim.mode };
}

/** Sync dedup state after a dedicated new-listings send (no Discord POST). */
export async function persistResaleDiscordNotifyFingerprintState(
  matchNum: number,
  rows: ResaleInventoryRow[],
): Promise<void> {
  const fp = resaleDiscordNotifyFingerprint(rows);
  if (!fp) return;
  try {
    await prisma.resaleDiscordMatchNotifyState.upsert({
      where: { matchNum },
      create: { matchNum, lastDiscordNotifyFingerprint: fp },
      update: { lastDiscordNotifyFingerprint: fp },
    });
  } catch {
    // best-effort
  }
}

export function resolveDedicatedResaleMatchNum(
  matchLabel: string | null | undefined,
  label: string,
  name: string,
): DedicatedResaleMatchNumber | null {
  return (
    parseDedicatedResaleMatchNumber(matchLabel?.trim() || label.trim(), name) ??
    parseDedicatedResaleMatchNumber(label.trim(), name)
  );
}

/** @internal exported for tests */
export function isDedicatedResaleEvent(matchLabel: string, name: string): boolean {
  return resolveDedicatedResaleMatchNum(matchLabel, matchLabel, name) != null;
}
