CREATE TABLE "shop_discord_notify_logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "changed_count" INTEGER NOT NULL DEFAULT 0,
    "attempted" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER,
    "error" TEXT,
    "notify_raw" JSONB,

    CONSTRAINT "shop_discord_notify_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_discord_notify_logs_created_at_idx" ON "shop_discord_notify_logs"("created_at");
