ALTER TABLE "user_login_audits" ADD COLUMN IF NOT EXISTS "country" VARCHAR(16);
ALTER TABLE "user_login_audits" ADD COLUMN IF NOT EXISTS "region" VARCHAR(96);
ALTER TABLE "user_login_audits" ADD COLUMN IF NOT EXISTS "city" VARCHAR(128);

