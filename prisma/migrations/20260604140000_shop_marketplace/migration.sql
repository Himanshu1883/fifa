-- CreateTable
CREATE TABLE "shop_marketplace_events" (
    "match_num" INTEGER NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "linked_event_id" INTEGER,
    "event_name" TEXT NOT NULL,
    "stage" TEXT,
    "venue" TEXT,
    "country" TEXT,
    "event_date" TIMESTAMP(3),
    "market_data" JSONB NOT NULL,
    "lowest_price" INTEGER,
    "highest_price" INTEGER,
    "average_price" INTEGER,
    "available_count" INTEGER NOT NULL DEFAULT 0,
    "listings_count" INTEGER NOT NULL DEFAULT 0,
    "raw_payload" JSONB NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_marketplace_events_pkey" PRIMARY KEY ("match_num")
);

-- CreateTable
CREATE TABLE "shop_marketplace_sync_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "scanned_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_marketplace_sync_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_marketplace_events_linked_event_id_idx" ON "shop_marketplace_events"("linked_event_id");

-- CreateIndex
CREATE INDEX "shop_marketplace_events_scanned_at_idx" ON "shop_marketplace_events"("scanned_at");
