#!/usr/bin/env bash
# Copy all app table data from one PostgreSQL database to another (e.g. local → Railway).
# Prerequisite: target already has schema from `npx prisma migrate deploy`.
#
# Tables (FK order for restore): users, resale_pref_rotation_state, Event, EventCategory,
# event_category_block_prices, event_category_block_availability, event_block_seat_now,
# event_seat_listings
#
# Usage (do not paste real URLs into shell history if you share the machine):
#   export SOURCE_DATABASE_URL="postgresql://..."   # local / current data
#   export TARGET_DATABASE_URL="postgresql://..."   # Railway public URL (+ ?sslmode=require)
#   TRUNCATE_TARGET=1 ./scripts/pg-copy-app-data.sh
#
# Env:
#   TRUNCATE_TARGET=1  — TRUNCATE app tables on target before load (recommended if replacing data).
#
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Migrating target schema (idempotent)..."
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate deploy

TMP="$(mktemp -t eventdetail-pg-dump.XXXXXX.sql)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

echo "Dumping data-only from source (ordered for FK-safe restore)..."

dump_table() {
  local out="$1"
  shift
  pg_dump "$SOURCE_DATABASE_URL" \
    --data-only \
    --no-owner \
    --no-privileges \
    --format=plain \
    "$@" \
    -f "$out"
}

PART1="$(mktemp -t eventdetail-pg-part1.XXXXXX.sql)"
PART2="$(mktemp -t eventdetail-pg-part2.XXXXXX.sql)"
PART3="$(mktemp -t eventdetail-pg-part3.XXXXXX.sql)"
PART4="$(mktemp -t eventdetail-pg-part4.XXXXXX.sql)"
PART5="$(mktemp -t eventdetail-pg-part5.XXXXXX.sql)"
PART6="$(mktemp -t eventdetail-pg-part6.XXXXXX.sql)"
PART7="$(mktemp -t eventdetail-pg-part7.XXXXXX.sql)"
PART8="$(mktemp -t eventdetail-pg-part8.XXXXXX.sql)"

cleanup_parts() { rm -f "$PART1" "$PART2" "$PART3" "$PART4" "$PART5" "$PART6" "$PART7" "$PART8"; }
trap 'cleanup; cleanup_parts' EXIT

dump_table "$PART1" --table='public.users'
dump_table "$PART2" --table='public.resale_pref_rotation_state'
dump_table "$PART3" --table='public."Event"'
dump_table "$PART4" --table='public."EventCategory"'
dump_table "$PART5" --table='public.event_category_block_prices'
dump_table "$PART6" --table='public.event_category_block_availability'
dump_table "$PART7" --table='public.event_block_seat_now'
dump_table "$PART8" --table='public.event_seat_listings'

cat "$PART1" "$PART2" "$PART3" "$PART4" "$PART5" "$PART6" "$PART7" "$PART8" >"$TMP"
rm -f "$PART1" "$PART2" "$PART3" "$PART4" "$PART5" "$PART6" "$PART7" "$PART8"
trap 'cleanup' EXIT

if [[ "${TRUNCATE_TARGET:-}" == "1" ]]; then
  echo "Truncating target app tables (children before parents)..."
  psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE
  public.event_seat_listings,
  public.event_block_seat_now,
  public.event_category_block_availability,
  public.event_category_block_prices,
  public."EventCategory",
  public."Event",
  public.resale_pref_rotation_state,
  public.users
RESTART IDENTITY;
SQL
fi

echo "Loading into target..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TMP"

echo "Syncing sequences to MAX(id)..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX("id") FROM public.users), 1), true);
SELECT setval(pg_get_serial_sequence('public."Event"', 'id'), COALESCE((SELECT MAX("id") FROM public."Event"), 1), true);
SELECT setval(pg_get_serial_sequence('public."EventCategory"', 'id'), COALESCE((SELECT MAX("id") FROM public."EventCategory"), 1), true);
SELECT setval(pg_get_serial_sequence('public.event_category_block_prices', 'id'), COALESCE((SELECT MAX("id") FROM public.event_category_block_prices), 1), true);
SELECT setval(pg_get_serial_sequence('public.event_category_block_availability', 'id'), COALESCE((SELECT MAX("id") FROM public.event_category_block_availability), 1), true);
SELECT setval(pg_get_serial_sequence('public.event_block_seat_now', 'id'), COALESCE((SELECT MAX("id") FROM public.event_block_seat_now), 1), true);
SELECT setval(pg_get_serial_sequence('public.event_seat_listings', 'id'), COALESCE((SELECT MAX("id") FROM public.event_seat_listings), 1), true);
SQL

echo "Done. Verify with: DATABASE_URL=\"\$TARGET_DATABASE_URL\" npx tsx scripts/db-row-counts.ts"
