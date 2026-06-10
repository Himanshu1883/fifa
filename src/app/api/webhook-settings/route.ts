import { NextResponse } from "next/server";
import { getAppWebhookSettings, setDiscordNewListingsWebhookUrl } from "@/lib/webhook-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getAppWebhookSettings();
    return NextResponse.json({
      ok: true,
      settings: {
        discordNewListingsWebhookUrlMasked: settings.discordNewListingsWebhookUrlMasked,
        discordNewListingsWebhookSource: settings.discordNewListingsWebhookSource,
        discordNewListingsWebhookConfigured: Boolean(settings.discordNewListingsWebhookUrl),
        updatedAt: settings.updatedAt,
      },
      inboundWebhooks: [
        {
          id: "sock-available-resale",
          label: "Sock available (RESALE)",
          path: "/api/webhooks/sock-available",
          description: "GeoJSON inventory scrape for resale marketplace",
        },
        {
          id: "sock-available-shop",
          label: "Sock available (LAST_MINUTE)",
          path: "/api/webhooks/sock-available-shop",
          description: "GeoJSON inventory scrape for shop / last-minute",
        },
      ],
      outboundWebhooks: [
        {
          id: "discord-new-listings",
          label: "Discord — new listings",
          description: "Posts completely new listings from each scrape diff",
          envFallback: "DISCORD_NEW_LISTINGS_WEBHOOK_URL",
        },
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const missing =
      message.includes("does not exist") ||
      message.includes("app_webhook_settings") ||
      message.includes("P2021");
    if (missing) {
      return NextResponse.json({
        ok: true,
        settings: {
          discordNewListingsWebhookUrlMasked: null,
          discordNewListingsWebhookSource: null,
          discordNewListingsWebhookConfigured: false,
          updatedAt: null,
        },
        warning: "Run prisma migrate deploy for app_webhook_settings.",
        inboundWebhooks: [],
        outboundWebhooks: [],
      });
    }
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { discordNewListingsWebhookUrl?: unknown };
    const raw = body.discordNewListingsWebhookUrl;
    let url: string | null = null;
    if (raw !== null && raw !== undefined) {
      const trimmed = String(raw).trim();
      url = trimmed.length > 0 ? trimmed : null;
    }

    const settings = await setDiscordNewListingsWebhookUrl(url);
    return NextResponse.json({
      ok: true,
      settings: {
        discordNewListingsWebhookUrlMasked: settings.discordNewListingsWebhookUrlMasked,
        discordNewListingsWebhookSource: settings.discordNewListingsWebhookSource,
        discordNewListingsWebhookConfigured: Boolean(settings.discordNewListingsWebhookUrl),
        updatedAt: settings.updatedAt,
      },
      savedMasked: settings.discordNewListingsWebhookUrlMasked,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 400 });
  }
}
