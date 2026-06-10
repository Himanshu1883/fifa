CREATE TABLE "app_webhook_settings" (
    "id" INTEGER NOT NULL,
    "discord_new_listings_webhook_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_webhook_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_webhook_settings" ("id", "discord_new_listings_webhook_url")
VALUES (1, NULL)
ON CONFLICT ("id") DO NOTHING;
