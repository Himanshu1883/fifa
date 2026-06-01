-- Event calendar date (for SB date_to_ship = event_date - 2 days).
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "event_date" TIMESTAMP(3);
