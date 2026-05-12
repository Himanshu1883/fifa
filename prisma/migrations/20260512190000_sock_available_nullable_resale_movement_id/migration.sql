-- Make resaleMovementId nullable for sock_available rows.
ALTER TABLE "sock_available"
ALTER COLUMN "resalemovementid" DROP NOT NULL;

-- When resaleMovementId is NULL, ensure we still don't create duplicates
-- for the same seat within an event + kind snapshot.
CREATE UNIQUE INDEX IF NOT EXISTS "sock_available_event_id_seatid_kind_null_resalemovementid_key"
ON "sock_available" ("event_id", "seatid", "kind")
WHERE "resalemovementid" IS NULL;

