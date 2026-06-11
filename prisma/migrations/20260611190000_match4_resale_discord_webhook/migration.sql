ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_match4_resale_webhook_url" TEXT;
