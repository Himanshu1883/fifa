ALTER TABLE "app_webhook_settings"
ADD COLUMN IF NOT EXISTS "discord_match7_webhook_url" TEXT;

CREATE TABLE "resale_discord_match_notify_logs" (
    "id" SERIAL NOT NULL,
    "match_num" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resale_discord_match_notify_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resale_discord_match_notify_logs_match_num_fingerprint_created_at_idx"
ON "resale_discord_match_notify_logs"("match_num", "fingerprint", "created_at");

CREATE TABLE "resale_discord_match_notify_state" (
    "match_num" INTEGER NOT NULL,
    "last_discord_notify_fingerprint" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resale_discord_match_notify_state_pkey" PRIMARY KEY ("match_num")
);
