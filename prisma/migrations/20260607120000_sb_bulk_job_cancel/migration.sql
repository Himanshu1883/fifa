-- AlterEnum
ALTER TYPE "SbBulkPushJobStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "SbBulkDeleteJobStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "sb_bulk_push_jobs" ADD COLUMN "cancel_requested_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sb_bulk_delete_jobs" ADD COLUMN "cancel_requested_at" TIMESTAMP(3);
