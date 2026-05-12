-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SockAvailableKind') THEN
    CREATE TYPE "SockAvailableKind" AS ENUM ('RESALE', 'LAST_MINUTE');
  END IF;
END$$;

-- AlterTable
ALTER TABLE "sock_available"
ADD COLUMN IF NOT EXISTS "kind" "SockAvailableKind" NOT NULL DEFAULT 'RESALE';

-- Replace unique index to include kind
DROP INDEX IF EXISTS "sock_available_event_id_resalemovementid_key";
CREATE UNIQUE INDEX "sock_available_event_id_resalemovementid_kind_key"
ON "sock_available"("event_id", "resalemovementid", "kind");

-- Helpful index for filtering
CREATE INDEX IF NOT EXISTS "sock_available_event_id_kind_idx"
ON "sock_available"("event_id", "kind");

