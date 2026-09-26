"use strict";

const crypto = require("node:crypto");
const {
  CONTEST,
  DID_RE,
  SIG_RE,
  compactTerms,
  makeTerms,
  makerPayload,
  requireSignature,
  takerPayload,
} = require("./protocol");

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(value) {
  let number = 0n;
  for (const character of value) {
    const index = BASE58.indexOf(character);
    if (index < 0) throw new Error("Invalid base58 value.");
    number = number * 58n + BigInt(index);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 255n));
    number >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

function publicKeyFromDid(did) {
  if (!DID_RE.test(String(did))) throw new Error("Invalid Ed25519 did:key.");
  const decoded = base58Decode(String(did).slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("Unsupported did:key multicodec.");
  }
  return crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: decoded.subarray(2).toString("base64url") },
    format: "jwk",
  });
}

function verifySignature(did, payload, signature) {
  try {
    if (!SIG_RE.test(String(signature))) return false;
    return crypto.verify(null, Buffer.from(String(payload), "utf8"), publicKeyFromDid(did), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

function verifyOuter(room, message) {
  if (!message || !DID_RE.test(String(message.from)) || !SIG_RE.test(String(message.sig))) return false;
  const nonce = String(message.nonce);
  if (!/^[0-9]{1,19}$/.test(nonce)) return false;
  return verifySignature(message.from, `${room}|${nonce}|${message.text}`, message.sig);
}

function normalizeOffer(record) {
  try {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    const kind = String(record.t || record.type || "");
    const season = String(record.season || record.contest || record.contest_id || "");
    const offerLike = kind === "trade" || kind.toLowerCase().includes("offer");
    if (!offerLike || season !== CONTEST.id) return null;

    // A completed trade is not an open offer, even though it still contains a maker signature.
    if (record.taker_sig || record.takerSig || (kind === "trade" && DID_RE.test(String(record.taker || "")))) return null;
    const sourceTerms = record.terms || record.offer?.terms || record.offer || record;
    const terms = makeTerms(sourceTerms);
    const makerSig = requireSignature(record.maker_sig || record.makerSig || record.offer?.maker_sig, "Maker signature");
    return {
      t: "close-call.offer.v1",
      season: CONTEST.id,
      terms,
      maker_sig: makerSig,
      source_type: kind,
    };
  } catch {
    return null;
  }
}

function verifyOffer(message, record) {
  const offer = normalizeOffer(record);
  if (!offer) return false;
  return verifySignature(offer.terms.maker, makerPayload(offer.terms), offer.maker_sig);
}

function verifyTrade(message, record) {
  try {
    if (record?.t !== "trade" || record.season !== "close-1") return false;
    const termsText = compactTerms(record.terms);
    if (record.terms.taker !== "any" && record.terms.taker !== record.taker) return false;
    if (record.terms.maker === record.taker) return false;
    if (message.from !== record.terms.maker && message.from !== record.taker) return false;
    return verifySignature(record.terms.maker, `close-1|terms|${termsText}`, record.maker_sig)
      && verifySignature(record.taker, takerPayload(record.terms, record.taker), record.taker_sig);
  } catch {
    return false;
  }
}

module.exports = {
  base58Decode,
  normalizeOffer,
  publicKeyFromDid,
  verifyOffer,
  verifyOuter,
  verifySignature,
  verifyTrade,
};
