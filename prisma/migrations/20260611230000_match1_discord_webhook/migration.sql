ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_match1_webhook_url" TEXT;
