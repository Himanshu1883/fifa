ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_shop_webhook_url" TEXT,
ADD COLUMN IF NOT EXISTS "shop_discord_baseline_sent_at" TIMESTAMP(3);
