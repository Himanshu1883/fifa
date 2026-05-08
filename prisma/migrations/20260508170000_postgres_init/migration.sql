-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "match_label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pref_id" TEXT NOT NULL,
    "resale_pref_id" TEXT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "category_block_name" TEXT NOT NULL,
    "category_block_id" TEXT NOT NULL,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_sort_order_idx" ON "Event"("sort_order");

-- CreateIndex
CREATE INDEX "Event_pref_id_idx" ON "Event"("pref_id");

-- CreateIndex
CREATE INDEX "Event_resale_pref_id_idx" ON "Event"("resale_pref_id");

-- CreateIndex
CREATE INDEX "EventCategory_event_id_idx" ON "EventCategory"("event_id");

-- AddForeignKey
ALTER TABLE "EventCategory" ADD CONSTRAINT "EventCategory_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
