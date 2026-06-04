import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  SB_PUSH_POLICY_DOC,
  defaultSbPushRulesConfig,
  normalizeRuleRows,
  runtimeFromConfig,
  type SbPushRulesConfig,
  type SbPushRulesRuntime,
} from "@/lib/sb-push-rules-settings-types";

export {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  SB_PUSH_POLICY_DOC,
  defaultSbPushRulesConfig,
  describeQuantityRuleWithRuntime,
  mapQuantityWithRules,
  normalizeRuleRows,
  quantityRulesSummary,
  rulesToMap,
  runtimeFromConfig,
  type SbPushQuantityRule,
  type SbPushRulesConfig,
  type SbPushRulesRuntime,
} from "@/lib/sb-push-rules-settings-types";

const SETTINGS_ID = 1;

let cache: { config: SbPushRulesRuntime; loadedAt: number } | null = null;
const CACHE_MS = 3_000;

export function invalidateSbPushRulesCache(): void {
  cache = null;
}

export function configFromDbRow(row: {
  togetherRules: unknown;
  singleRules: unknown;
  autoDeleteOnScrapeRemoval: boolean;
  updatedAt: Date;
}): SbPushRulesConfig {
  const together = normalizeRuleRows(row.togetherRules);
  const single = normalizeRuleRows(row.singleRules);
  return {
    togetherRules: together.length > 0 ? together : [...DEFAULT_SB_PUSH_TOGETHER_RULES],
    singleRules: single.length > 0 ? single : [...DEFAULT_SB_PUSH_SINGLE_RULES],
    autoDeleteOnScrapeRemoval: row.autoDeleteOnScrapeRemoval,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSbPushRulesConfig(): Promise<SbPushRulesConfig> {
  try {
    const row = await prisma.sbPushRulesSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) return defaultSbPushRulesConfig();
    return configFromDbRow(row);
  } catch {
    return defaultSbPushRulesConfig();
  }
}

export async function getSbPushRulesRuntime(): Promise<SbPushRulesRuntime> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_MS) return cache.config;

  const config = await getSbPushRulesConfig();
  const runtime = runtimeFromConfig(config);
  cache = { config: runtime, loadedAt: now };
  return runtime;
}

export async function setSbPushRulesConfig(
  input: Partial<Pick<SbPushRulesConfig, "togetherRules" | "singleRules" | "autoDeleteOnScrapeRemoval">>,
): Promise<SbPushRulesConfig> {
  const current = await getSbPushRulesConfig();
  const togetherRules = input.togetherRules
    ? normalizeRuleRows(input.togetherRules)
    : current.togetherRules;
  const singleRules = input.singleRules ? normalizeRuleRows(input.singleRules) : current.singleRules;

  if (togetherRules.length === 0 || singleRules.length === 0) {
    throw new Error("Each quantity table needs at least one row.");
  }

  const row = await prisma.sbPushRulesSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      togetherRules,
      singleRules,
      autoDeleteOnScrapeRemoval:
        input.autoDeleteOnScrapeRemoval ?? current.autoDeleteOnScrapeRemoval,
    },
    update: {
      togetherRules,
      singleRules,
      ...(input.autoDeleteOnScrapeRemoval !== undefined
        ? { autoDeleteOnScrapeRemoval: input.autoDeleteOnScrapeRemoval }
        : {}),
    },
  });

  invalidateSbPushRulesCache();
  return configFromDbRow(row);
}
