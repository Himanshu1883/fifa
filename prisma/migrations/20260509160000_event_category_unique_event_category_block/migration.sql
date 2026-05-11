-- Ensure uniqueness for insert-only ingestion.
-- We keep the earliest row (lowest id) for any duplicate (event_id, category_id, category_block_id).

DELETE FROM "EventCategory" a
USING "EventCategory" b
WHERE a.id > b.id
  AND a.event_id = b.event_id
  AND a.category_id = b.category_id
  AND a.category_block_id = b.category_block_id;

CREATE UNIQUE INDEX "EventCategory_event_id_category_id_category_block_id_key"
ON "EventCategory"("event_id", "category_id", "category_block_id");

