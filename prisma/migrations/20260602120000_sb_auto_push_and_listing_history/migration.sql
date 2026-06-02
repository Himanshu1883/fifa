-- CreateEnum
CREATE TYPE "SbListingPushTrigger" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "sb_auto_push_settings" (
    "id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sb_auto_push_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "sb_auto_push_settings" ("id", "enabled") VALUES (1, false);

-- CreateTable
CREATE TABLE "sb_event_auto_push" (
    "event_id" INTEGER NOT NULL,
    "first_pushed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_auto_push_at" TIMESTAMP(3),

    CONSTRAINT "sb_event_auto_push_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "sb_listing_push_logs" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "match_id" TEXT NOT NULL,
    "offer_index" INTEGER,
    "listing_fingerprint" TEXT NOT NULL,
    "trigger" "SbListingPushTrigger" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "http_status" INTEGER,
    "sb_ticket_id" TEXT,
    "request_fields" JSONB NOT NULL,
    "request_summary" JSONB NOT NULL,
    "response_body" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sb_listing_push_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sb_listing_push_logs_event_id_created_at_idx" ON "sb_listing_push_logs"("event_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sb_listing_push_logs_event_id_listing_fingerprint_idx" ON "sb_listing_push_logs"("event_id", "listing_fingerprint");

-- AddForeignKey
ALTER TABLE "sb_event_auto_push" ADD CONSTRAINT "sb_event_auto_push_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sb_listing_push_logs" ADD CONSTRAINT "sb_listing_push_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
