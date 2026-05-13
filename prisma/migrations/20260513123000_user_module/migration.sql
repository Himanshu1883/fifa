-- Add approval/admin fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthMethod') THEN
    CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'GOOGLE');
  END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_login_audits" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "ip" VARCHAR(64),
  "user_agent" TEXT,
  "method" "AuthMethod" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_login_audits_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_login_audits_user_id_fkey'
  ) THEN
    ALTER TABLE "user_login_audits"
    ADD CONSTRAINT "user_login_audits_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_login_audits_user_id_created_at_idx"
ON "user_login_audits"("user_id", "created_at");

