/**
 * Copy all app rows from SOURCE_DATABASE_URL → TARGET_DATABASE_URL (e.g. local Postgres → Railway).
 * Loads `.env` / `.env.local` via dotenv (same as typical Next.js workflows).
 *
 *   **Easiest:** In `.env` set `DATABASE_URL` = Postgres that has all your data, and add
 *   `RAILWAY_DATABASE_URL` = Railway **public** Postgres URL. Then:
 *
 *     npm run db:push:railway
 *
 * Or set explicitly:
 *
 *   export SOURCE_DATABASE_URL="postgresql://..."
 *   export TARGET_DATABASE_URL="postgresql://...?sslmode=require"
 *   TRUNCATE_TARGET=1 npx tsx scripts/copy-app-data-postgres.ts
 *
 * Optional: TRUNCATE_TARGET=1 clears app tables on the target before copy (recommended when replacing).
 * `npm run db:push:railway` sets that for you.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { execSync } from "node:child_process";
import pg from "pg";

function resolveSourceTarget(): { source: string; target: string } {
  const target =
    process.env.TARGET_DATABASE_URL?.trim() ||
    process.env.RAILWAY_DATABASE_URL?.trim() ||
    "";

  const source =
    process.env.SOURCE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!target) {
    console.error(`
Set the Railway database URL in .env (recommended):

  RAILWAY_DATABASE_URL="postgresql://USER:PASS@HOST:PORT/railway?sslmode=require"

(Copy from Railway → Postgres → Connect → **public** URL, not *.railway.internal)

Or export TARGET_DATABASE_URL for a one-off run.
`);
    process.exit(1);
  }

  if (!source) {
    console.error("Set SOURCE_DATABASE_URL or DATABASE_URL to the Postgres that currently holds your full dataset.");
    process.exit(1);
  }

  if (source === target) {
    console.error(
      "SOURCE and TARGET are the same URL. Put your **local/full-data** URL in DATABASE_URL and add **RAILWAY_DATABASE_URL** for Railway (or use SOURCE_DATABASE_URL / TARGET_DATABASE_URL).",
    );
    process.exit(1);
  }

  return { source, target };
}

const { source: SOURCE_URL, target: TARGET_URL } = resolveSourceTarget();
const TRUNCATE = process.env.TRUNCATE_TARGET === "1";

/** Quoted identifiers exactly as in PostgreSQL / Prisma @@map */
const TABLES_IN_ORDER: { sql: string; label: string }[] = [
  { sql: "public.users", label: "users" },
  { sql: "public.resale_pref_rotation_state", label: "resale_pref_rotation_state" },
  { sql: 'public."Event"', label: "Event" },
  { sql: 'public."EventCategory"', label: "EventCategory" },
  { sql: "public.event_category_block_prices", label: "event_category_block_prices" },
  { sql: "public.event_category_block_availability", label: "event_category_block_availability" },
  { sql: "public.event_block_seat_now", label: "event_block_seat_now" },
  { sql: "public.event_seat_listings", label: "event_seat_listings" },
];

function pool(url: string) {
  return new pg.Pool({ connectionString: url, max: 4 });
}

async function migrateTarget() {
  console.log("Running prisma migrate deploy on target…");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TARGET_URL },
  });
}

async function truncateTarget(t: pg.Pool) {
  console.log("Truncating target app tables…");
  await t.query(`
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
  `);
}

async function countRows(s: pg.Pool, tableSql: string): Promise<number> {
  const r = await s.query(`SELECT COUNT(*)::bigint AS c FROM ${tableSql}`);
  return Number(r.rows[0].c);
}

async function copyTable(
  source: pg.Pool,
  target: pg.Pool,
  tableSql: string,
  label: string,
) {
  const total = await countRows(source, tableSql);
  if (total === 0) {
    console.log(`  ${label}: 0 rows (skip insert)`);
    return;
  }

  const pageSize = label === "event_seat_listings" ? 2000 : 5000;
  let copied = 0;

  for (let offset = 0; offset < total; offset += pageSize) {
    const { rows } = await source.query(
      `SELECT * FROM ${tableSql} ORDER BY id ASC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    if (rows.length === 0) {
      break;
    }

    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    const client = await target.connect();
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        const vals = cols.map((c) => row[c]);
        const ph = vals.map((_, j) => `$${j + 1}`).join(", ");
        await client.query(
          `INSERT INTO ${tableSql} (${colList}) VALUES (${ph})`,
          vals,
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    copied += rows.length;
    console.log(`  ${label}: ${copied}/${total} rows…`);
  }

  console.log(`  ${label}: done (${copied} rows)`);
}

async function syncSequences(t: pg.Pool) {
  await t.query(`
    SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX("id") FROM public.users), 1), true);
    SELECT setval(pg_get_serial_sequence('public."Event"', 'id'), COALESCE((SELECT MAX("id") FROM public."Event"), 1), true);
    SELECT setval(pg_get_serial_sequence('public."EventCategory"', 'id'), COALESCE((SELECT MAX("id") FROM public."EventCategory"), 1), true);
    SELECT setval(pg_get_serial_sequence('public.event_category_block_prices', 'id'), COALESCE((SELECT MAX("id") FROM public.event_category_block_prices), 1), true);
    SELECT setval(pg_get_serial_sequence('public.event_category_block_availability', 'id'), COALESCE((SELECT MAX("id") FROM public.event_category_block_availability), 1), true);
    SELECT setval(pg_get_serial_sequence('public.event_block_seat_now', 'id'), COALESCE((SELECT MAX("id") FROM public.event_block_seat_now), 1), true);
    SELECT setval(pg_get_serial_sequence('public.event_seat_listings', 'id'), COALESCE((SELECT MAX("id") FROM public.event_seat_listings), 1), true);
  `);
}

async function main() {
  console.log(
    `Source → target copy (PostgreSQL only). TRUNCATE_TARGET=${TRUNCATE ? "1" : "0"} — ${
      TRUNCATE
        ? "truncate app tables on target, then reload all rows"
        : "no truncate; duplicate keys may fail inserts"
    }.`,
  );

  await migrateTarget();

  const sourcePool = pool(SOURCE_URL);
  const targetPool = pool(TARGET_URL);

  try {
    console.log("Checking source row counts…");
    for (const { sql, label } of TABLES_IN_ORDER) {
      const n = await countRows(sourcePool, sql);
      console.log(`  ${label}: ${n}`);
    }

    const seatN = await countRows(sourcePool, TABLES_IN_ORDER.at(-1)!.sql);
    const eventN = await countRows(sourcePool, 'public."Event"');
    if (eventN === 0 && seatN === 0) {
      console.warn(
        "\n⚠ Source has no Event / seat listing rows. If your real data is only in SQLite (dev.db) or another machine, point SOURCE_DATABASE_URL at the Postgres that actually has the data.\n",
      );
    }

    if (TRUNCATE) {
      await truncateTarget(targetPool);
    } else {
      console.warn(
        "\n⚠ TRUNCATE_TARGET not set to 1 — inserts may fail on duplicate keys. Use TRUNCATE_TARGET=1 for a full replace.\n",
      );
    }

    console.log("Copying tables in FK order…");
    for (const { sql, label } of TABLES_IN_ORDER) {
      await copyTable(sourcePool, targetPool, sql, label);
    }

    console.log("Syncing sequences…");
    await syncSequences(targetPool);

    console.log("\nDone. Verify with your Railway URL as DATABASE_URL:");
    console.log("  DATABASE_URL=\"…\" npx tsx scripts/db-row-counts.ts");
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
