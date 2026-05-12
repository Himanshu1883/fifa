-- CreateTable
CREATE TABLE "shop_event_category" (
    "event_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "category_block_id" TEXT NOT NULL,
    "category_block_name" TEXT NOT NULL,
    "category_price" DECIMAL(14,4),
    "block_price" DECIMAL(14,4),

    CONSTRAINT "shop_event_category_pkey" PRIMARY KEY ("event_id","category_id","category_block_id")
);

-- CreateIndex
CREATE INDEX "shop_event_category_event_id_idx" ON "shop_event_category"("event_id");

-- AddForeignKey
ALTER TABLE "shop_event_category" ADD CONSTRAINT "shop_event_category_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

