ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "shop_discord_last_heartbeat_at" TIMESTAMP(3);

ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "dedicated_shop_discord_last_heartbeat_at" JSONB NOT NULL DEFAULT '{}';
