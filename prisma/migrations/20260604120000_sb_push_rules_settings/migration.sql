CREATE TABLE "sb_push_rules_settings" (
    "id" INTEGER NOT NULL,
    "together_rules" JSONB NOT NULL,
    "single_rules" JSONB NOT NULL,
    "auto_delete_on_scrape_removal" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sb_push_rules_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "sb_push_rules_settings" (
    "id",
    "together_rules",
    "single_rules",
    "auto_delete_on_scrape_removal",
    "updated_at"
) VALUES (
    1,
    '[{"input":4,"output":1},{"input":5,"output":2},{"input":6,"output":2},{"input":7,"output":4},{"input":10,"output":4}]'::jsonb,
    '[{"input":4,"output":1},{"input":5,"output":2},{"input":6,"output":2},{"input":7,"output":2}]'::jsonb,
    true,
    CURRENT_TIMESTAMP
);
