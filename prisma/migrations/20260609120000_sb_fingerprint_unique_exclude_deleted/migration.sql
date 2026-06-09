-- Allow re-push after SB delete: deleted logs keep history but no longer block fingerprint uniqueness.
DROP INDEX IF EXISTS "sb_listing_push_logs_event_fingerprint_success_uidx";

CREATE UNIQUE INDEX "sb_listing_push_logs_event_fingerprint_success_uidx"
ON "sb_listing_push_logs" ("event_id", "listing_fingerprint")
WHERE "ok" = true AND "sb_deleted_at" IS NULL;
