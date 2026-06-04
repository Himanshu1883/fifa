import { NextResponse } from "next/server";

import { getSbPushRulesConfig, setSbPushRulesConfig } from "@/lib/sb-push-rules-settings";
import {
  defaultSbPushRulesConfig,
  quantityRulesSummary,
  SB_PUSH_POLICY_DOC,
} from "@/lib/sb-push-rules-settings-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getSbPushRulesConfig();
    const qty = quantityRulesSummary(config);
    return NextResponse.json({
      ok: true,
      config,
      policy: SB_PUSH_POLICY_DOC,
      quantitySummary: qty,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const missing =
      message.includes("does not exist") ||
      message.includes("sb_push_rules_settings") ||
      message.includes("P2021");
    if (missing) {
      const config = defaultSbPushRulesConfig();
      return NextResponse.json({
        ok: true,
        config,
        policy: SB_PUSH_POLICY_DOC,
        quantitySummary: quantityRulesSummary(config),
        warning: "Run prisma migrate deploy for sb_push_rules_settings.",
      });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      togetherRules?: unknown;
      singleRules?: unknown;
      autoDeleteOnScrapeRemoval?: boolean;
    };
    const config = await setSbPushRulesConfig({
      togetherRules: body.togetherRules,
      singleRules: body.singleRules,
      autoDeleteOnScrapeRemoval: body.autoDeleteOnScrapeRemoval,
    });
    return NextResponse.json({
      ok: true,
      config,
      quantitySummary: quantityRulesSummary(config),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 400 });
  }
}
