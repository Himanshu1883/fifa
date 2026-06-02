-- Prevent duplicate successful SB pushes for the same listing on an event.
CREATE UNIQUE INDEX "sb_listing_push_logs_event_fingerprint_success_uidx"
ON "sb_listing_push_logs" ("event_id", "listing_fingerprint")
WHERE "ok" = true;
