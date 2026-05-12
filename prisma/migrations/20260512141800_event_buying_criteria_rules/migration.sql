-- Create structured per-event buying criteria rules (per category).

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BuyingCriteriaRuleKind') THEN
    CREATE TYPE "BuyingCriteriaRuleKind" AS ENUM ('QTY_UNDER_PRICE', 'TOGETHER_UNDER_PRICE');
  END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "event_buying_criteria_rules" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_num" INTEGER NOT NULL,
    "kind" "BuyingCriteriaRuleKind" NOT NULL,
    "min_qty" INTEGER,
    "together_count" INTEGER,
    "max_price_usd_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_buying_criteria_rules_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "event_buying_criteria_rules_event_id_idx"
ON "event_buying_criteria_rules"("event_id");

CREATE INDEX IF NOT EXISTS "event_buying_criteria_rules_event_id_category_num_idx"
ON "event_buying_criteria_rules"("event_id", "category_num");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_buying_criteria_rules_event_id_fkey'
  ) THEN
    ALTER TABLE "event_buying_criteria_rules"
    ADD CONSTRAINT "event_buying_criteria_rules_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

