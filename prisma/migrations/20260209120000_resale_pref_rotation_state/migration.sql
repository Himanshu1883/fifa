-- Round-robin cursor for /api/resale-pref/next (singleton id = 1)
CREATE TABLE "resale_pref_rotation_state" (
    "id" INTEGER NOT NULL,
    "next_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resale_pref_rotation_state_pkey" PRIMARY KEY ("id")
);

INSERT INTO "resale_pref_rotation_state" ("id", "next_index") VALUES (1, 0);
