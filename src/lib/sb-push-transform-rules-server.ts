import "server-only";

import { getSbPushRulesConfig, getSbPushRulesRuntime } from "@/lib/sb-push-rules-settings";
import {
  SB_PUSH_POLICY_DOC,
  describeQuantityRuleWithRuntime,
  quantityRulesSummary,
} from "@/lib/sb-push-rules-settings-types";

export async function describeQuantityRule(
  offerType: "single" | "together",
  originalCount: number,
  transformedCount: number,
): Promise<string> {
  const runtime = await getSbPushRulesRuntime();
  return describeQuantityRuleWithRuntime(offerType, originalCount, transformedCount, runtime);
}

export async function getSbPushTransformRulesDoc(): Promise<
  typeof SB_PUSH_POLICY_DOC & {
    togetherQuantity: string;
    singleQuantity: string;
  }
> {
  const config = await getSbPushRulesConfig();
  const qty = quantityRulesSummary(config);
  return { ...SB_PUSH_POLICY_DOC, ...qty };
}
