import "server-only";

import performanceIds from "@/lib/shop-fifa-performance-ids.json";
import { SHOP_MATCH_COUNT } from "@/lib/shop-match-grid";
import { fetchSeatsidekickMatch } from "@/lib/seatsidekick-fetch";
import {
  diffNewSeatsidekickListings,
  flattenSeatsidekickToSnapshot,
  pickLowestSeatsidekickListings,
  seatsidekickListingsFingerprint,
  seatsidekickMatchLabel,
  seatsidekickMatchName,
} from "@/lib/seatsidekick-listings";
import {
  loadSeatsidekickSnapshot,
  saveSeatsidekickSnapshot,
} from "@/lib/seatsidekick-snapshot-store";
import {
  postSeatsidekickListingsDualDiscord,
  dualDiscordPostSucceeded,
} from "@/lib/seatsidekick-discord-post";
import type { DiscordNotifyResult } from "@/lib/discord-webhook";
import type { SockAvailableNewListingKey } from "@/lib/sock-available-diff";
import {
  listMatchNumsWithPerMatchResaleWebhook,
  resolveMatchResaleWebhookUrlDedicatedOnly,
} from "@/lib/match-discord-webhooks";
import { prisma } from "@/lib/prisma";
import { resolveDiscordNewListingsWebhookUrl } from "@/lib/webhook-settings";

export type SeatsidekickPostMode = "lowest" | "new";

export type SeatsidekickPollMatchResult = {
  performanceId: string;
  matchNum: number | null;
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  newCount?: number;
  totalSeats?: number;
  discord?: DiscordNotifyResult;
  discordDedicated?: DiscordNotifyResult;
  discordGeneral?: DiscordNotifyResult;
  error?: string;
};

function seatsidekickPollEnabled(): boolean {
  const raw = (process.env.SEATSIDEKICK_POLL_ENABLED ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

export function seatsidekickPostMode(): SeatsidekickPostMode {
  const raw = (process.env.SEATSIDEKICK_POST_MODE ?? "lowest").trim().toLowerCase();
  return raw === "new" ? "new" : "lowest";
}

export function seatsidekickPostTopN(): number {
  const n = Number(process.env.SEATSIDEKICK_POST_TOP_N ?? "20");
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(45, Math.floor(n));
}

/** When true (default), lowest mode posts only if top-N seats/prices changed vs last successful post. */
export function seatsidekickPostOnlyOnChange(): boolean {
  const raw = (process.env.SEATSIDEKICK_POST_ONLY_ON_CHANGE ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function parseOnlyMatchNums(): Set<number> | null {
  const raw = process.env.SEATSIDEKICK_POLL_ONLY_MATCH_NUMS?.trim();
  if (!raw) return null;
  const nums = raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= SHOP_MATCH_COUNT);
  return nums.length > 0 ? new Set(nums) : null;
}

/** All FIFA performance IDs for matches 1–104 (SeatSidekick URL key). */
export function listSeatsidekickPerformanceTargets(): Array<{ matchNum: number; performanceId: string }> {
  const out: Array<{ matchNum: number; performanceId: string }> = [];
  const ids = performanceIds as readonly string[];
  for (let m = 1; m <= SHOP_MATCH_COUNT && m <= ids.length; m++) {
    const performanceId = String(ids[m - 1] ?? "").trim();
    if (performanceId) out.push({ matchNum: m, performanceId });
  }
  return out;
}

async function resolveEventContext(performanceId: string): Promise<{
  eventId: number;
  eventLabel: string;
  eventName: string;
  matchNum: number | null;
}> {
  try {
    const row = await prisma.event.findFirst({
      where: {
        OR: [{ prefId: performanceId }, { resalePrefId: performanceId }],
      },
      select: { id: true, matchLabel: true, name: true },
    });
    if (row) {
      const matchNum = (() => {
        const m = row.matchLabel.match(/^match\s*(\d+)$/i);
        return m ? Number(m[1]) : null;
      })();
      return {
        eventId: row.id,
        eventLabel: row.matchLabel?.trim() || (matchNum ? `Match${matchNum}` : "Match"),
        eventName: row.name?.trim() || "—",
        matchNum,
      };
    }
  } catch {
    /* optional enrichment */
  }
  return { eventId: 0, eventLabel: "Match", eventName: "—", matchNum: null };
}

async function postListingsToDualDiscord(input: {
  performanceId: string;
  matchNum: number | null;
  data: Awaited<ReturnType<typeof fetchSeatsidekickMatch>>;
  listings: SockAvailableNewListingKey[];
  dedicatedWebhook: string | null;
  generalWebhook: string | null;
  totalSeats: number;
  titleOverride?: string;
  skipReasonIfUnchanged?: string;
  saveSnapshot: () => Promise<void>;
}): Promise<SeatsidekickPollMatchResult> {
  const { performanceId, matchNum, data, listings, totalSeats } = input;
  const dbCtx = await resolveEventContext(performanceId);
  const eventLabel = matchNum != null ? seatsidekickMatchLabel(matchNum) : dbCtx.eventLabel;
  const eventName =
    seatsidekickMatchName(data.match) !== "—" ? seatsidekickMatchName(data.match) : dbCtx.eventName;

  const dual = await postSeatsidekickListingsDualDiscord({
    eventLabel,
    eventName,
    eventId: dbCtx.eventId,
    prefId: performanceId,
    matchNum,
    newCount: listings.length,
    newSeatIds: listings,
    dedicatedWebhookUrl: input.dedicatedWebhook,
    generalWebhookUrl: input.generalWebhook,
    isNewListings: !input.titleOverride,
    titleOverride: input.titleOverride,
  });

  const discord = dual.combined;

  if (discord.attempted && !dualDiscordPostSucceeded(dual)) {
    return {
      performanceId,
      matchNum,
      ok: false,
      newCount: listings.length,
      totalSeats,
      discord,
      discordDedicated: dual.dedicated,
      discordGeneral: dual.general,
      error: discord.error ?? "discord_failed",
    };
  }

  if (dualDiscordPostSucceeded(dual)) {
    await input.saveSnapshot();
  }

  return {
    performanceId,
    matchNum,
    ok: discord.ok || !discord.attempted,
    skipped: !discord.attempted,
    skipReason: discord.attempted ? undefined : "discord_not_attempted",
    newCount: listings.length,
    totalSeats,
    discord,
    discordDedicated: dual.dedicated,
    discordGeneral: dual.general,
  };
}

async function pollSeatsidekickMatchLowest(input: {
  matchNum: number;
  performanceId: string;
  dedicatedWebhook: string | null;
  generalWebhook: string | null;
}): Promise<SeatsidekickPollMatchResult> {
  const performanceId = input.performanceId.trim();
  const topN = seatsidekickPostTopN();
  const data = await fetchSeatsidekickMatch(performanceId);
  const current = flattenSeatsidekickToSnapshot(data);
  const matchNum = current.matchNum ?? input.matchNum;
  const totalSeats = Object.keys(current.seats).length;

  const listings = pickLowestSeatsidekickListings(current, topN);
  if (listings.length === 0) {
    return {
      performanceId,
      matchNum,
      ok: true,
      skipped: true,
      skipReason: "empty_inventory",
      newCount: 0,
      totalSeats,
    };
  }

  const fingerprint = seatsidekickListingsFingerprint(listings);
  const previous = await loadSeatsidekickSnapshot(performanceId);
  if (seatsidekickPostOnlyOnChange() && previous?.lastPostedTopFingerprint === fingerprint) {
    return {
      performanceId,
      matchNum,
      ok: true,
      skipped: true,
      skipReason: "unchanged_top_lowest",
      newCount: 0,
      totalSeats,
    };
  }

  const countLabel = listings.length.toLocaleString("en-US");
  const titleOverride = `🆕 ${countLabel} lowest resale listing${listings.length === 1 ? "" : "s"}`;

  return postListingsToDualDiscord({
    performanceId,
    matchNum,
    data,
    listings,
    dedicatedWebhook: input.dedicatedWebhook,
    generalWebhook: input.generalWebhook,
    totalSeats,
    titleOverride,
    saveSnapshot: () =>
      saveSeatsidekickSnapshot({
        performanceId,
        matchNum,
        seats: {},
        lastPostedTopFingerprint: fingerprint,
        updatedAt: new Date().toISOString(),
      }),
  });
}

async function pollSeatsidekickMatchNewDiff(input: {
  matchNum: number;
  performanceId: string;
  dedicatedWebhook: string | null;
  generalWebhook: string | null;
}): Promise<SeatsidekickPollMatchResult> {
  const performanceId = input.performanceId.trim();
  const data = await fetchSeatsidekickMatch(performanceId);
  const current = flattenSeatsidekickToSnapshot(data);
  const matchNum = current.matchNum ?? input.matchNum;
  const previous = await loadSeatsidekickSnapshot(performanceId);
  const totalSeats = Object.keys(current.seats).length;

  if (!previous?.seats || Object.keys(previous.seats).length === 0) {
    await saveSeatsidekickSnapshot(current);
    return {
      performanceId,
      matchNum,
      ok: true,
      skipped: true,
      skipReason: "baseline_snapshot",
      newCount: 0,
      totalSeats,
    };
  }

  const newListings = diffNewSeatsidekickListings(current, previous);
  if (newListings.length === 0) {
    await saveSeatsidekickSnapshot(current);
    return {
      performanceId,
      matchNum,
      ok: true,
      skipped: true,
      skipReason: "no_new_listings",
      newCount: 0,
      totalSeats,
    };
  }

  return postListingsToDualDiscord({
    performanceId,
    matchNum,
    data,
    listings: newListings,
    dedicatedWebhook: input.dedicatedWebhook,
    generalWebhook: input.generalWebhook,
    totalSeats,
    saveSnapshot: () => saveSeatsidekickSnapshot(current),
  });
}

export async function pollSeatsidekickMatchToDiscord(input: {
  matchNum: number;
  performanceId: string;
}): Promise<SeatsidekickPollMatchResult> {
  const performanceId = input.performanceId.trim();
  if (!performanceId) {
    return { performanceId, matchNum: input.matchNum, ok: false, error: "empty performanceId" };
  }

  const dedicatedWebhook = await resolveMatchResaleWebhookUrlDedicatedOnly(input.matchNum);
  const generalWebhook = await resolveDiscordNewListingsWebhookUrl();
  if (!dedicatedWebhook && !generalWebhook) {
    return {
      performanceId,
      matchNum: input.matchNum,
      ok: true,
      skipped: true,
      skipReason: "no_resale_webhook",
    };
  }

  try {
    const ctx = {
      matchNum: input.matchNum,
      performanceId,
      dedicatedWebhook,
      generalWebhook,
    };
    if (seatsidekickPostMode() === "new") {
      return pollSeatsidekickMatchNewDiff(ctx);
    }
    return pollSeatsidekickMatchLowest(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { performanceId, matchNum: input.matchNum, ok: false, error: msg };
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export type SeatsidekickPollSummary = {
  ok: boolean;
  enabled: boolean;
  postMode: SeatsidekickPostMode;
  postTopN: number;
  generalWebhookConfigured: boolean;
  polled: number;
  notified: number;
  skipped: number;
  failed: number;
  results: SeatsidekickPollMatchResult[];
};

async function resolvePollTargets(): Promise<Array<{ matchNum: number; performanceId: string }>> {
  let targets: Array<{ matchNum: number; performanceId: string }>;
  const all = listSeatsidekickPerformanceTargets();
  const generalWebhook = await resolveDiscordNewListingsWebhookUrl();
  if (generalWebhook) {
    targets = all;
  } else {
    const configured = new Set(await listMatchNumsWithPerMatchResaleWebhook());
    targets = all.filter((t) => configured.has(t.matchNum));
  }

  const onlyMatches = parseOnlyMatchNums();
  if (onlyMatches) {
    targets = targets.filter((t) => onlyMatches.has(t.matchNum));
  }
  return targets;
}

export async function runSeatsidekickDiscordPoll(): Promise<SeatsidekickPollSummary> {
  const postMode = seatsidekickPostMode();
  const postTopN = seatsidekickPostTopN();

  if (!seatsidekickPollEnabled()) {
    return {
      ok: true,
      enabled: false,
      postMode,
      postTopN,
      generalWebhookConfigured: false,
      polled: 0,
      notified: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  const generalWebhook = await resolveDiscordNewListingsWebhookUrl();
  const hasDedicated = (await listMatchNumsWithPerMatchResaleWebhook()).length > 0;
  if (!generalWebhook && !hasDedicated) {
    return {
      ok: true,
      enabled: true,
      postMode,
      postTopN,
      generalWebhookConfigured: false,
      polled: 0,
      notified: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  const targets = await resolvePollTargets();
  const concurrency = Math.min(
    8,
    Math.max(1, Number(process.env.SEATSIDEKICK_POLL_CONCURRENCY ?? "6") || 6),
  );

  const results = await mapPool(targets, concurrency, (t) => pollSeatsidekickMatchToDiscord(t));

  let notified = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    else if (r.skipped) skipped++;
    else if ((r.newCount ?? 0) > 0 && r.discord?.ok) notified++;
  }

  return {
    ok: failed === 0,
    enabled: true,
    postMode,
    postTopN,
    generalWebhookConfigured: Boolean(generalWebhook),
    polled: results.length,
    notified,
    skipped,
    failed,
    results,
  };
}
