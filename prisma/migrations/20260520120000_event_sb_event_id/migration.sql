-- SeatsBrokers event id mapping per schedule row.
ALTER TABLE "Event"
ADD COLUMN "sb_event_id" TEXT;
