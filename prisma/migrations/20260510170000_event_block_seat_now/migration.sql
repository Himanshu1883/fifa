-- CreateTable
CREATE TABLE "event_block_seat_now" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "availability" INTEGER NOT NULL,
    "availability_resale" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_block_seat_now_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_block_seat_now_event_id_category_id_block_id_key" ON "event_block_seat_now"("event_id", "category_id", "block_id");

-- CreateIndex
CREATE INDEX "event_block_seat_now_event_id_idx" ON "event_block_seat_now"("event_id");

-- AddForeignKey
ALTER TABLE "event_block_seat_now" ADD CONSTRAINT "event_block_seat_now_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

