/**
 * Unit tests for seat-offer quantity mapping and aggregation.
 * Run: node --import tsx scripts/test-seat-offers-transform.ts
 */
import assert from "node:assert/strict";

import {
  applyMarkupPercentToTransformResult,
  mapAggregatedSeatOfferQuantity,
  transformSeatOffersFromSockRows,
} from "../src/lib/seat-offers-transform";
import type { SockAvailableRowLike } from "../src/lib/sock-available-grouping";

function row(partial: Partial<SockAvailableRowLike> & Pick<SockAvailableRowLike, "id" | "seatNumber">): SockAvailableRowLike {
  return {
    amount: "50000.0000",
    areaName: "Area A",
    categoryName: "Cat 1",
    blockName: "Block 101",
    row: "10",
    seatId: `seat-${partial.id}`,
    resaleMovementId: `mv-${partial.id}`,
    categoryId: "cat-1",
    areaId: "area-1",
    blockId: "block-101",
    contingentId: "cont-1",
    kind: "RESALE",
    ...partial,
  };
}

function testQuantityMapping() {
  const togetherCases: Array<[number, number]> = [
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 4],
    [10, 4],
    [1, 1],
    [2, 2],
    [3, 3],
    [8, 8],
    [9, 9],
  ];
  for (const [input, expected] of togetherCases) {
    assert.equal(
      mapAggregatedSeatOfferQuantity(input, "together"),
      expected,
      `together ${input} → ${expected}`,
    );
  }

  const singleCases: Array<[number, number]> = [
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 2],
    [1, 1],
    [2, 2],
    [3, 3],
    [8, 8],
    [9, 9],
  ];
  for (const [input, expected] of singleCases) {
    assert.equal(
      mapAggregatedSeatOfferQuantity(input, "single"),
      expected,
      `single ${input} → ${expected}`,
    );
  }
}

function testSummarySevenTogether() {
  const rows = Array.from({ length: 7 }, (_, i) =>
    row({ id: i + 1, seatNumber: String(10 + i), amount: "70000.0000" }),
  );
  const { offers, summary } = transformSeatOffersFromSockRows(rows);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.offerType, "together");
  assert.equal(offers[0]!.originalCount, 7);
  assert.equal(offers[0]!.transformedCount, 4);
  assert.equal(offers[0]!.seats.length, 4);

  assert.equal(summary.totals.sourceRows, 7);
  assert.equal(summary.totals.groups, 1);
  assert.equal(summary.totals.bucketsProcessed, 1);
  assert.equal(summary.totals.offersReturned, 1);
  assert.equal(summary.grandTotals.seatsFound, 7);
  assert.equal(summary.grandTotals.seatsSent, 4);
  assert.equal(summary.grandTotals.seatReduction, 3);
  assert.equal(summary.byOfferType.together.offersCountChanged, 1);
  assert.equal(summary.byOfferType.together.offersCountUnchanged, 0);

  const t = summary.transformations[0]!;
  assert.equal(t.seatsFound, 7);
  assert.equal(t.seatsSent, 4);
  assert.equal(t.mappedCount, 4);
  assert.equal(t.wasTransformed, true);
  assert.equal(t.seatReduction, 3);
  assert.equal(t.skipped, false);
}

function testTogetherMappedCounts() {
  for (const [n, expected] of [
    [4, 1],
    [5, 2],
    [6, 2],
  ] as const) {
    const rows = Array.from({ length: n }, (_, i) =>
      row({ id: i + 1, seatNumber: String(20 + i), amount: "71000.0000" }),
    );
    const { offers } = transformSeatOffersFromSockRows(rows);
    assert.equal(offers.length, 1, `together n=${n}`);
    assert.equal(offers[0]!.offerType, "together");
    assert.equal(offers[0]!.originalCount, n);
    assert.equal(offers[0]!.transformedCount, expected);
  }
}

function testSevenSinglesSamePriceBecomeTwo() {
  const rows = Array.from({ length: 7 }, (_, i) =>
    row({
      id: i + 1,
      seatNumber: String(100 + i * 2),
      row: String(20 + i),
      amount: "55000.0000",
    }),
  );
  const { offers, summary } = transformSeatOffersFromSockRows(rows);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.offerType, "single");
  assert.equal(offers[0]!.originalCount, 7);
  assert.equal(offers[0]!.transformedCount, 2);
  assert.equal(summary.byOfferType.single.seatsSentTotal, 2);
  assert.equal(summary.byOfferType.single.originalSeatCountTotal, 7);
  assert.equal(summary.byOfferType.together.bucketsFound, 0);
}

function testSingleMappedCounts() {
  for (const [n, expected] of [
    [4, 1],
    [5, 2],
    [6, 2],
  ] as const) {
    const rows = Array.from({ length: n }, (_, i) =>
      row({
        id: i + 1,
        seatNumber: String(300 + i * 3),
        row: String(40 + i),
        amount: "66000.0000",
      }),
    );
    const { offers } = transformSeatOffersFromSockRows(rows);
    assert.equal(offers.length, 1, `single n=${n}`);
    assert.equal(offers[0]!.offerType, "single");
    assert.equal(offers[0]!.originalCount, n);
    assert.equal(offers[0]!.transformedCount, expected);
  }
}

function testFourConsecutiveIsTogether() {
  const rows = Array.from({ length: 4 }, (_, i) =>
    row({ id: i + 1, seatNumber: String(5 + i), amount: "60000.0000" }),
  );
  const { offers } = transformSeatOffersFromSockRows(rows);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.offerType, "together");
  assert.equal(offers[0]!.originalCount, 4);
  assert.equal(offers[0]!.transformedCount, 1, "4 together → 1");
}

function testSamePriceDifferentBlocksStaySeparate() {
  const price = "72000.0000";
  const sevenTogether = (blockId: string, blockName: string, idBase: number) =>
    Array.from({ length: 7 }, (_, i) =>
      row({
        id: idBase + i,
        seatNumber: String(10 + i),
        amount: price,
        blockId,
        blockName,
      }),
    );
  const fourSingles = (blockId: string, blockName: string, idBase: number) =>
    Array.from({ length: 4 }, (_, i) =>
      row({
        id: idBase + i,
        seatNumber: String(200 + i * 5),
        row: String(30 + i),
        amount: price,
        blockId,
        blockName,
      }),
    );

  const { offers } = transformSeatOffersFromSockRows([
    ...sevenTogether("block-a", "Block A", 1),
    ...sevenTogether("block-b", "Block B", 20),
    ...fourSingles("block-c", "Block C", 40),
    ...fourSingles("block-d", "Block D", 50),
  ]);

  const together = offers.filter((o) => o.offerType === "together" && o.originalCount === 7);
  assert.equal(together.length, 2, "each block with 7 together gets its own offer");
  assert.ok(together.every((o) => o.transformedCount === 4));

  const singles = offers.filter((o) => o.offerType === "single" && o.originalCount === 4);
  assert.equal(singles.length, 2, "each block with 4 singles gets its own offer");
  assert.ok(singles.every((o) => o.transformedCount === 1));
}

function testFourSinglesSamePriceBecomeOne() {
  const rows = Array.from({ length: 4 }, (_, i) =>
    row({
      id: i + 1,
      seatNumber: String(200 + i),
      row: String(30 + i),
      amount: "65000.0000",
    }),
  );
  const { offers } = transformSeatOffersFromSockRows(rows);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.offerType, "single");
  assert.equal(offers[0]!.originalCount, 4);
  assert.equal(offers[0]!.transformedCount, 1);
}

function testMarkupPercentOnOffers() {
  const rows = Array.from({ length: 4 }, (_, i) =>
    row({ id: i + 1, seatNumber: String(5 + i), amount: "60000.0000" }),
  );
  const base = transformSeatOffersFromSockRows(rows);
  assert.equal(base.offers[0]!.priceUsd, 60);

  const marked = applyMarkupPercentToTransformResult(base, 50);
  assert.equal(marked.offers[0]!.priceUsd, 90);
  assert.equal(marked.offers[0]!.priceRaw, "90000");
  assert.equal(marked.summary.transformations[0]!.priceUsd, 90);
}

function main() {
  testQuantityMapping();
  testMarkupPercentOnOffers();
  testSummarySevenTogether();
  testTogetherMappedCounts();
  testSevenSinglesSamePriceBecomeTwo();
  testSingleMappedCounts();
  testFourConsecutiveIsTogether();
  testSamePriceDifferentBlocksStaySeparate();
  testFourSinglesSamePriceBecomeOne();
  console.log("seat-offers-transform: all tests passed");
}

main();
