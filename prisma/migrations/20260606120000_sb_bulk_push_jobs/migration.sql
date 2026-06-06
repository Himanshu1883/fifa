-- CreateEnum
CREATE TYPE "SbBulkPushJobStatus" AS ENUM ('RUNNING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "sb_bulk_push_jobs" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "status" "SbBulkPushJobStatus" NOT NULL DEFAULT 'RUNNING',
    "items" JSONB NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "current_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sb_bulk_push_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sb_bulk_push_jobs_event_id_status_idx" ON "sb_bulk_push_jobs"("event_id", "status");

-- CreateIndex
CREATE INDEX "sb_bulk_push_jobs_event_id_created_at_idx" ON "sb_bulk_push_jobs"("event_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sb_bulk_push_jobs" ADD CONSTRAINT "sb_bulk_push_jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
