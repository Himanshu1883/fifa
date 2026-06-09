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
  sbBlockSectionCodesMatch,
  sectionCodeFromFifaBlockName,
  type SbBlockOption,
  type SbMatchCatalog,
} from "../src/lib/seatsbrokers-catalog";
import {
  enrichMappedTicketForPush,
  isLikelyFifaSnowflakeId,
  mapOfferToSeatsBrokersCreateTicket,
  resolveSbSplitTypeForOffer,
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

section("sectionCodeFromFifaBlockName (T1-/T2- venues)");
assert(sectionCodeFromFifaBlockName("T1-06") === "06", "T1-06 → 06");
assert(sectionCodeFromFifaBlockName("T2-43") === "43", "T2-43 → 43");
assert(sectionCodeFromFifaBlockName("111C") === null, "111C has no T-prefix section");
assert(sbBlockSectionCodesMatch("06", "6"), "06 equals 6 numerically");

const mockBlocksCat1Venue: SbBlockOption[] = [
  { rowId: "1061410", blockId: "06" },
  { rowId: "1061399", blockId: "43" },
];
const mockVenueCatalog: SbMatchCatalog = {
  categories: [{ id: "16", name: "Category 1", categoryNum: 1 }],
  blocksByCategoryId: new Map([["16", mockBlocksCat1Venue]]),
};
const t106 = resolveSbBlockFromCatalog(mockVenueCatalog, "16", "T1-06", "10229225847090");
assert(t106.matched && t106.sbBlockRowId === "1061410" && t106.sbBlockCode === "06", "T1-06 → SB 06");
assert(t106.matchSource === "primary", "T1-06 primary match");

const crossVenueCatalog: SbMatchCatalog = {
  categories: [
    { id: "14", name: "Category 3", categoryNum: 3 },
    { id: "15", name: "Category 2", categoryNum: 2 },
  ],
  blocksByCategoryId: new Map([
    ["14", [{ rowId: "1061363", blockId: "11" }]],
    ["15", [{ rowId: "1061377", blockId: "09" }]],
  ]),
};
const t209 = resolveSbBlockFromCatalog(crossVenueCatalog, "14", "T2-09", "x");
assert(
  t209.matched && t209.sbBlockCode === "09" && t209.matchSource === "cross_category" && t209.matchedSbCategoryId === "15",
  "T2-09 cross-category → SB 09 in cat 15",
);

const numericVenueBlocks: SbBlockOption[] = [
  { rowId: "1060414", blockId: "313" },
  { rowId: "1060434", blockId: "240" },
];
const numericVenueCatalog: SbMatchCatalog = {
  categories: [{ id: "15", name: "Category 2", categoryNum: 2 }],
  blocksByCategoryId: new Map([["15", numericVenueBlocks]]),
};
const b240 = resolveSbBlockFromCatalog(numericVenueCatalog, "15", "240", "10229531393022");
assert(
  b240.matched && b240.sbBlockRowId === "1060434" && b240.sbBlockCode === "240",
  "blockName 240 wins over FIFA id substring 313",
);

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

section("resolveSbSplitTypeForOffer");
assert(resolveSbSplitTypeForOffer("single") === "5", "single → split_type 5");
assert(resolveSbSplitTypeForOffer("together") === "2", "together → split_type 2");

section("mapOfferToSeatsBrokersCreateTicket");
const mockOffer: TransformedSeatOffer = {
  kind: "RESALE",
  offerType: "single",
  priceRaw: "3204000",
  priceUsd: 3204,
  originalCount: 1,
  transformedCount: 1,
  sourceGroupCount: 1,
  allSeatIds: ["s1"],
  allSeatNumbers: ["7"],
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
    assert(mapped.fields.split_type === "5", "single offer → split_type 5");
    assert(mapped.fields.ticket_category === "16", "ticket_category is SB 16");
    assert(mapped.summary.sbBlockCode === "111c", "sbBlockCode is section");
    assert(mapped.summary.fifaBlockId === "10229531540407", "fifa block preserved in summary");
  }

  section("strict ticket_category (16/15/14/13 — never cross-category override)");
  const crossCatOffer: TransformedSeatOffer = {
    ...mockOffer,
    seats: [
      {
        ...mockOffer.seats[0]!,
        categoryName: "Category 3",
        categoryId: "3",
        blockName: "T2-09",
      },
    ],
  };
  const crossMapped = mapOfferToSeatsBrokersCreateTicket(
    crossCatOffer,
    "5680",
    config,
    0,
    "2026-06-11",
    crossVenueCatalog,
  );
  assert(
    crossMapped?.fields.ticket_category === "14",
    "cat 3 always sends 14 even when block cross-matches SB cat 15",
  );

  const cat2Mapped = mapOfferToSeatsBrokersCreateTicket(
    {
      ...mockOffer,
      seats: [{ ...mockOffer.seats[0]!, categoryName: "Category 2", categoryId: "2" }],
    },
    "5680",
    config,
    0,
    "2026-06-11",
    crossVenueCatalog,
  );
  assert(cat2Mapped?.fields.ticket_category === "15", "cat 2 always sends 15");

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
    assert(enriched?.fields.split_type === "5", "enrich keeps single split_type 5");
    const togetherOffer: TransformedSeatOffer = { ...mockOffer, offerType: "together", originalCount: 2 };
    const togetherMapped = mapOfferToSeatsBrokersCreateTicket(
      togetherOffer,
      "5680",
      config,
      0,
      "2026-06-11",
      mockCatalog,
    );
    assert(togetherMapped?.fields.split_type === "2", "together offer → split_type 2");
    const staleSplit = {
      ...mapped,
      fields: { ...mapped.fields, split_type: "2" },
    };
    const enrichedSplit = enrichMappedTicketForPush(
      staleSplit,
      [mockOffer],
      "5680",
      config,
      "2026-06-11",
      mockCatalog,
    );
    assert(enrichedSplit?.fields.split_type === "5", "enrich fixes stale split_type for single");
    const wrongCategoryPreview = {
      ...mapped,
      fields: { ...mapped.fields, ticket_category: "15" },
    };
    const enrichedCat = enrichMappedTicketForPush(
      wrongCategoryPreview,
      [mockOffer],
      "5680",
      config,
      "2026-06-11",
      mockCatalog,
    );
    assert(
      enrichedCat?.fields.ticket_category === "16",
      "enrich ignores client ticket_category override — Front Cat 1 stays 16",
    );
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
