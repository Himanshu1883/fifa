-- CreateTable
CREATE TABLE "sock_available_webhook_diff_logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_id" INTEGER NOT NULL,
    "kind" "SockAvailableKind" NOT NULL,
    "pref_id" TEXT NOT NULL,
    "new_count" INTEGER NOT NULL,
    "changed_count" INTEGER NOT NULL,
    "price_changed_count" INTEGER NOT NULL,
    "new_seat_ids" JSONB,
    "sample" JSONB,
    "notify_attempted" BOOLEAN,
    "notify_ok" BOOLEAN,
    "notify_provider" VARCHAR(64),
    "notify_status" VARCHAR(64),
    "notify_error" TEXT,
    "notify_raw" JSONB,
    CONSTRAINT "sock_available_webhook_diff_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sock_available_webhook_diff_logs_event_id_kind_created_at_idx" ON "sock_available_webhook_diff_logs"("event_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "sock_available_webhook_diff_logs_event_id_created_at_idx" ON "sock_available_webhook_diff_logs"("event_id", "created_at");

-- AddForeignKey
ALTER TABLE "sock_available_webhook_diff_logs"
ADD CONSTRAINT "sock_available_webhook_diff_logs_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

