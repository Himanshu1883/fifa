-- CreateTable
CREATE TABLE "sock_available" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "area_id" TEXT NOT NULL,
    "area_name" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "block_name" TEXT NOT NULL,
    "contingent_id" TEXT NOT NULL,
    "seatid" TEXT NOT NULL,
    "seat_number" TEXT NOT NULL,
    "resalemovementid" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "categoryname" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sock_available_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sock_available_event_id_idx" ON "sock_available"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "sock_available_event_id_resalemovementid_key" ON "sock_available"("event_id", "resalemovementid");

-- AddForeignKey
ALTER TABLE "sock_available" ADD CONSTRAINT "sock_available_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

