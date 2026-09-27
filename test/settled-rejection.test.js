"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const root = process.env.DESK_ROOT ? path.resolve(process.env.DESK_ROOT) : path.resolve(__dirname, "..");
const { createHistory, statusForTrade } = require(path.join(root, "lib/history"));
const { buildIdentityLedger } = require(path.join(root, "lib/ledger"));

function trade() {
  // Synthetic metadata only. This is not a signed/publication/settlement proof.
  return { ts: "2026-09-25T12:10:00Z", record: {
    t: "trade", season: "close-1", taker: "synthetic-taker",
    terms: { id: "already-used", maker: "synthetic-maker", side: "buy", px: "100", qty: "1", until: 30 }
  }};
}
test("a settled rejection without the accepted copy remains unresolved", () => {
  const h = createHistory();
  h.flow.voided.set("already-used", "settled");
  assert.deepEqual(statusForTrade(h, trade()), {
    status: "unreported", reason: "prior_settlement_unresolved"
  });
});
test("unresolved settled rejection marks the retained ledger incomplete", () => {
  const h = createHistory();
  h.flow.voided.set("already-used", "settled");
  const row = trade();
  const status = statusForTrade(h, row);
  const ledger = buildIdentityLedger(h, "synthetic-maker",
    { market: { pnl: { mark: "110", top: [] }, positions: { top: [] } } },
    [{ ...row, ...status }]);
  assert.equal(ledger.incomplete, true);
  assert.equal(ledger.metrics.size, 0, "no fee or PnL is invented for the unidentified accepted copy");
});
test("positive settlement evidence retains its existing precedence", () => {
  const h = createHistory();
  h.flow.voided.set("already-used", "settled");
  h.flow.settled.add("already-used");
  h.flow.settlements.set("already-used", { sweep: 8 });
  assert.deepEqual(statusForTrade(h, trade()), {
    status: "settled", reason: "", settledSweep: 8
  });
});
test("ordinary funds rejection retains its existing behavior", () => {
  const h = createHistory();
  h.flow.voided.set("already-used", "funds");
  assert.deepEqual(statusForTrade(h, trade()), { status: "void", reason: "funds" });
});
test("ordinary pending trade retains its existing behavior", () => {
  assert.deepEqual(statusForTrade(createHistory(), trade()), { status: "pending", reason: "" });
});

function renderResult(row) {
  const source = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  const start = source.indexOf("function tradeResult(trade) {");
  const end = source.indexOf("\nfunction renderDesk()", start);
  assert.ok(start >= 0 && end > start);
  // Execute the actual pure renderer with translation keys as visible labels.
  // No page, signing key, remote request or application startup is involved.
  return vm.runInNewContext(source.slice(start, end) + "\ntradeResult(row)",
    { row, t: (key, values) => key + (values ? JSON.stringify(values) : "") });
}
test("uncertain duplicate UI does not claim zero score or zero omitted results", () => {
  const html = renderResult({ status: "unreported", reason: "prior_settlement_unresolved" });
  assert.match(html, /priorSettlementUnresolved/);
  assert.doesNotMatch(html, /scoreZero|omittedCounts/);
});
test("omitted-summary UI retains its real counts and review sweeps", () => {
  const html = renderResult({ status: "unreported", reason: "public_summary_omitted",
    reviewSweeps: [8, 9], omittedSettled: 12, omittedVoid: 3 });
  assert.match(html, /unreportedHelp/);
  assert.match(html, /"settled":12,"voided":3/);
  assert.match(html, /#8/);
});
