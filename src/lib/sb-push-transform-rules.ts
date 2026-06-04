/**
 * Client-safe re-exports for SB push rule docs and default quantity tables.
 * Server loaders live in sb-push-transform-rules-server.ts.
 */
export {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  SB_PUSH_POLICY_DOC,
  describeQuantityRuleWithRuntime,
  describeQuantityRuleSync,
  runtimeFromConfig,
  type SbPushQuantityRule,
  type SbPushRulesRuntime,
} from "@/lib/sb-push-rules-settings-types";

import {
  DEFAULT_SB_PUSH_SINGLE_RULES,
  DEFAULT_SB_PUSH_TOGETHER_RULES,
  SB_PUSH_POLICY_DOC,
} from "@/lib/sb-push-rules-settings-types";

export const SB_PUSH_TOGETHER_QUANTITY_RULES = DEFAULT_SB_PUSH_TOGETHER_RULES;
export const SB_PUSH_SINGLE_QUANTITY_RULES = DEFAULT_SB_PUSH_SINGLE_RULES;
export const SB_PUSH_TRANSFORM_RULES_DOC = SB_PUSH_POLICY_DOC;
