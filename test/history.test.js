"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { offerRecord, tradeRecord } = require("../lib/protocol");
const {
  createHistory,
  ingestOfficialMessages,
  ingestParticipantMessages,
  statusForTrade,
} = require("../lib/history");

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buffer) {
  let number = BigInt(`0x${Buffer.from(buffer).toString("hex")}`);
  let output = "";
  while (number > 0n) {
    output = BASE58[Number(number % 58n)] + output;
    number /= 58n;
  }
  for (const byte of buffer) { if (byte !== 0) break; output = `1${output}`; }
  return output || "1";
}

function identity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const did = `did:key:z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
  return {
    did,
    sign: (payload) => crypto.sign(null, Buffer.from(payload), privateKey).toString("base64url"),
  };
}

function signedMessage(room, signer, record, seq, ts) {
  const text = JSON.stringify(record);
  const nonce = String(1_790_000_000_000 + seq);
  return { seq, ts, from: signer.did, text, nonce, sig: signer.sign(`${room}|${nonce}|${text}`) };
}

test("retained seed remains verifiable after it leaves the 200-message tail", () => {
  const history = createHistory();
  const seed = {
    seq: 1,
    ts: "2026-09-25T12:05:22.575364Z",
    from: "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte",
    text: "{\"for\":1,\"limits\":[\"214.84\",\"237.44\"],\"package\":\"bae09812e25eb6f1369c611f24964f7ea0acafddfc45301a16f33f941296dafa\",\"price\":\"226.14\",\"rooms\":[\"d-close1-flow\",\"d-close1-state\",\"d-close1-price\",\"d-close1-positions\",\"d-close1-pnl\"],\"season\":\"close-1\",\"t\":\"seed\",\"trade\":{\"tid\":626256716983248,\"time\":\"2026-09-25T11:59:42.666000Z\"}}",
    nonce: 1790337922535,
    sig: "j3_asvvwrt67C13PdoA2Q1p0QfO24av1hvkC_2Nc5FJet9dKey97CFuKv1ZW9G7Ki4hxw86K-2dfhIjAjhlsCw",
  };

  ingestOfficialMessages(history, "d-close1-price", [seed]);
  assert.equal(history.seed?.record?.package, "bae09812e25eb6f1369c611f24964f7ea0acafddfc45301a16f33f941296dafa");
});

test("retained offers and accepted trades remain indexed for both parties", () => {
  const history = createHistory();
  const maker = identity();
  const taker = identity();
  const terms = { id: "history-call", maker: maker.did, px: "226.14", qty: "1", side: "buy", taker: "any", until: 50 };
  const makerSig = maker.sign(`close-1|terms|${JSON.stringify(terms)}`);
  const offer = offerRecord(terms, makerSig);
  const takerSig = taker.sign(`close-1|accept|${JSON.stringify(terms)}|${taker.did}`);
  const trade = tradeRecord(terms, taker.did, makerSig, takerSig);

  ingestParticipantMessages(history, "close1", [
    signedMessage("close1", maker, offer, 10, "2026-09-25T12:10:00.000Z"),
    signedMessage("close1", taker, trade, 11, "2026-09-25T12:11:00.000Z"),
  ]);

  assert.equal(history.offers.get(terms.id)?.record.terms.maker, maker.did);
  assert.equal(history.trades.get(terms.id)?.record.taker, taker.did);
  history.flow.settled.add(terms.id);
  assert.deepEqual(statusForTrade(history, history.trades.get(terms.id)), { status: "settled", reason: "", settledSweep: null });
});

test("maker-signed offers from another tool are normalized and indexed", () => {
  const history = createHistory();
  const maker = identity();
  const relay = identity();
  const terms = { id: "foreign-call", maker: maker.did, px: "226.14", qty: "1", side: "sell", taker: "any", until: 50 };
  const record = {
    t: "trade-offer",
    season: "close-1",
    terms,
    maker_sig: maker.sign(`close-1|terms|${JSON.stringify(terms)}`),
  };

  ingestParticipantMessages(history, "close1", [
    signedMessage("close1", relay, record, 12, "2026-09-25T12:12:00.000Z"),
  ]);

  const indexed = history.offers.get(terms.id);
  assert.equal(indexed?.record?.t, "close-call.offer.v1");
  assert.equal(indexed?.record?.source_type, "trade-offer");
  assert.equal(indexed?.room, "close1");
  assert.equal(indexed?.from, relay.did);
});

test("omitted referee results are not presented as definitely pending", () => {
  const history = createHistory();
  history.flow.omittedSettled = 1;
  history.flow.latestTs = "2026-09-25T12:20:00.000Z";
  const trade = {
    ts: "2026-09-25T12:10:00.000Z",
    record: { terms: { id: "omitted-call" } },
  };
  assert.deepEqual(statusForTrade(history, trade), {
    status: "unreported",
    reason: "public_summary_omitted",
  });
});
