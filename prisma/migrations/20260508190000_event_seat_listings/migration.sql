-- CreateTable
CREATE TABLE "event_seat_listings" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_block_id" TEXT NOT NULL,
    "category_block_name" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "row_label" TEXT NOT NULL,
    "seat_number" TEXT NOT NULL,
    "seat_category_id" TEXT NOT NULL,
    "seat_category_name" TEXT NOT NULL,
    "contingent_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "resale_movement_id" TEXT NOT NULL,
    "exclusive" BOOLEAN NOT NULL,
    "properties_id" TEXT NOT NULL,
    "geometry_type" TEXT NOT NULL,
    "rotation" INTEGER NOT NULL,
    "coord_x" INTEGER NOT NULL,
    "coord_y" INTEGER NOT NULL,
    "main_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_seat_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_seat_listings_event_id_idx" ON "event_seat_listings"("event_id");

-- CreateIndex
CREATE INDEX "event_seat_listings_event_id_category_block_id_idx" ON "event_seat_listings"("event_id", "category_block_id");

-- CreateIndex
CREATE INDEX "event_seat_listings_seat_category_id_idx" ON "event_seat_listings"("seat_category_id");

-- CreateUniqueConstraint
CREATE UNIQUE INDEX "event_seat_listings_event_id_resale_movement_id_key" ON "event_seat_listings"("event_id", "resale_movement_id");

-- AddForeignKey
ALTER TABLE "event_seat_listings" ADD CONSTRAINT "event_seat_listings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
