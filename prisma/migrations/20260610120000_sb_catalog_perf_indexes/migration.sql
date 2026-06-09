-- Accordion listing load: catalog-eligible rows per event, newest first.
CREATE INDEX IF NOT EXISTS "sb_listing_push_logs_catalog_event_created_idx"
ON "sb_listing_push_logs" ("event_id", "created_at" DESC)
WHERE "ok" = true
  AND ("error_message" IS NULL OR "error_message" <> '__sb_push_claim__');

-- Summary page GROUP BY event_id counts.
CREATE INDEX IF NOT EXISTS "sb_listing_push_logs_catalog_summary_event_idx"
ON "sb_listing_push_logs" ("event_id")
INCLUDE ("sb_deleted_at", "inventory_removed_at", "sb_delete_error")
WHERE "ok" = true
  AND ("error_message" IS NULL OR "error_message" <> '__sb_push_claim__');

-- Stale delete repair lookup per event.
CREATE INDEX IF NOT EXISTS "sb_listing_push_logs_stale_delete_repair_idx"
ON "sb_listing_push_logs" ("event_id")
WHERE "ok" = true
  AND "sb_deleted_at" IS NULL
  AND "inventory_removed_at" IS NOT NULL
  AND "sb_delete_error" IS NOT NULL
  AND "sb_ticket_id" IS NOT NULL
  AND ("error_message" IS NULL OR "error_message" <> '__sb_push_claim__');
