ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "dedicated_shop_discord_baselines_sent" JSONB NOT NULL DEFAULT '{}';
