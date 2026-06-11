import { NextResponse } from "next/server";
import { sendPriceListBaselineNow } from "@/lib/price-list-discord-notify";
import {
  parseBaselineMatchNum,
  sendDedicatedMatchBaselineNow,
  sendGeneralShopBaselineNow,
} from "@/lib/webhook-baseline-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { target?: unknown; matchNum?: unknown };
    const target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";

    if (target === "shop") {
      const result = await sendGeneralShopBaselineNow();
      return NextResponse.json(result);
    }

    if (target === "price-list") {
      const summary = await sendPriceListBaselineNow();
      return NextResponse.json({
        ok: summary.ok,
        priceList: {
          attempted: summary.attempted,
          ok: summary.ok,
          mode: summary.mode,
          resaleCount: summary.resaleCount,
          shopCount: summary.shopCount,
          error: summary.results.find((r) => r.error)?.error,
        },
      });
    }

    if (target === "dedicated") {
      const matchNum = parseBaselineMatchNum(body.matchNum);
      if (!matchNum) {
        return NextResponse.json(
          { ok: false, error: "matchNum must be 1, 3, 4, 5, or 7 for dedicated baselines." },
          { status: 400 },
        );
      }
      const result = await sendDedicatedMatchBaselineNow(matchNum);
      return NextResponse.json({ matchNum, ...result });
    }

    return NextResponse.json(
      { ok: false, error: 'target must be "shop", "price-list", or "dedicated".' },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}
