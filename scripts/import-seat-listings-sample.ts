/**
 * One-off: import GeoJSON-style `{ "features": [...] }` into `event_seat_listings`
 * for the resale event (lookup via `Event.resalePrefId`).
 *
 * Usage:
 *   npx tsx scripts/import-seat-listings-sample.ts
 *   npx tsx scripts/import-seat-listings-sample.ts ./payload.json
 *   npx tsx scripts/import-seat-listings-sample.ts -
 *
 * Event resolution:
 *   1. Prefer `Event.resalePrefId === TARGET_RESALE_PREF_ID`
 *   2. If missing — stderr explains, then first `Event` with non-null `resalePrefId` (asc id)
 *   3. If still none — exit 1
 */

import * as fs from "node:fs";
import { createPrismaClient } from "../src/lib/prisma";
import { parseSeatListingsGeojsonBody } from "../src/lib/parse-seat-listings-geojson-webhook";
import { syncResaleSeatListingsForEvent } from "../src/lib/sync-event-seat-listings";

const TARGET_RESALE_PREF_ID = "10229226700888";

/** Embedded sample (valid JSON; three resale seat features). */
const SAMPLE_GEOJSON_BODY: Record<string, unknown> = {
  features: [
    {
      id: 10229529837884,
      geometry: {
        coordinates: [32852, 35298],
        rotation: 350,
        type: "Point",
      },
      properties: {
        id: 10229529837884,
        block: { id: 10229529789579, name: { en: "518" } },
        area: { id: 10229529789271, name: { en: "Main Stand - Upper Tier" } },
        color: "#AD0000",
        row: "2",
        number: "6",
        seatCategoryId: 10229530028131,
        seatCategory: "Category 2",
        contingentId: 11404596151,
        amount: 2343760,
        resaleMovementId: 10229527289509,
        exclusive: true,
      },
    },
    {
      id: 10229529838568,
      geometry: {
        coordinates: [32776, 35311],
        rotation: 350,
        type: "Point",
      },
      properties: {
        id: 10229529838568,
        block: { id: 10229529789579, name: { en: "518" } },
        area: { id: 10229529789271, name: { en: "Main Stand - Upper Tier" } },
        color: "#AD0000",
        row: "2",
        number: "7",
        seatCategoryId: 10229530028131,
        seatCategory: "Category 2",
        contingentId: 11404596151,
        amount: 2343760,
        resaleMovementId: 10229527289510,
        exclusive: true,
      },
    },
    {
      id: 10229529844576,
      geometry: {
        coordinates: [39994, 33936],
        rotation: 321,
        type: "Point",
      },
      properties: {
        id: 10229529844576,
        block: { id: 10229529789583, name: { en: "522" } },
        area: { id: 10229529789276, name: { en: "Main Stand Right - Upper Tier" } },
        color: "#006BD6",
        row: "16",
        number: "10",
        seatCategoryId: 10229530028132,
        seatCategory: "Category 3",
        contingentId: 11404596151,
        amount: 1761120,
        resaleMovementId: 10229643106052,
        exclusive: true,
      },
    },
  ],
};

function positionalArgs(argv: string[]): string[] {
  return argv.filter((a) => !a.startsWith("-"));
}

function loadBodyFromArgs(argv: string[]): Record<string, unknown> {
  const pos = positionalArgs(argv);
  if (pos.length === 0) return { ...SAMPLE_GEOJSON_BODY };

  const pathArg = pos[0]!;
  let raw: string;
  try {
    raw = pathArg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(pathArg, "utf8");
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    console.error("Input is not valid JSON.");
    process.exit(1);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error('Expected a JSON object with a "features" array.');
    process.exit(1);
  }

  return { ...(parsed as Record<string, unknown>) };
}

async function main() {
  const prisma = createPrismaClient();

  const primary = await prisma.event.findFirst({
    where: { resalePrefId: TARGET_RESALE_PREF_ID },
    select: { id: true, resalePrefId: true },
  });

  let selected = primary;
  let resolution: "target_pref" | "fallback_first_resale_pref";

  if (selected?.resalePrefId) {
    resolution = "target_pref";
    console.log(
      `Event resolution: target resalePrefId="${TARGET_RESALE_PREF_ID}" → event id=${selected.id}.`,
    );
  } else {
    console.error(
      `No Event with resalePrefId="${TARGET_RESALE_PREF_ID}". Falling back to the first Event with a non-null resalePrefId (ordered by id asc).`,
    );
    selected = await prisma.event.findFirst({
      where: { resalePrefId: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, resalePrefId: true },
    });
    if (!selected?.resalePrefId) {
      console.error(
        "No Event has resalePrefId set — cannot import seat listings (resale channel only).",
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    resolution = "fallback_first_resale_pref";
    console.warn(
      `Using fallback: event id=${selected.id} resalePrefId="${selected.resalePrefId}".`,
    );
  }

  const resalePrefId = selected.resalePrefId!;
  const body = loadBodyFromArgs(process.argv.slice(2));
  const merged: Record<string, unknown> = {
    ...body,
    resalePrefId,
  };

  const { rows, featureCount, skippedCount } = parseSeatListingsGeojsonBody(merged, null);

  const result = await prisma.$transaction(async (tx) =>
    syncResaleSeatListingsForEvent(tx, resalePrefId, rows),
  );

  if (!result) {
    console.error(`syncResaleSeatListingsForEvent returned null for resalePrefId="${resalePrefId}".`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const count = await prisma.eventSeatListing.count({
    where: { eventId: result.eventId },
  });

  console.log(
    JSON.stringify({
      ok: true,
      eventResolution: resolution,
      resalePrefId,
      eventId: result.eventId,
      featureCount,
      parsedRowCount: rows.length,
      skippedCount,
      seatListingsCountForEvent: count,
    }),
  );

  if (count < 3) {
    console.error(`Expected at least 3 rows for event_id=${result.eventId}, got ${count}.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
