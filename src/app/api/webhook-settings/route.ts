import { NextResponse } from "next/server";
import {
  getAppWebhookSettings,
  setDiscordNewListingsWebhookUrl,
  setDiscordShopWebhookUrl,
} from "@/lib/webhook-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsJson(settings: Awaited<ReturnType<typeof getAppWebhookSettings>>) {
  return {
    discordNewListingsWebhookUrlMasked: settings.discordNewListingsWebhookUrlMasked,
    discordNewListingsWebhookSource: settings.discordNewListingsWebhookSource,
    discordNewListingsWebhookConfigured: Boolean(settings.discordNewListingsWebhookUrl),
    discordShopWebhookUrlMasked: settings.discordShopWebhookUrlMasked,
    discordShopWebhookSource: settings.discordShopWebhookSource,
    discordShopWebhookConfigured: Boolean(settings.discordShopWebhookUrl),
    shopDiscordBaselineSentAt: settings.shopDiscordBaselineSentAt,
    updatedAt: settings.updatedAt,
  };
}

export async function GET() {
  try {
    const settings = await getAppWebhookSettings();
    return NextResponse.json({
      ok: true,
      settings: settingsJson(settings),
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
        {
          id: "shop-latest-poll",
          label: "Shop marketplace poll",
          path: "/api/shop/latest",
          description: "Polls vivalafifa marketplace; sends Discord baseline then deltas",
        },
      ],
      outboundWebhooks: [
        {
          id: "discord-new-listings",
          label: "Discord — new resale listings",
          description: "Posts completely new listings from each scrape diff",
          envFallback: "DISCORD_NEW_LISTINGS_WEBHOOK_URL",
        },
        {
          id: "discord-shop",
          label: "Discord — SHOP marketplace",
          description: "Full snapshot on first poll, then match-level price/availability changes",
          envFallback: "DISCORD_SHOP_WEBHOOK_URL",
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
          discordShopWebhookUrlMasked: null,
          discordShopWebhookSource: null,
          discordShopWebhookConfigured: false,
          shopDiscordBaselineSentAt: null,
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
    const body = (await req.json()) as {
      discordNewListingsWebhookUrl?: unknown;
      discordShopWebhookUrl?: unknown;
    };

    let settings: Awaited<ReturnType<typeof getAppWebhookSettings>> | null = null;

    if ("discordNewListingsWebhookUrl" in body) {
      const raw = body.discordNewListingsWebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordNewListingsWebhookUrl(url);
    }

    if ("discordShopWebhookUrl" in body) {
      const raw = body.discordShopWebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordShopWebhookUrl(url);
    }

    if (!settings) {
      return NextResponse.json({ ok: false, error: "No settings fields provided." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      settings: settingsJson(settings),
      savedMasked: settings.discordShopWebhookUrlMasked ?? settings.discordNewListingsWebhookUrlMasked,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message.slice(0, 800) }, { status: 400 });
  }
}
