/**
 * Mimic the next sock-available scrape batch WITHOUT specific seat ids.
 * Replace semantics: POST deletes all RESALE sock_available for the event and inserts the payload.
 *
 * Usage:
 *   npx tsx scripts/simulate-scrape-without-seats.ts \
 *     --event-id 85 \
 *     --exclude 10229225917380,10229225917396,10229225917413,10229225917425 \
 *     --dry-run
 *
 *   npx tsx scripts/simulate-scrape-without-seats.ts --event-id 85 --exclude ... --post
 *
 *   npx tsx scripts/simulate-scrape-without-seats.ts --sb-ticket 872971 --post
 */

import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const DEFAULT_BASE = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

function parseArgs(argv: string[]) {
  let eventId: number | null = null;
  let sbTicket = "";
  let exclude = new Set<string>();
  let dryRun = false;
  let post = false;
  let outPath = "";
  let baseUrl = DEFAULT_BASE;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--dry-run") dryRun = true;
    else if (a === "--post") post = true;
    else if (a === "--event-id" && argv[i + 1]) {
      eventId = Number(argv[++i]);
    } else if (a.startsWith("--event-id=")) {
      eventId = Number(a.slice("--event-id=".length));
    } else if (a === "--sb-ticket" && argv[i + 1]) {
      sbTicket = String(argv[++i]).trim();
    } else if (a.startsWith("--sb-ticket=")) {
      sbTicket = a.slice("--sb-ticket=".length).trim();
    } else if (a === "--exclude" && argv[i + 1]) {
      for (const id of String(argv[++i]).split(/[,\s]+/)) {
        const t = id.trim();
        if (t) exclude.add(t);
      }
    } else if (a.startsWith("--exclude=")) {
      for (const id of a.slice("--exclude=".length).split(/[,\s]+/)) {
        const t = id.trim();
        if (t) exclude.add(t);
      }
    } else if (a === "--out" && argv[i + 1]) {
      outPath = String(argv[++i]);
    } else if (a.startsWith("--out=")) {
      outPath = a.slice("--out=".length);
    } else if (a === "--base-url" && argv[i + 1]) {
      baseUrl = String(argv[++i]).replace(/\/$/, "");
    } else if (a.startsWith("--base-url=")) {
      baseUrl = a.slice("--base-url=".length).replace(/\/$/, "");
    } else if (a === "--help" || a === "-h") {
      console.log(`See script header for usage.`);
      process.exit(0);
    }
  }

  return { eventId, sbTicket, exclude, dryRun, post, outPath, baseUrl };
}

function rowToFeature(row: {
  seatId: string;
  seatNumber: string;
  row: string;
  amount: { toString(): string } | null;
  resaleMovementId: string | null;
  areaId: string;
  areaName: string;
  blockId: string;
  blockName: string;
  contingentId: string;
  categoryId: string;
  categoryName: string;
}) {
  const amount = row.amount != null ? Number(row.amount.toString()) : null;
  return {
    type: "Feature",
    id: row.seatId,
    properties: {
      id: row.seatId,
      number: row.seatNumber,
      row: row.row,
      amount,
      contingentId: row.contingentId,
      resaleMovementId: row.resaleMovementId,
      seatCategoryId: row.categoryId,
      seatCategory: { en: row.categoryName },
      block: { id: row.blockId, name: { en: row.blockName } },
      area: { id: row.areaId, name: { en: row.areaName } },
    },
  };
}

async function resolveFromSbTicket(ticketId: string) {
  const log = await prisma.sbListingPushLog.findFirst({
    where: { sbTicketId: ticketId, ok: true },
    orderBy: { createdAt: "desc" },
  });
  if (!log) throw new Error(`No push log for sb ticket ${ticketId}`);
  const summary = log.requestSummary as Record<string, unknown> | null;
  const seatIds = (summary?.sourceSeatIds ?? summary?.seatIds) as string[] | undefined;
  if (!seatIds?.length) throw new Error(`Push log ${log.id} has no sourceSeatIds in requestSummary`);
  return { eventId: log.eventId, exclude: new Set(seatIds.map(String)) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let eventId = args.eventId;
  let exclude = args.exclude;

  if (args.sbTicket) {
    const resolved = await resolveFromSbTicket(args.sbTicket);
    eventId = resolved.eventId;
    exclude = resolved.exclude;
    console.log(`Resolved SB ticket ${args.sbTicket} → event ${eventId}, exclude ${[...exclude].join(", ")}`);
  }

  if (!eventId || !Number.isFinite(eventId)) {
    throw new Error("Provide --event-id or --sb-ticket");
  }
  if (exclude.size === 0) {
    throw new Error("Provide --exclude seat ids or --sb-ticket");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, prefId: true, resalePrefId: true, sbEventId: true },
  });
  if (!event) throw new Error(`Event ${eventId} not found`);
  const prefId = (event.resalePrefId ?? event.prefId)?.trim();
  if (!prefId) throw new Error(`Event ${eventId} has no prefId`);

  const allRows = await prisma.sockAvailable.findMany({
    where: { eventId, kind: "RESALE" },
    orderBy: { seatId: "asc" },
  });

  const kept = allRows.filter((r) => !exclude.has(r.seatId));
  const removed = allRows.filter((r) => exclude.has(r.seatId));

  console.log("Event:", event.name, `(id ${eventId}, pref ${prefId}, SB match ${event.sbEventId ?? "—"})`);
  console.log("RESALE rows in DB:", allRows.length);
  console.log("Excluding (simulate sold/gone):", removed.length, [...exclude]);
  console.log("Next scrape batch size:", kept.length);

  const payload = {
    type: "FeatureCollection",
    prefId,
    features: kept.map(rowToFeature),
  };

  const defaultOut = `/tmp/sock-scrape-event-${eventId}-minus-${[...exclude].slice(0, 2).join("-")}.json`;
  const out = args.outPath || defaultOut;
  writeFileSync(out, JSON.stringify(payload));
  console.log("Wrote", out, `(${(JSON.stringify(payload).length / 1024 / 1024).toFixed(2)} MB)`);

  if (args.dryRun && !args.post) {
    console.log("\nDry run only. Re-run with --post to send webhook.");
    return;
  }

  if (!args.post) {
    console.log("\nAdd --post to POST to webhook, or:");
    console.log(
      `curl -sS -X POST "${baseUrl}/api/webhooks/sock-available?prefId=${prefId}" -H "Content-Type: application/json" --data-binary @${out} | jq .sbReconcile`,
    );
    return;
  }

  const url = `${args.baseUrl}/api/webhooks/sock-available?prefId=${encodeURIComponent(prefId)}`;
  console.log("\nPOST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Non-JSON response:", text.slice(0, 500));
    process.exit(1);
  }
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok) {
    process.exit(1);
  }

  const statusUrl = `${args.baseUrl}/api/events/${eventId}/sb-listing-status`;
  console.log("\nGET", statusUrl);
  const statusRes = await fetch(statusUrl, { cache: "no-store" });
  const statusJson = (await statusRes.json()) as {
    reconcile?: unknown;
    removed?: Array<{ sbTicketId?: string; status?: string }>;
  };
  const hit = statusJson.removed?.filter((e) => args.sbTicket && e.sbTicketId === args.sbTicket);
  console.log("reconcile:", statusJson.reconcile);
  if (hit?.length) console.log("listing:", hit);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
