-- Create per-event buying criteria (freeform CAT notes + CAT 3 front row flag).
CREATE TABLE "event_buying_criteria" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "cat1" TEXT,
    "cat2" TEXT,
    "cat3" TEXT,
    "cat3_front_row" BOOLEAN NOT NULL DEFAULT false,
    "cat4" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_buying_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_buying_criteria_event_id_key" ON "event_buying_criteria"("event_id");

-- CreateIndex
CREATE INDEX "event_buying_criteria_event_id_idx" ON "event_buying_criteria"("event_id");

-- AddForeignKey
ALTER TABLE "event_buying_criteria" ADD CONSTRAINT "event_buying_criteria_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

