/**
 * Diagnose SB block mapping for a match.
 * Run: DOTENV_CONFIG_PATH=.env.local node --import tsx scripts/diagnose-sb-blocks-match.ts 5677
 */
import { mapOffersToSeatsBrokersCreateTickets } from "../src/lib/seatsbrokers-offer-map";
import { transformSeatOffersFromSockRows } from "../src/lib/seat-offers-transform";
import { runtimeFromConfig, defaultSbPushRulesConfig } from "../src/lib/sb-push-rules-settings-types";
import {
  loadSbMatchCatalogForOffers,
  resolveSbBlockFromCatalog,
  resolveSbCategoryFromCatalog,
} from "../src/lib/seatsbrokers-catalog";
import { getSeatsBrokersConfig } from "../src/lib/seatsbrokers-config";
import { prisma } from "../src/lib/prisma";

const MATCH_ID = process.argv[2]?.trim() || "5677";
const EVENT_NAME_HINT = process.argv[3]?.trim() || "Korea Republic vs Czechia";

async function main() {
  const event = await prisma.event.findFirst({
    where: {
      OR: [
        { name: { contains: EVENT_NAME_HINT, mode: "insensitive" } },
        { sbEventId: MATCH_ID },
      ],
    },
    select: { id: true, name: true, sbEventId: true, prefId: true, resalePrefId: true },
  });

  console.log("=== Event ===");
  console.log(JSON.stringify(event, null, 2));
  if (!event) return;

  const blocks = await prisma.sockAvailable.groupBy({
    by: ["categoryName", "categoryId", "blockName", "blockId"],
    where: { eventId: event.id, kind: "RESALE" },
    _count: { _all: true },
    orderBy: [{ categoryName: "asc" }, { blockName: "asc" }],
  });

  console.log(`\n=== FIFA resale blocks (${blocks.length} unique) ===`);
  for (const b of blocks) {
    console.log(
      `${b.categoryName} | ${b.blockName} | fifaBlockId=${b.blockId} | seats=${b._count._all}`,
    );
  }

  const config = getSeatsBrokersConfig();
  if (!config) {
    console.log("\nNo SEATS_BROKERS_API_KEY — cannot fetch SB catalog.");
    return;
  }

  const rows = await prisma.sockAvailable.findMany({
    where: { eventId: event.id, kind: "RESALE" },
    select: {
      id: true,
      amount: true,
      areaName: true,
      blockName: true,
      contingentId: true,
      row: true,
      seatNumber: true,
      seatId: true,
      resaleMovementId: true,
      categoryName: true,
      categoryId: true,
      areaId: true,
      blockId: true,
      kind: true,
    },
  });
  const payload = rows.map((r) => ({
    id: r.id,
    amount: r.amount?.toString() ?? null,
    areaName: r.areaName,
    blockName: r.blockName,
    contingentId: r.contingentId,
    row: r.row,
    seatNumber: r.seatNumber,
    seatId: r.seatId,
    resaleMovementId: r.resaleMovementId,
    categoryName: r.categoryName,
    categoryId: r.categoryId,
    areaId: r.areaId,
    blockId: r.blockId,
    kind: r.kind,
  }));
  const runtime = runtimeFromConfig(defaultSbPushRulesConfig());
  const offers = transformSeatOffersFromSockRows(payload, runtime).offers.filter((o) => o.kind === "RESALE");
  console.log(`\n=== Transformed offers: ${offers.length} ===`);

  const catalog = await loadSbMatchCatalogForOffers(MATCH_ID, offers, config);

  console.log("\n=== SB dropdown categories ===");
  for (const c of catalog.categories) {
    console.log(`  id=${c.id} name=${c.name} catNum=${c.categoryNum}`);
  }
  if (catalog.dropdownError) console.log("dropdown error:", catalog.dropdownError);

  console.log("\n=== SB blocks by category ===");
  for (const [catId, blks] of catalog.blocksByCategoryId) {
    console.log(`  cat ${catId}: ${blks.map((b) => `${b.blockId}(${b.rowId})`).join(", ")}`);
  }

  const mapped = mapOffersToSeatsBrokersCreateTickets(offers, MATCH_ID, config, null, catalog);
  const withBlock = mapped.filter((m) => m.fields.ticket_block);
  const noBlock = mapped.filter((m) => !m.fields.ticket_block);

  console.log("\n=== Mapping results ===");
  console.log(`with ticket_block: ${withBlock.length} | without: ${noBlock.length}`);

  const unmatched = new Map<string, number>();
  for (const m of noBlock) {
    const key = `${m.summary.categoryName}|${m.summary.blockName}`;
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  console.log("\n=== Unmatched FIFA blocks (offers missing ticket_block) ===");
  for (const [k, n] of unmatched) console.log(`  ${k} (${n} offers)`);

  console.log("\n=== Per-block resolution ===");
  const seen = new Set<string>();
  for (const b of blocks) {
    const key = `${b.categoryId}|${b.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cat = resolveSbCategoryFromCatalog(catalog, b.categoryName, b.categoryId);
    const res = resolveSbBlockFromCatalog(catalog, cat.sbCategoryId, b.blockName, b.blockId);
    console.log(`FIFA: ${b.blockName} (${b.categoryName})`);
    console.log(
      `  -> sbCategoryId=${cat.sbCategoryId} matched=${res.matched} ticket_block=${res.sbBlockRowId || "MISSING"} sbCode=${res.sbBlockCode || "-"}`,
    );
    if (!res.matched && res.sbBlockOptions.length) {
      console.log(`  SB options: ${res.sbBlockOptions.map((o) => o.blockId).join(", ")}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
