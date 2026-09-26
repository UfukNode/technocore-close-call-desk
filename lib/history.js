"use strict";

const { CONTEST, DID_RE, ROOMS, parseRecord } = require("./protocol");
const { normalizeOffer, verifyOffer, verifyOuter, verifyTrade } = require("./verify");

function createHistory() {
  return {
    seed: null,
    final: null,
    prices: new Map(),
    registrations: new Map(),
    offers: new Map(),
    trades: new Map(),
    flow: {
      settled: new Set(),
      settlements: new Map(),
      voided: new Map(),
      minted: new Set(),
      registeredRooms: new Set([ROOMS.trading]),
      registeredAt: new Map([[ROOMS.trading, 0]]),
      seenSweeps: new Set(),
      omittedMints: 0,
      omittedSettled: 0,
      omittedVoid: 0,
      latestTs: "",
    },
  };
}

function publicMessage(message) {
  return { seq: message.seq, ts: message.ts, from: message.from, text: message.text };
}

function messageOrder(left, right) {
  const leftTime = Date.parse(left.ts || "") || 0;
  const rightTime = Date.parse(right.ts || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  const roomOrder = String(left.room || "").localeCompare(String(right.room || ""));
  if (roomOrder) return roomOrder;
  return Number(left.seq || 0) - Number(right.seq || 0);
}

function rememberFirst(map, key, value) {
  const current = map.get(key);
  if (!current || messageOrder(value, current) < 0) map.set(key, value);
}

function roomWasRegistered(history, room, message) {
  if (room === ROOMS.trading) return true;
  const registeredAt = history.flow.registeredAt.get(room);
  if (registeredAt === undefined) return false;
  const messageTime = Date.parse(message.ts || "");
  return !Number.isFinite(messageTime) || messageTime >= registeredAt;
}

function ingestParticipantMessages(history, room, messages) {
  for (const message of messages || []) {
    const record = parseRecord(message.text);
    if (!record || !verifyOuter(room, message)) continue;
    const entry = { ...publicMessage(message), room, record };

    if (
      record.t === "owner"
      && record.season === CONTEST.id
      && record.key === message.from
      && roomWasRegistered(history, room, message)
    ) {
      rememberFirst(history.registrations, message.from, {
        did: message.from,
        seq: message.seq,
        ts: message.ts,
        room,
      });
    } else if (record.t === "trade" && verifyTrade(message, record) && roomWasRegistered(history, room, message)) {
      rememberFirst(history.trades, record.terms.id, entry);
    } else if (verifyOffer(message, record)) {
      const offer = normalizeOffer(record);
      history.offers.set(offer.terms.id, { ...entry, record: offer });
    }
  }
}

function roomName(item) {
  if (Array.isArray(item)) return item[0];
  if (item && typeof item === "object") return item.room || item.name;
  return item;
}

function addFlowRecord(history, message, record) {
  const sweep = Number(record.n ?? record.for);
  const sweepKey = Number.isSafeInteger(sweep) ? sweep : `seq:${message.seq}`;
  if (history.flow.seenSweeps.has(sweepKey)) return;
  history.flow.seenSweeps.add(sweepKey);

  const settledItems = Array.isArray(record.settled) ? record.settled : [];
  const voidItems = Array.isArray(record.void) ? record.void : [];
  const mintItems = Array.isArray(record.mints) ? record.mints : [];
  const roomItems = Array.isArray(record.rooms) ? record.rooms : [];
  for (const item of settledItems) {
    const id = String(Array.isArray(item) ? item[0] : item && typeof item === "object" ? item.id : item);
    history.flow.settled.add(id);
    if (!history.flow.settlements.has(id)) {
      history.flow.settlements.set(id, { id, sweep, ts: message.ts, details: item });
    }
  }
  for (const item of voidItems) {
    if (Array.isArray(item)) history.flow.voided.set(String(item[0]), String(item[1] || "void"));
    else if (item && typeof item === "object") history.flow.voided.set(String(item.id), String(item.reason || "void"));
    else history.flow.voided.set(String(item), "void");
  }
  for (const did of mintItems) {
    if (DID_RE.test(String(did))) history.flow.minted.add(String(did));
  }
  for (const item of roomItems) {
    const room = roomName(item);
    if (typeof room !== "string") continue;
    history.flow.registeredRooms.add(room);
    const stamp = Date.parse(message.ts || "");
    if (!history.flow.registeredAt.has(room)) {
      history.flow.registeredAt.set(room, Number.isFinite(stamp) ? stamp : 0);
    }
  }

  history.flow.omittedMints += Number(record.omitted?.mints || 0);
  history.flow.omittedSettled += Number(record.omitted?.settled || 0);
  history.flow.omittedVoid += Number(record.omitted?.void || 0);
  if ((Date.parse(message.ts || "") || 0) >= (Date.parse(history.flow.latestTs || "") || 0)) {
    history.flow.latestTs = message.ts || history.flow.latestTs;
  }
}

function ingestOfficialMessages(history, room, messages) {
  const verified = [];
  for (const message of messages || []) {
    if (message.from !== CONTEST.refereeDid || !verifyOuter(room, message)) continue;
    const record = parseRecord(message.text);
    if (!record) continue;
    const entry = { ...publicMessage(message), record };
    verified.push(entry);
    if (room === ROOMS.price && record.t === "seed" && record.season === CONTEST.id) {
      history.seed = entry;
    }
    if (room === ROOMS.price && record.t === "price") {
      // Live price posts use `for` for the next sweep; their ref is the close of `for - 1`.
      const sweep = Number(record.n ?? (Number(record.for) - 1));
      if (Number.isSafeInteger(sweep)) history.prices.set(sweep, entry);
    }
    if (room === ROOMS.price && record.t === "final" && record.season === CONTEST.id) {
      history.final = entry;
    }
    if (room === ROOMS.flow && record.t === "flow") addFlowRecord(history, message, record);
  }
  return verified;
}

function statusForTrade(history, trade) {
  const id = trade.record.terms.id;
  if (history.flow.settled.has(id)) {
    const settlement = history.flow.settlements.get(id);
    return { status: "settled", reason: "", settledSweep: settlement?.sweep || null };
  }
  if (history.flow.voided.has(id)) return { status: "void", reason: history.flow.voided.get(id) || "void" };

  const tradeTime = Date.parse(trade.ts || "");
  const flowTime = Date.parse(history.flow.latestTs || "");
  const omitted = history.flow.omittedSettled + history.flow.omittedVoid;
  if (omitted > 0 && Number.isFinite(tradeTime) && Number.isFinite(flowTime) && flowTime - tradeTime >= 6 * 60_000) {
    return { status: "unreported", reason: "public_summary_omitted" };
  }
  return { status: "pending", reason: "" };
}

function sortedValues(map, newestFirst = false) {
  const values = [...map.values()].sort(messageOrder);
  return newestFirst ? values.reverse() : values;
}

module.exports = {
  createHistory,
  ingestOfficialMessages,
  ingestParticipantMessages,
  messageOrder,
  publicMessage,
  sortedValues,
  statusForTrade,
};
