ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_price_list_webhook_url" TEXT;

CREATE TABLE IF NOT EXISTS "price_list_discord_notify_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_discord_notify_fingerprint" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_discord_notify_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "price_list_discord_notify_logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "resale_count" INTEGER NOT NULL DEFAULT 0,
    "shop_count" INTEGER NOT NULL DEFAULT 0,
    "attempted" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER,
    "error" TEXT,
    "notify_raw" JSONB,

    CONSTRAINT "price_list_discord_notify_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "price_list_discord_notify_logs_created_at_idx"
ON "price_list_discord_notify_logs"("created_at");
