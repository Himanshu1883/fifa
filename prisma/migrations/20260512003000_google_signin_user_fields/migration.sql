-- AlterTable
ALTER TABLE "users" ADD COLUMN "google_sub" TEXT;
ALTER TABLE "users" ADD COLUMN "google_email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

