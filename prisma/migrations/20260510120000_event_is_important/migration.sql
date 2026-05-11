-- Add per-event Important flag (default false).
ALTER TABLE "Event"
ADD COLUMN "is_important" BOOLEAN NOT NULL DEFAULT false;

