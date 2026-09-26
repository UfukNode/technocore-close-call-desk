"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  compactTerms,
  isWithinLimits,
  makerPayload,
  offerRecord,
  ownerRecord,
  takerPayload,
  tradeRecord,
} = require("../lib/protocol");
const { normalizeOffer, verifyOffer, verifySignature, verifyTrade } = require("../lib/verify");

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

function termsFor(maker, taker = "any") {
  return { id: "call_42", maker, px: "226.14", qty: "1.25", side: "buy", taker, until: 12 };
}

test("canonical terms use the exact documented key order", () => {
  const maker = identity();
  assert.equal(
    compactTerms(termsFor(maker.did)),
    `{"id":"call_42","maker":"${maker.did}","px":"226.14","qty":"1.25","side":"buy","taker":"any","until":12}`,
  );
});

test("owner records name the signing DID", () => {
  const owner = identity();
  assert.deepEqual(ownerRecord(owner.did), { t: "owner", season: "close-1", key: owner.did });
});

test("maker offer and taker acceptance signatures verify", () => {
  const maker = identity();
  const taker = identity();
  const terms = termsFor(maker.did);
  const makerSig = maker.sign(makerPayload(terms));
  const offer = offerRecord(terms, makerSig);
  assert.equal(verifyOffer({ from: maker.did }, offer), true);

  const takerSig = taker.sign(takerPayload(terms, taker.did));
  const trade = tradeRecord(terms, taker.did, makerSig, takerSig);
  assert.equal(verifyTrade({ from: taker.did }, trade), true);
  assert.equal(verifySignature(maker.did, makerPayload(terms), makerSig), true);
});

test("a relay may publish a valid maker-signed offer", () => {
  const maker = identity();
  const relay = identity();
  const terms = termsFor(maker.did);
  const offer = offerRecord(terms, maker.sign(makerPayload(terms)));
  assert.equal(verifyOffer({ from: relay.did }, offer), true);
});

test("one-sided trade-shaped offers with an any taker are normalized", () => {
  const maker = identity();
  const terms = termsFor(maker.did);
  const record = {
    t: "trade",
    season: "close-1",
    terms,
    taker: "any",
    maker_sig: maker.sign(makerPayload(terms)),
  };
  assert.equal(normalizeOffer(record)?.terms.id, terms.id);
});

test("tampering with price invalidates the maker signature", () => {
  const maker = identity();
  const terms = termsFor(maker.did);
  const offer = offerRecord(terms, maker.sign(makerPayload(terms)));
  offer.terms.px = "200.00";
  assert.equal(verifyOffer({ from: maker.did }, offer), false);
});

test("completed trades are never normalized as open offers", () => {
  const maker = identity();
  const taker = identity();
  const terms = termsFor(maker.did);
  const makerSig = maker.sign(makerPayload(terms));
  const takerSig = taker.sign(takerPayload(terms, taker.did));
  assert.equal(normalizeOffer(tradeRecord(terms, taker.did, makerSig, takerSig)), null);
});

test("self acceptance is blocked", () => {
  const maker = identity();
  const terms = termsFor(maker.did);
  const makerSig = maker.sign(makerPayload(terms));
  const takerSig = maker.sign(takerPayload(terms, maker.did));
  assert.throws(() => tradeRecord(terms, maker.did, makerSig, takerSig), /own offer/i);
});

test("limit helper is inclusive", () => {
  assert.equal(isWithinLimits("95.00", ["95.00", "105.00"]), true);
  assert.equal(isWithinLimits("105.00", ["95.00", "105.00"]), true);
  assert.equal(isWithinLimits("105.01", ["95.00", "105.00"]), false);
});
