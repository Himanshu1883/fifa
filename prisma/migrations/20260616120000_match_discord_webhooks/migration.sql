-- Per-match Discord webhook URLs for resale + LMS/shop routing (matches 1–104).

CREATE TABLE "match_discord_webhooks" (
    "match_num" INTEGER NOT NULL,
    "resale_webhook_url" TEXT,
    "shop_webhook_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_discord_webhooks_pkey" PRIMARY KEY ("match_num")
);

-- Seed legacy dedicated match webhooks from app_webhook_settings (if present).
INSERT INTO "match_discord_webhooks" ("match_num", "resale_webhook_url", "shop_webhook_url", "updated_at")
SELECT 1,
       COALESCE(NULLIF(TRIM("discord_match1_webhook_url"), ''), NULL),
       COALESCE(NULLIF(TRIM("discord_match1_webhook_url"), ''), NULL),
       NOW()
FROM "app_webhook_settings"
WHERE "id" = 1
  AND NULLIF(TRIM("discord_match1_webhook_url"), '') IS NOT NULL
ON CONFLICT ("match_num") DO NOTHING;

INSERT INTO "match_discord_webhooks" ("match_num", "resale_webhook_url", "shop_webhook_url", "updated_at")
SELECT 3,
       COALESCE(NULLIF(TRIM("discord_match3_resale_webhook_url"), ''), NULL),
       NULL,
       NOW()
FROM "app_webhook_settings"
WHERE "id" = 1
  AND NULLIF(TRIM("discord_match3_resale_webhook_url"), '') IS NOT NULL
ON CONFLICT ("match_num") DO UPDATE SET
  "resale_webhook_url" = COALESCE(EXCLUDED."resale_webhook_url", "match_discord_webhooks"."resale_webhook_url"),
  "updated_at" = NOW();

INSERT INTO "match_discord_webhooks" ("match_num", "resale_webhook_url", "shop_webhook_url", "updated_at")
SELECT 4,
       COALESCE(NULLIF(TRIM("discord_match4_resale_webhook_url"), ''), NULL),
       NULL,
       NOW()
FROM "app_webhook_settings"
WHERE "id" = 1
  AND NULLIF(TRIM("discord_match4_resale_webhook_url"), '') IS NOT NULL
ON CONFLICT ("match_num") DO UPDATE SET
  "resale_webhook_url" = COALESCE(EXCLUDED."resale_webhook_url", "match_discord_webhooks"."resale_webhook_url"),
  "updated_at" = NOW();

INSERT INTO "match_discord_webhooks" ("match_num", "resale_webhook_url", "shop_webhook_url", "updated_at")
SELECT 5,
       COALESCE(NULLIF(TRIM("discord_match5_webhook_url"), ''), NULL),
       COALESCE(NULLIF(TRIM("discord_match5_webhook_url"), ''), NULL),
       NOW()
FROM "app_webhook_settings"
WHERE "id" = 1
  AND NULLIF(TRIM("discord_match5_webhook_url"), '') IS NOT NULL
ON CONFLICT ("match_num") DO UPDATE SET
  "resale_webhook_url" = COALESCE(EXCLUDED."resale_webhook_url", "match_discord_webhooks"."resale_webhook_url"),
  "shop_webhook_url" = COALESCE(EXCLUDED."shop_webhook_url", "match_discord_webhooks"."shop_webhook_url"),
  "updated_at" = NOW();

INSERT INTO "match_discord_webhooks" ("match_num", "resale_webhook_url", "shop_webhook_url", "updated_at")
SELECT 7,
       COALESCE(NULLIF(TRIM("discord_match7_webhook_url"), ''), NULL),
       COALESCE(NULLIF(TRIM("discord_match7_webhook_url"), ''), NULL),
       NOW()
FROM "app_webhook_settings"
WHERE "id" = 1
  AND NULLIF(TRIM("discord_match7_webhook_url"), '') IS NOT NULL
ON CONFLICT ("match_num") DO UPDATE SET
  "resale_webhook_url" = COALESCE(EXCLUDED."resale_webhook_url", "match_discord_webhooks"."resale_webhook_url"),
  "shop_webhook_url" = COALESCE(EXCLUDED."shop_webhook_url", "match_discord_webhooks"."shop_webhook_url"),
  "updated_at" = NOW();
