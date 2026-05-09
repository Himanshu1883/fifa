#!/usr/bin/env bash
# Copy app table data from one PostgreSQL database to another (e.g. local → Railway).
# Prerequisite: target already has schema from `npx prisma migrate deploy`.
#
# Usage (do not paste real URLs into shell history if you share the machine):
#   export SOURCE_DATABASE_URL="postgresql://..."   # local / current data
#   export TARGET_DATABASE_URL="postgresql://..."   # Railway public URL (+ ?sslmode=require)
#   ./scripts/pg-copy-app-data.sh
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

echo "Dumping data-only from source..."
pg_dump "$SOURCE_DATABASE_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --format=plain \
  --table='public."Event"' \
  --table='public."EventCategory"' \
  --table='public.users' \
  -f "$TMP"

if [[ "${TRUNCATE_TARGET:-}" == "1" ]]; then
  echo "Truncating target app tables..."
  psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE public."EventCategory", public."Event", public.users RESTART IDENTITY CASCADE;
SQL
fi

echo "Loading into target..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TMP"

echo "Syncing sequences to MAX(id)..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT setval(pg_get_serial_sequence('"Event"', 'id'), COALESCE((SELECT MAX("id") FROM public."Event"), 1), true);
SELECT setval(pg_get_serial_sequence('"EventCategory"', 'id'), COALESCE((SELECT MAX("id") FROM public."EventCategory"), 1), true);
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX("id") FROM public.users), 1), true);
SQL

echo "Done. Verify with: DATABASE_URL=\"\$TARGET_DATABASE_URL\" npx tsx scripts/db-row-counts.ts"
