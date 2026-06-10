-- Per-match Discord delta dedup: last notified available-price fingerprint.
ALTER TABLE "shop_marketplace_events"
ADD COLUMN "last_discord_notify_fingerprint" TEXT;
