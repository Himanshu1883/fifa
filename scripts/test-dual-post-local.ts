/**
 * Local dual-post test — verifies Match 17/18 post to per-match AND general drop channels.
 *
 * Prerequisites in .env.local:
 *   DISCORD_SHOP_WEBHOOK_URL          → #lms-drop
 *   DISCORD_NEW_LISTINGS_WEBHOOK_URL  → #resale-drop
 *   DATABASE_URL, MATCH17/18 webhooks (or seeded via npm run seed:match-discord)
 *
 * Usage:
 *   npm run test:dual-post
 *   (starts dev server if http://localhost:3000 is not up)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { spawn } from "node:child_process";
import pg from "pg";

const BASE = process.env.DUAL_POST_TEST_BASE_URL?.trim() || "http://localhost:3000";

function envTrim(key: string): string {
  return String(process.env[key] ?? "").trim();
}

async function waitForServer(maxMs = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function startDevServer(): ReturnType<typeof spawn> {
  return spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: "ignore",
    shell: true,
    detached: process.platform !== "win32",
  });
}

async function postTestEmbed(
  label: string,
  webhookUrl: string,
  color: number,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: label,
          description: "Local dual-post test from eventdetail (scripts/test-dual-post-local.ts).",
          color,
        },
      ],
    }),
  });
  return { ok: res.ok, status: res.status };
}

async function main() {
  const generalShop = envTrim("DISCORD_SHOP_WEBHOOK_URL");
  const generalResale = envTrim("DISCORD_NEW_LISTINGS_WEBHOOK_URL");
  const hasGeneral = Boolean(generalShop && generalResale);

  if (!hasGeneral) {
    console.warn(`
⚠ General drop webhooks not in .env.local — dual-post to #lms-drop / #resale-drop will be skipped.
  Add (copy from Vercel dashboard or Discord):
    DISCORD_SHOP_WEBHOOK_URL=...
    DISCORD_NEW_LISTINGS_WEBHOOK_URL=...
`);
  }

  const databaseUrl = envTrim("DATABASE_URL");
  if (!databaseUrl) {
    console.error("DATABASE_URL required in .env.local");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let match17: { shop: string | null; resale: string | null } = { shop: null, resale: null };
  try {
    const { rows } = await client.query(
      `SELECT shop_webhook_url, resale_webhook_url FROM match_discord_webhooks WHERE match_num = 17`,
    );
    match17 = {
      shop: rows[0]?.shop_webhook_url ?? null,
      resale: rows[0]?.resale_webhook_url ?? null,
    };
  } finally {
    await client.end();
  }

  if (!match17.shop || !match17.resale) {
    console.error("Match 17 webhooks not in DB. Run: npm run seed:match-discord -- 17");
    process.exit(1);
  }

  console.log("Config OK — general + Match 17 per-match webhooks found.\n");

  // --- Phase 1: direct dual-post ping (no dev server needed) ---
  if (hasGeneral) {
    console.log("Phase 1 — Direct Discord dual-post ping (Match 17)…");
    const shopDedicated = await postTestEmbed(
      "Dual-post test · Match 17 · LMS dedicated (#france-vs-senegal)",
      match17.shop!,
      0x3498db,
    );
    const shopGeneral = await postTestEmbed(
      "Dual-post test · Match 17 · LMS general (#lms-drop mirror)",
      generalShop,
      0x9b59b6,
    );
    const resaleDedicated = await postTestEmbed(
      "Dual-post test · Match 17 · Resale dedicated",
      match17.resale!,
      0x3b82f6,
    );
    const resaleGeneral = await postTestEmbed(
      "Dual-post test · Match 17 · Resale general (#resale-drop mirror)",
      generalResale,
      0xe67e22,
    );

    console.log(
      JSON.stringify(
        {
          phase1: {
            shopDedicated,
            shopGeneral,
            resaleDedicated,
            resaleGeneral,
            allOk:
              shopDedicated.ok &&
              shopGeneral.ok &&
              resaleDedicated.ok &&
              resaleGeneral.ok,
          },
        },
        null,
        2,
      ),
    );

    if (!shopDedicated.ok || !shopGeneral.ok || !resaleDedicated.ok || !resaleGeneral.ok) {
      process.exit(1);
    }
  } else {
    console.log("Phase 1 — Skipped (no general webhooks in .env.local)\n");
  }

  // --- Phase 2: app code path via dev server ---
  console.log("\nPhase 2 — App shop baseline (dual-post via sendShopBaselineToDiscord)…");

  let devProc: ReturnType<typeof spawn> | null = null;
  let serverUp = false;
  try {
    const probe = await fetch(`${BASE}/api/health-db`, { signal: AbortSignal.timeout(3000) });
    serverUp = probe.status < 500;
  } catch {
    serverUp = false;
  }

  if (!serverUp) {
    console.log("Starting dev server…");
    devProc = startDevServer();
    serverUp = await waitForServer();
    if (!serverUp) {
      console.error("Dev server did not start in time. Run: npm run dev");
      process.exit(1);
    }
  }

  let baselineRes: Response;
  if (hasGeneral) {
    baselineRes = await fetch(`${BASE}/api/webhook-baseline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "shop" }),
      signal: AbortSignal.timeout(120_000),
    });
  } else {
    console.log("(No general shop URL — using GET /api/shop/latest for per-match shop notify)");
    baselineRes = await fetch(`${BASE}/api/shop/latest`, {
      signal: AbortSignal.timeout(120_000),
    });
  }
  const baselineJson = await baselineRes.json().catch(async () => ({
    raw: await baselineRes.text().catch(() => ""),
  }));
  const phase2Summary =
    baselineJson && typeof baselineJson === "object" && "events" in baselineJson
      ? {
          status: baselineRes.status,
          eventCount: Array.isArray(baselineJson.events) ? baselineJson.events.length : 0,
          scannedAt: baselineJson.scannedAt,
        }
      : { status: baselineRes.status, body: baselineJson };
  console.log(JSON.stringify({ phase2: phase2Summary }, null, 2));

  if (!baselineRes.ok) {
    process.exit(1);
  }
  if (hasGeneral && baselineJson && typeof baselineJson === "object" && baselineJson.ok === false) {
    process.exit(1);
  }

  console.log("\nDone. Check Discord:");
  if (hasGeneral) {
    console.log("  • #lms-drop — full shop baseline (all matches)");
    console.log("  • Phase 1 test embeds in dedicated + general channels");
  }
  console.log("  • #17-france-vs-senegal LMS — Match 17 shop baseline (per-match)");

  if (devProc?.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(devProc.pid), "/f", "/t"], { shell: true });
      } else {
        process.kill(-devProc.pid!, "SIGTERM");
      }
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
