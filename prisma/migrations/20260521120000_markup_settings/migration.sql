-- Global ticket markup % (UI + seat-offers-transformed API when ?markupPercent is omitted)
CREATE TABLE "markup_settings" (
    "id" INTEGER NOT NULL,
    "markup_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "markup_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "markup_settings" ("id", "markup_percent") VALUES (1, 0);
