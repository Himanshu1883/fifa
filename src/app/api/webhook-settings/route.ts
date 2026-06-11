import { NextResponse } from "next/server";
import {
  getAppWebhookSettings,
  setDiscordMatch3ResaleWebhookUrl,
  setDiscordMatch4ResaleWebhookUrl,
  setDiscordMatch5WebhookUrl,
  setDiscordMatch7WebhookUrl,
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
    discordMatch3ResaleWebhookUrlMasked: settings.discordMatch3ResaleWebhookUrlMasked,
    discordMatch3ResaleWebhookSource: settings.discordMatch3ResaleWebhookSource,
    discordMatch3ResaleWebhookConfigured: Boolean(settings.discordMatch3ResaleWebhookUrl),
    discordMatch4ResaleWebhookUrlMasked: settings.discordMatch4ResaleWebhookUrlMasked,
    discordMatch4ResaleWebhookSource: settings.discordMatch4ResaleWebhookSource,
    discordMatch4ResaleWebhookConfigured: Boolean(settings.discordMatch4ResaleWebhookUrl),
    discordMatch5WebhookUrlMasked: settings.discordMatch5WebhookUrlMasked,
    discordMatch5WebhookSource: settings.discordMatch5WebhookSource,
    discordMatch5WebhookConfigured: Boolean(settings.discordMatch5WebhookUrl),
    discordMatch7WebhookUrlMasked: settings.discordMatch7WebhookUrlMasked,
    discordMatch7WebhookSource: settings.discordMatch7WebhookSource,
    discordMatch7WebhookConfigured: Boolean(settings.discordMatch7WebhookUrl),
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
          description:
            "Posts completely new listings from each scrape diff (all matches except Match 3, 4, 5, and 7)",
          envFallback: "DISCORD_NEW_LISTINGS_WEBHOOK_URL",
        },
        {
          id: "discord-match3-resale",
          label: "Discord — Match 3 (shop + resale)",
          description:
            "Exclusive webhook for Match 3 shop baseline/deltas and resale price updates (target-price dedup)",
          envFallback: "DISCORD_MATCH3_RESALE_WEBHOOK_URL",
        },
        {
          id: "discord-match4-resale",
          label: "Discord — Match 4 (shop + resale)",
          description:
            "Exclusive webhook for Match 4 shop baseline/deltas and resale price updates (target-price dedup)",
          envFallback: "DISCORD_MATCH4_RESALE_WEBHOOK_URL",
        },
        {
          id: "discord-match5",
          label: "Discord — Match 5 (shop + resale)",
          description:
            "Exclusive webhook for Match 5 shop baseline/deltas and resale price updates (target-price dedup)",
          envFallback: "DISCORD_MATCH5_WEBHOOK_URL",
        },
        {
          id: "discord-match7",
          label: "Discord — Match 7 (shop + resale)",
          description:
            "Exclusive webhook for Match 7 shop baseline/deltas and resale price updates (target-price dedup)",
          envFallback: "DISCORD_MATCH7_WEBHOOK_URL",
        },
        {
          id: "discord-shop",
          label: "Discord — SHOP marketplace",
          description:
            "Full snapshot on first poll, then match-level price/availability changes (all matches except 3, 4, 5, 7)",
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
          discordMatch3ResaleWebhookUrlMasked: null,
          discordMatch3ResaleWebhookSource: null,
          discordMatch3ResaleWebhookConfigured: false,
          discordMatch4ResaleWebhookUrlMasked: null,
          discordMatch4ResaleWebhookSource: null,
          discordMatch4ResaleWebhookConfigured: false,
          discordMatch5WebhookUrlMasked: null,
          discordMatch5WebhookSource: null,
          discordMatch5WebhookConfigured: false,
          discordMatch7WebhookUrlMasked: null,
          discordMatch7WebhookSource: null,
          discordMatch7WebhookConfigured: false,
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
      discordMatch3ResaleWebhookUrl?: unknown;
      discordMatch4ResaleWebhookUrl?: unknown;
      discordMatch5WebhookUrl?: unknown;
      discordMatch7WebhookUrl?: unknown;
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

    if ("discordMatch3ResaleWebhookUrl" in body) {
      const raw = body.discordMatch3ResaleWebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordMatch3ResaleWebhookUrl(url);
    }

    if ("discordMatch4ResaleWebhookUrl" in body) {
      const raw = body.discordMatch4ResaleWebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordMatch4ResaleWebhookUrl(url);
    }

    if ("discordMatch5WebhookUrl" in body) {
      const raw = body.discordMatch5WebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordMatch5WebhookUrl(url);
    }

    if ("discordMatch7WebhookUrl" in body) {
      const raw = body.discordMatch7WebhookUrl;
      let url: string | null = null;
      if (raw !== null && raw !== undefined) {
        const trimmed = String(raw).trim();
        url = trimmed.length > 0 ? trimmed : null;
      }
      settings = await setDiscordMatch7WebhookUrl(url);
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
