import "server-only";

/** True for cold-start / pool / proxy failures worth one retry. */
export function isTransientDbConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout exceeded|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated|too many clients|ENOTFOUND|EHOSTUNREACH/i.test(
    msg,
  );
}

/** User-facing detail for Home / settings when Postgres is unreachable. */
export function formatDbConnectionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes(".railway.internal")) {
    return [
      "DATABASE_URL uses Railway private host (*.railway.internal).",
      "Vercel cannot reach that network — use Railway's public TCP proxy URL (host like *.proxy.rlwy.net) with path /railway.",
      "See DEPLOY.md.",
    ].join(" ");
  }

  if (/timeout exceeded|ETIMEDOUT/i.test(msg)) {
    return [
      msg,
      "Railway's public proxy can be slow from Vercel on cold starts.",
      "Ensure DATABASE_URL is the public URL (not *.railway.internal), use Railway's pooled connection string if available,",
      "and optionally raise PG_CONNECTION_TIMEOUT_MS (default 30000).",
    ].join(" ");
  }

  if (/too many clients/i.test(msg)) {
    return [
      msg,
      "Postgres connection limit reached — use Railway's pooled/PgBouncer URL on Vercel and keep PG_POOL_MAX low (default 2 on Vercel).",
    ].join(" ");
  }

  return msg;
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; delayMs?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 2;
  const delayMs = opts?.delayMs ?? 400;
  let last: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt >= maxAttempts || !isTransientDbConnectionError(e)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }

  throw last;
}
