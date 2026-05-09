-- CreateEnum
CREATE TYPE "CataloguePriceSource" AS ENUM ('PRIMARY_PREF', 'RESELL_PREF');

-- CreateTable
CREATE TABLE "event_category_block_prices" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_block_id" TEXT NOT NULL,
    "min_price" DECIMAL(14,4) NOT NULL,
    "max_price" DECIMAL(14,4) NOT NULL,
    "catalogue_source" "CataloguePriceSource" NOT NULL,

    CONSTRAINT "event_category_block_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_category_block_prices_event_id_idx" ON "event_category_block_prices"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_category_block_prices_event_id_category_id_category_b_key" ON "event_category_block_prices"("event_id", "category_id", "category_block_id", "catalogue_source");

-- AddForeignKey
ALTER TABLE "event_category_block_prices" ADD CONSTRAINT "event_category_block_prices_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
