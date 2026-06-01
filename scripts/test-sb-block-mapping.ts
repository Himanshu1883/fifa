/**
 * SeatsBrokers block mapping + push payload tests (no DB required for unit部分).
 * Run: node --import tsx scripts/test-sb-block-mapping.ts
 * Optional: TEST_SB_LIVE=1 to hit sandbox create/list APIs.
 */
import {
  isValidSbTicketBlockValue,
  parseSbTicketBlocks,
  resolveSbBlockFromCatalog,
  resolveSbTicketBlockRowId,
  type SbBlockOption,
  type SbMatchCatalog,
} from "../src/lib/seatsbrokers-catalog";
import {
  enrichMappedTicketForPush,
  isLikelyFifaSnowflakeId,
  mapOfferToSeatsBrokersCreateTicket,
} from "../src/lib/seatsbrokers-offer-map";
import { getSeatsBrokersConfig } from "../src/lib/seatsbrokers-config";
import { sbCreateTicket, sbGetTicketBlocks, sbListTickets } from "../src/lib/seatsbrokers-client";
import type { TransformedSeatOffer } from "../src/lib/seat-offers-transform";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

const mockBlocksCat16: SbBlockOption[] = [
  { rowId: "1060775", blockId: "111a" },
  { rowId: "1060776", blockId: "111c" },
];

const mockCatalog: SbMatchCatalog = {
  categories: [
    { id: "16", name: "Category 1", categoryNum: 1 },
    { id: "13", name: "Category 4", categoryNum: 4 },
  ],
  blocksByCategoryId: new Map([
    ["16", mockBlocksCat16],
    [
      "13",
      [
        { rowId: "1060690", blockId: "4" },
        { rowId: "1060691", blockId: "3" },
      ],
    ],
  ]),
};

section("parseSbTicketBlocks");
const parsed = parseSbTicketBlocks({
  result: [{ id: 1060776, block_id: "111c" }],
});
assert(parsed.length === 1 && parsed[0]!.rowId === "1060776" && parsed[0]!.blockId === "111c", "parses id + block_id");

section("resolveSbBlockFromCatalog");
const r1 = resolveSbBlockFromCatalog(mockCatalog, "16", "111C", "10229531540407");
assert(r1.matched && r1.sbBlockRowId === "1060776" && r1.sbBlockCode === "111c", "111C → row 1060776");

const r4 = resolveSbBlockFromCatalog(mockCatalog, "13", "4", "x");
assert(r4.matched && r4.sbBlockRowId === "1060690" && r4.sbBlockCode === "4", "cat4 block 4 → row 1060690");

section("resolveSbTicketBlockRowId (legacy section code → row id)");
assert(
  resolveSbTicketBlockRowId("111c", mockBlocksCat16, "") === "1060776",
  "section code 111c converts to row id",
);
assert(
  resolveSbTicketBlockRowId("1060776", mockBlocksCat16, "") === "1060776",
  "row id passes through",
);
assert(isValidSbTicketBlockValue("111c", mockBlocksCat16), "valid by section code");
assert(isValidSbTicketBlockValue("1060776", mockBlocksCat16), "valid by row id");

section("isLikelyFifaSnowflakeId");
assert(isLikelyFifaSnowflakeId("10229531540407"), "FIFA id detected");
assert(!isLikelyFifaSnowflakeId("1060776"), "SB row id not FIFA");
assert(!isLikelyFifaSnowflakeId("111c"), "section code not FIFA");

section("mapOfferToSeatsBrokersCreateTicket");
const mockOffer: TransformedSeatOffer = {
  kind: "RESALE",
  offerType: "single",
  priceRaw: "3204000",
  priceUsd: 3204,
  originalCount: 1,
  transformedCount: 1,
  sourceGroupCount: 1,
  seats: [
    {
      key: "k1",
      seatId: "s1",
      resaleMovementId: null,
      row: "3",
      seatNumber: "7",
      categoryId: "10229998855181",
      categoryName: "Front Category 1",
      blockId: "10229531540407",
      blockName: "111C",
      areaId: "a1",
      areaName: "Area",
      contingentId: "c1",
    },
  ],
};

const config = getSeatsBrokersConfig();

async function liveSbTests() {
  if (process.env.TEST_SB_LIVE !== "1" || !config) return;
  section("LIVE SB sandbox — ticket_block row id");
  const row = String(Date.now() % 100000);
  const blockRes = await sbGetTicketBlocks("5680", "16", config);
  assert(blockRes.ok, "ticket_block API ok");
  if (!blockRes.ok) return;
  const blocks = parseSbTicketBlocks(blockRes.data);
  const target = blocks.find((b) => b.blockId === "111c");
  assert(Boolean(target), "found 111c block in catalog");

  if (!target) return;

  const createRes = await sbCreateTicket(
    {
      match_id: "5680",
      ticket_type: config.defaultTicketType,
      quantity: "1",
      ticket_category: "16",
      ticket_block: target.rowId,
      ticket_row: row,
      home_town: config.defaultHomeTown,
      price_type: config.priceType,
      price: "1",
      ticket_details: "1",
      split_type: config.defaultSplitTypeSingle,
      date_to_ship: "2026-06-11",
    },
    config,
  );
  assert(
    createRes.ok,
    createRes.ok ? "create ticket ok" : `create failed: ${createRes.error}`,
  );
  if (!createRes.ok) return;

  const listRes = await sbListTickets("5680", config);
  assert(listRes.ok, "list tickets ok");
  if (listRes.ok) {
    const rows = Array.isArray((listRes.data as { result?: unknown }).result)
      ? ((listRes.data as { result: unknown[] }).result as Record<string, unknown>[])
      : [];
    const found = rows.find((t) => String(t.row) === row);
    assert(found != null, `found created ticket row=${row}`);
    if (found) {
      assert(found.block_id === "111c", `SB block_id populated (got ${String(found.block_id)})`);
    }
  }
}

if (!config) {
  console.error("SEATS_BROKERS_API_KEY not set — skip mapper test");
  failed++;
} else {
  const mapped = mapOfferToSeatsBrokersCreateTicket(
    mockOffer,
    "5680",
    config,
    0,
    "2026-06-11",
    mockCatalog,
  );
  assert(mapped != null, "offer maps");
  if (mapped) {
    assert(mapped.fields.ticket_block === "1060776", "ticket_block is row id 1060776");
    assert(mapped.fields.ticket_block !== "111c", "ticket_block is not section code");
    assert(mapped.fields.ticket_category === "16", "ticket_category is SB 16");
    assert(mapped.summary.sbBlockCode === "111c", "sbBlockCode is section");
    assert(mapped.summary.fifaBlockId === "10229531540407", "fifa block preserved in summary");
  }

  section("enrichMappedTicketForPush (old preview with section code)");
  if (mapped) {
    const stale = {
      ...mapped,
      fields: { ...mapped.fields, ticket_block: "111c" },
    };
    const enriched = enrichMappedTicketForPush(stale, [mockOffer], "5680", config, "2026-06-11", mockCatalog);
    assert(enriched?.fields.ticket_block === "1060776", "enrich fixes section code to row id");
    const fifaStale = {
      ...mapped,
      fields: { ...mapped.fields, ticket_block: "10229531540407" },
    };
    const enriched2 = enrichMappedTicketForPush(
      fifaStale,
      [mockOffer],
      "5680",
      config,
      "2026-06-11",
      mockCatalog,
    );
    assert(enriched2?.fields.ticket_block === "1060776", "enrich replaces FIFA id with row id");
  }
}

async function main() {
  if (config) {
    await liveSbTests();
  } else {
    section("LIVE SB sandbox");
    console.log("  (skipped — set SEATS_BROKERS_API_KEY and TEST_SB_LIVE=1)");
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
