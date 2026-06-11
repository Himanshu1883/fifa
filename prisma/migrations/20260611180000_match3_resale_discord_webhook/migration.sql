ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_match3_resale_webhook_url" TEXT;
