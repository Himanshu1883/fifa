-- CreateTable
CREATE TABLE "event_category_block_availability" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_block_id" TEXT NOT NULL,
    "availability" INTEGER NOT NULL,
    "availability_resale" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_category_block_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_category_block_availability_event_id_idx" ON "event_category_block_availability"("event_id");

-- CreateUniqueConstraint
CREATE UNIQUE INDEX "event_category_block_availability_event_id_category_id_category_block_id_key" ON "event_category_block_availability"("event_id", "category_id", "category_block_id");

-- AddForeignKey
ALTER TABLE "event_category_block_availability" ADD CONSTRAINT "event_category_block_availability_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

