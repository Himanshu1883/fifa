import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadDotenvFile } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Next dev / bundled server chunks may run with a cwd that is not the repo root.
 * Walk up from this module until we find the app package (has `next` in package.json).
 */
function findNextPackageRoot(startDir: string): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 24; i++) {
    const pkgPath = resolve(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        if (pkg.dependencies?.next ?? pkg.devDependencies?.next) {
          return dir;
        }
      } catch {
        /* keep walking */
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function projectRootDir(): string {
  return findNextPackageRoot(dirname(fileURLToPath(import.meta.url)));
}

let attemptedEnvHydration = false;

/**
 * Next injects `.env*` for most Server Components, but not every server path loads
 * dotenv-equivalent merges before arbitrary modules evaluate. When `DATABASE_URL`
 * is still empty on first DB use, load the same file stack Next would use, anchored
 * to the real package directory (not `process.cwd()`).
 */
function hydrateDatabaseUrlFromEnvFiles(): void {
  const cur = process.env.DATABASE_URL;
  if (cur !== undefined && !String(cur).trim()) {
    delete process.env.DATABASE_URL;
  }
  if (process.env.DATABASE_URL?.trim()) return;
  if (attemptedEnvHydration) return;
  attemptedEnvHydration = true;

  const root = projectRootDir();
  const prod = process.env.NODE_ENV === "production";
  const relPaths = prod
    ? [".env", ".env.local", ".env.production", ".env.production.local"]
    : [".env", ".env.local", ".env.development", ".env.development.local"];

  relPaths.forEach((rel, idx) => {
    const path = resolve(root, rel);
    if (!existsSync(path)) return;
    loadDotenvFile({ path, override: idx > 0 });
  });
}

/** First ~maxLen chars for errors; password masked. */
export function maskPostgresUrlForDisplay(url: string, maxLen = 80): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = parsed.username ? "***" : parsed.username;
    const s = parsed.toString();
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen)}…` : url;
  }
}

/** Same file merge as `requireDatabaseUrl`, for diagnostics without connecting. */
export function maskedDatabaseUrlAfterHydrate(): string {
  hydrateDatabaseUrlFromEnvFiles();
  const raw = process.env.DATABASE_URL?.trim();
  return raw ? maskPostgresUrlForDisplay(raw) : "(unset)";
}

function assertResolvedPostgresUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL. If the password has special characters, URL-encode them. See DEPLOY.md. (value: ${maskPostgresUrlForDisplay(url)})`,
    );
  }

  const protocolOk = /^postgres(ql)?:$/i.test(parsed.protocol);
  if (!protocolOk) {
    throw new Error(
      `DATABASE_URL must use protocol postgresql:// or postgres:// (PostgreSQL only). (value: ${maskPostgresUrlForDisplay(url)})`,
    );
  }

  const dbPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
  const databaseName = dbPath.split("/")[0] ?? "";
  if (!databaseName) {
    throw new Error(
      `DATABASE_URL must include a database name after the host, e.g. postgresql://USER:PASS@HOST:5432/postgres — a URL ending with only :5432 or with an empty path triggers Prisma error P1010 (database \"(not available)\"). See .env.example and DEPLOY.md. (resolved URL, masked): ${maskPostgresUrlForDisplay(url)}`,
    );
  }

  const isLocalSocketStyle = !parsed.hostname && /^postgres(ql)?:\/\/\//i.test(url);
  if (!parsed.hostname && !isLocalSocketStyle) {
    throw new Error(
      `DATABASE_URL must include a hostname (e.g. localhost or your provider host), unless you use a local socket-style URL like postgresql:///mydb. See DEPLOY.md. (value: ${maskPostgresUrlForDisplay(url)})`,
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".railway.internal") && process.env.VERCEL === "1") {
    throw new Error(
      "DATABASE_URL points at a Railway private host (*.railway.internal). Vercel cannot reach that network; use Railway's public Postgres URL (host often ends with .proxy.rlwy.net or .railway.app) with a path like /railway. See DEPLOY.md.",
    );
  }
}

function requireDatabaseUrl(): string {
  hydrateDatabaseUrlFromEnvFiles();

  const raw = process.env.DATABASE_URL;
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) {
    throw new Error(
      [
        "DATABASE_URL is missing or empty at runtime.",
        "Locally: copy .env.example to .env in the project root, set DATABASE_URL, restart dev.",
        "Vercel: Settings → Environment Variables → add DATABASE_URL for Production **and** Preview (and Development if you use `vercel dev`); name must be DATABASE_URL exactly—not only POSTGRES_URL.",
        "Details: DEPLOY.md.",
      ].join(" "),
    );
  }
  if (url.startsWith("file:")) {
    throw new Error(
      'DATABASE_URL uses a SQLite-style URL ("file:…"). This app uses PostgreSQL only—use postgresql://… (see .env.example and DEPLOY.md).',
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      `DATABASE_URL must start with postgresql:// or postgres:// (PostgreSQL only). (value: ${maskPostgresUrlForDisplay(url)})`,
    );
  }
  assertResolvedPostgresUrl(url);
  return url;
}

/** Fail fast when Postgres is unreachable (default pg timeout is indefinite). */
const PG_CONNECTION_TIMEOUT_MS = 15_000;

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requireDatabaseUrl(),
    connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 60_000,
    max: 10,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let devPrisma: PrismaClient | undefined;

function getPrismaSingleton(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return (globalForPrisma.prisma ??= createPrismaClient());
  }
  return (devPrisma ??= createPrismaClient());
}

/**
 * Lazily creates the client on first use so `requireDatabaseUrl()` runs when the
 * request has env (avoids failing at cold import before `DATABASE_URL` exists).
 * PostgreSQL via `pg` (`@prisma/adapter-pg`). Requires `DATABASE_URL`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaSingleton();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
