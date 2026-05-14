-- Round-robin cursor for /api/pref/next (scoped by match range, e.g. scope = "match:1-11")
CREATE TABLE "pref_rotation_state" (
    "scope" TEXT NOT NULL,
    "next_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pref_rotation_state_pkey" PRIMARY KEY ("scope")
);

