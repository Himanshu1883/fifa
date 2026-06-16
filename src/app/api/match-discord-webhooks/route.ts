import { NextResponse } from "next/server";
import {
  listMatchDiscordWebhookRows,
  upsertMatchDiscordWebhooks,
  type MatchDiscordWebhookUpsert,
} from "@/lib/match-discord-webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listMatchDiscordWebhookRows();
    const configuredResale = rows.filter((r) => r.resaleWebhookUrl).length;
    const configuredShop = rows.filter((r) => r.shopWebhookUrl).length;
    return NextResponse.json({
      ok: true,
      rows,
      summary: {
        total: rows.length,
        configuredResale,
        configuredShop,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}

function parseUpsertBody(raw: unknown): MatchDiscordWebhookUpsert[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected body.items to be an array.");
  }
  const out: MatchDiscordWebhookUpsert[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const matchNum = Number(o.matchNum);
    if (!Number.isInteger(matchNum)) continue;
    const item: MatchDiscordWebhookUpsert = { matchNum };
    if ("resaleWebhookUrl" in o) {
      const v = o.resaleWebhookUrl;
      item.resaleWebhookUrl =
        v === null || v === undefined ? null : String(v).trim() || null;
    }
    if ("shopWebhookUrl" in o) {
      const v = o.shopWebhookUrl;
      item.shopWebhookUrl =
        v === null || v === undefined ? null : String(v).trim() || null;
    }
    out.push(item);
  }
  if (out.length === 0) {
    throw new Error("No valid items to save.");
  }
  return out;
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { items?: unknown };
    const items = parseUpsertBody(body.items);
    const result = await upsertMatchDiscordWebhooks(items);
    const rows = await listMatchDiscordWebhookRows();
    return NextResponse.json({ ok: true, updated: result.updated, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 400 });
  }
}
