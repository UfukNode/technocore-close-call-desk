"use strict";

const CONTEST = Object.freeze({
  id: "close-1",
  rulesVersion: "0.1-draft",
  market: "xyz:NVDA",
  opening: "2026-09-25T12:00:00Z",
  lock: "2026-10-04T09:00:00Z",
  finalPriceTime: "2026-10-04T10:00:00Z",
  mint: "10000",
  minQty: "0.1",
  limitWindow: "0.05",
  feeRate: "0.01",
  lockSweep: 2556,
  prizePool: 1000000,
  prizePlaces: 3,
  room: "close1",
  refereeDid: "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte",
  manifestSha256: "bae09812e25eb6f1369c611f24964f7ea0acafddfc45301a16f33f941296dafa",
});

const ROOMS = Object.freeze({
  trading: "close1",
  offers: "close1-offers",
  flow: "d-close1-flow",
  state: "d-close1-state",
  price: "d-close1-price",
  positions: "d-close1-positions",
  pnl: "d-close1-pnl",
});

const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DECIMAL_RE = /^[0-9]{1,7}(?:\.[0-9]{1,2})?$/;

function requireDid(value, label = "DID") {
  const did = String(value || "").trim();
  if (!DID_RE.test(did)) throw new Error(`${label} must be an Ed25519 did:key.`);
  return did;
}

function requireSignature(value, label = "Signature") {
  const signature = String(value || "").trim();
  if (!SIG_RE.test(signature)) throw new Error(`${label} is not a valid Ed25519 signature.`);
  return signature;
}

function decimal(value, label, minimum = 0) {
  const text = String(value ?? "").trim();
  if (!DECIMAL_RE.test(text) || Number(text) <= 0 || Number(text) < minimum) {
    throw new Error(`${label} must be a positive decimal with at most two places.`);
  }
  return text;
}

function tradeId(value) {
  const id = String(value || "").trim();
  if (!ID_RE.test(id)) throw new Error("Trade ID must use 1-64 letters, numbers, hyphens, or underscores.");
  return id;
}

function sweepNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > CONTEST.lockSweep) {
    throw new Error(`Expiry sweep must be between 1 and ${CONTEST.lockSweep}.`);
  }
  return number;
}

function makeTerms(input) {
  const taker = String(input.taker || "any").trim();
  return {
    id: tradeId(input.id),
    maker: requireDid(input.maker, "Maker DID"),
    px: decimal(input.px, "Price"),
    qty: decimal(input.qty, "Quantity", Number(CONTEST.minQty)),
    side: input.side === "buy" || input.side === "sell" ? input.side : (() => { throw new Error("Side must be buy or sell."); })(),
    taker: taker === "any" ? "any" : requireDid(taker, "Taker DID"),
    until: sweepNumber(input.until),
  };
}

function compactTerms(input) {
  return JSON.stringify(makeTerms(input));
}

function makerPayload(input) {
  const terms = compactTerms(input);
  return `${CONTEST.id}|terms|${terms}`;
}

function takerPayload(input, takerDid) {
  const terms = compactTerms(input);
  return `${CONTEST.id}|accept|${terms}|${requireDid(takerDid, "Taker DID")}`;
}

function ownerRecord(did) {
  const key = requireDid(did);
  return { t: "owner", season: CONTEST.id, key };
}

function offerRecord(input, makerSig) {
  return {
    t: "close-call.offer.v1",
    season: CONTEST.id,
    terms: makeTerms(input),
    maker_sig: requireSignature(makerSig, "Maker signature"),
  };
}

function tradeRecord(input, takerDid, makerSig, takerSig) {
  const terms = makeTerms(input);
  const taker = requireDid(takerDid, "Taker DID");
  if (terms.taker !== "any" && terms.taker !== taker) throw new Error("This offer is reserved for another DID.");
  if (terms.maker === taker) throw new Error("Taking your own offer only pays both fees and creates no position.");
  return {
    t: "trade",
    season: CONTEST.id,
    terms,
    taker,
    maker_sig: requireSignature(makerSig, "Maker signature"),
    taker_sig: requireSignature(takerSig, "Taker signature"),
  };
}

function compact(record) {
  return JSON.stringify(record);
}

function parseRecord(text) {
  try {
    const value = JSON.parse(String(text));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function isWithinLimits(px, limits) {
  if (!Array.isArray(limits) || limits.length !== 2) return false;
  const value = Number(px);
  return Number.isFinite(value) && value >= Number(limits[0]) && value <= Number(limits[1]);
}

function oppositeSide(side) {
  return side === "buy" ? "sell" : "buy";
}

module.exports = {
  CONTEST,
  ROOMS,
  DID_RE,
  SIG_RE,
  compact,
  compactTerms,
  isWithinLimits,
  makeTerms,
  makerPayload,
  offerRecord,
  oppositeSide,
  ownerRecord,
  parseRecord,
  requireDid,
  requireSignature,
  takerPayload,
  tradeRecord,
};
