-- Track when pushed SB listings disappear from scraped inventory and are deleted on SB.
ALTER TABLE "sb_listing_push_logs" ADD COLUMN "inventory_removed_at" TIMESTAMP(3);
ALTER TABLE "sb_listing_push_logs" ADD COLUMN "sb_deleted_at" TIMESTAMP(3);
ALTER TABLE "sb_listing_push_logs" ADD COLUMN "sb_delete_http_status" INTEGER;
ALTER TABLE "sb_listing_push_logs" ADD COLUMN "sb_delete_error" TEXT;

CREATE INDEX "sb_listing_push_logs_event_id_inventory_removed_at_idx"
  ON "sb_listing_push_logs"("event_id", "inventory_removed_at");
