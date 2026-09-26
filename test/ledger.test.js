"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHistory } = require("../lib/history");
const { buildIdentityLedger, sideFees } = require("../lib/ledger");

const maker = "did:key:z6Mkw9xhXy3UAWn2jicSN3zGcjZMBpVjdTdq53DTgSa9FZL4";
const taker = "did:key:z6MkevNrxH1t5ZwJ6nTwEPsSEH4ath6Si5WRFrafM8AynvBq";

function snapshot(mark = "120.00") {
  return {
    market: {
      pnl: { mark, top: [] },
      positions: { top: [] },
      price: { global: mark },
    },
  };
}

function settledTrade(did) {
  return {
    room: "close1",
    seq: 10,
    ts: "2026-09-25T12:06:00.000Z",
    status: "settled",
    reason: "",
    record: {
      t: "trade",
      season: "close-1",
      terms: { id: "score-call", maker, px: "100.00", qty: "1", side: "buy", taker: "any", until: 10 },
      taker,
    },
    did,
  };
}

test("clawback fees and live score impact match the official fold", () => {
  const history = createHistory();
  history.flow.settled.add("score-call");
  history.flow.settlements.set("score-call", { id: "score-call", sweep: 2, details: "score-call" });
  history.prices.set(2, { record: { t: "price", for: 3, ref: { px: "110.00" } } });

  assert.deepEqual(sideFees(1, 1, 100, 110), [10, 1]);
  const makerLedger = buildIdentityLedger(history, maker, snapshot(), [settledTrade(maker)]);
  const takerLedger = buildIdentityLedger(history, taker, snapshot(), [settledTrade(taker)]);

  assert.equal(makerLedger.available, 9890);
  assert.equal(makerLedger.collateral, 100);
  assert.equal(makerLedger.trackedPosition, 1);
  assert.equal(makerLedger.trackedScore, 10);
  assert.equal(makerLedger.metrics.get("score-call").scoreDelta, 10);

  assert.equal(takerLedger.available, 9899);
  assert.equal(takerLedger.trackedPosition, -1);
  assert.equal(takerLedger.trackedScore, -21);
  assert.equal(takerLedger.metrics.get("score-call").scoreDelta, -21);
});

test("official top values override retained-history score and position", () => {
  const history = createHistory();
  const official = snapshot();
  official.market.pnl.top = [[maker, "42.50"]];
  official.market.positions.top = [[maker, "3.00"]];
  const ledger = buildIdentityLedger(history, maker, official, []);
  assert.equal(ledger.score, "42.50");
  assert.equal(ledger.position, "3.00");
  assert.equal(ledger.scoreSource, "official_top");
});

test("final price freezes the displayed trade result", () => {
  const history = createHistory();
  history.flow.settled.add("score-call");
  history.flow.settlements.set("score-call", { id: "score-call", sweep: 2, details: "score-call" });
  history.prices.set(2, { record: { t: "price", n: 2, ref: { px: "110.00" } } });
  const finalSnapshot = snapshot("120.00");
  finalSnapshot.market.final = { t: "final", season: "close-1", price: "130.00" };

  const ledger = buildIdentityLedger(history, maker, finalSnapshot, [settledTrade(maker)]);
  assert.equal(ledger.mark, 130);
  assert.equal(ledger.final, true);
  assert.equal(ledger.metrics.get("score-call").final, true);
  assert.equal(ledger.metrics.get("score-call").scoreDelta, 20);
});
