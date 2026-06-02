ALTER TABLE "sb_auto_push_settings"
ADD COLUMN "ticket_type" VARCHAR(8) NOT NULL DEFAULT '4';

UPDATE "sb_auto_push_settings" SET "ticket_type" = '4' WHERE "id" = 1;
