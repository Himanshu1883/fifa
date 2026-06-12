/**
 * Delete ALL SB listing push logs from the database (all events, active + deleted + failed).
 *
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-all-sb-listing-logs.ts --dry-run
 *   DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/purge-all-sb-listing-logs.ts --yes
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

const envPath = process.env.DOTENV_CONFIG_PATH ?? ".env.local";
const resolvedEnv = resolve(envPath);
if (existsSync(resolvedEnv)) loadDotenv({ path: resolvedEnv });

function connectionStringWithoutPgSslQueryParams(connectionString: string): string {
  try {
    const httpish = connectionString.replace(/^postgres(ql)?:/i, "http:");
    const parsed = new URL(httpish);
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslaccept", "uselibpqcompat"]) {
      parsed.searchParams.delete(key);
    }
    const query = parsed.searchParams.toString();
    return `${connectionString.split("?")[0]}${query ? `?${query}` : ""}`;
  } catch {
    return connectionString.replace(/[?&](sslmode|uselibpqcompat)=[^&]*/gi, "");
  }
}

function effectivePgSslRejectUnauthorized(connectionString: string): boolean | undefined {
  const override = process.env.DATABASE_PG_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();
  if (override === "0" || override === "false") return false;
  if (override === "1" || override === "true") return true;
  try {
    const host = new URL(connectionString.replace(/^postgresql:/i, "http:")).hostname.toLowerCase();
    if (host.endsWith(".proxy.rlwy.net")) return false;
  } catch {
    /* default */
  }
  return undefined;
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is missing (set DOTENV_CONFIG_PATH=.env.local).");
}

const rejectUnauthorized = effectivePgSslRejectUnauthorized(connectionString);
const poolConnectionString =
  rejectUnauthorized === false
    ? connectionStringWithoutPgSslQueryParams(connectionString)
    : connectionString;
const poolConfig: PoolConfig = { connectionString: poolConnectionString };
if (rejectUnauthorized === false) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(poolConfig),
});

function parseArgs(argv: string[]) {
  let dryRun = false;
  let yes = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes" || a === "-y") yes = true;
  }
  return { dryRun, yes };
}

async function main() {
  const { dryRun, yes } = parseArgs(process.argv.slice(2));

  const total = await prisma.sbListingPushLog.count();
  const active = await prisma.sbListingPushLog.count({
    where: { ok: true, sbDeletedAt: null, sbTicketId: { not: null } },
  });
  const deleted = await prisma.sbListingPushLog.count({
    where: { sbDeletedAt: { not: null } },
  });
  const byEvent = await prisma.sbListingPushLog.groupBy({
    by: ["eventId"],
    _count: { _all: true },
    orderBy: { _count: { eventId: "desc" } },
  });

  console.log("SB listing push logs (all events):");
  console.log({
    totalRows: total,
    listedActive: active,
    deletedOnSb: deleted,
    eventCount: byEvent.length,
  });

  if (total === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (dryRun || !yes) {
    console.log("\nDry run — pass --yes to delete ALL rows from sb_listing_push_logs.");
    return;
  }

  const result = await prisma.sbListingPushLog.deleteMany({});
  console.log("\nDeleted", result.count, "push log row(s) across all events.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
