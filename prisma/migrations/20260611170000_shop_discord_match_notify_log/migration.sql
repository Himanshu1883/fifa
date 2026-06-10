-- Per-match Discord delta send log for cooldown dedup (matchNum + fingerprint).
CREATE TABLE "shop_discord_match_notify_logs" (
    "id" SERIAL NOT NULL,
    "match_num" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_discord_match_notify_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_discord_match_notify_logs_match_num_fingerprint_created_at_idx"
ON "shop_discord_match_notify_logs"("match_num", "fingerprint", "created_at");
