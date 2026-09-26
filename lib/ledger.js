"use strict";

const { CONTEST } = require("./protocol");
const { messageOrder } = require("./history");

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicValue(list, did) {
  const match = (list || []).find((item) => Array.isArray(item) && item[0] === did);
  return match ? match[1] : null;
}

function priceValue(record) {
  return number(record?.ref?.px ?? record?.close ?? record?.price ?? record?.px);
}

function currentMark(snapshot) {
  return number(
    snapshot?.market?.final?.price
      ?? snapshot?.market?.final?.px
      ?? snapshot?.market?.final?.S
      ?? snapshot?.market?.pnl?.mark
      ?? snapshot?.market?.price?.global
      ?? snapshot?.market?.price?.ref?.px
      ?? snapshot?.market?.price?.price,
  );
}

function settlementPrice(history, settlement) {
  if (!settlement) return null;
  const details = settlement.details;
  const direct = number(details?.close ?? details?.ref?.px ?? (Array.isArray(details) ? details[3] : null));
  if (direct !== null) return direct;
  return priceValue(history.prices.get(settlement.sweep)?.record);
}

function sideFees(side, qty, px, close) {
  const base = Number(CONTEST.feeRate) * qty * px;
  const gap = (close - px) * qty;
  const buyer = Math.max(base, gap);
  const seller = Math.max(base, -gap);
  return side > 0 ? [buyer, seller] : [seller, buyer];
}

function feeFromDetails(details, role) {
  if (!details || typeof details !== "object") return null;
  if (Array.isArray(details)) return number(details[role === "maker" ? 1 : 2]);
  return number(role === "maker" ? details.maker_fee : details.taker_fee);
}

function apply(account, side, qty, px, fee) {
  account.cash -= fee;
  account.fees += fee;
  let left = qty;
  while (left > 1e-12 && account.lots.length && account.lots[0][0] * side < 0) {
    const [lotQty, lotPx] = account.lots[0];
    const size = Math.min(left, Math.abs(lotQty));
    account.cash += side < 0 ? size * px : size * (2 * lotPx - px);
    left -= size;
    if (Math.abs(size - Math.abs(lotQty)) < 1e-12) account.lots.shift();
    else account.lots[0][0] = lotQty + side * size;
  }
  if (left > 1e-12) {
    account.cash -= left * px;
    account.lots.push([side * left, px]);
  }
}

function buildIdentityLedger(history, did, snapshot, trades) {
  const mark = currentMark(snapshot);
  const final = Boolean(snapshot?.market?.final);
  const officialScore = publicValue(snapshot?.market?.pnl?.top, did);
  const officialPosition = publicValue(snapshot?.market?.positions?.top, did);
  const account = { cash: Number(CONTEST.mint), fees: 0, lots: [] };
  const metrics = new Map();
  let incomplete = false;

  const settled = trades.filter((trade) => {
    if (trade.status === "unreported") incomplete = true;
    return trade.status === "settled";
  }).sort((left, right) => {
    const leftSweep = history.flow.settlements.get(left.record.terms.id)?.sweep ?? Number.MAX_SAFE_INTEGER;
    const rightSweep = history.flow.settlements.get(right.record.terms.id)?.sweep ?? Number.MAX_SAFE_INTEGER;
    return leftSweep - rightSweep || messageOrder(left, right);
  });

  for (const trade of settled) {
    const terms = trade.record.terms;
    const role = terms.maker === did ? "maker" : "taker";
    const makerSide = terms.side === "buy" ? 1 : -1;
    const side = role === "maker" ? makerSide : -makerSide;
    const qty = number(terms.qty);
    const px = number(terms.px);
    const settlement = history.flow.settlements.get(terms.id);
    const close = settlementPrice(history, settlement);
    let fee = feeFromDetails(settlement?.details, role);
    let estimatedFee = false;
    if (fee === null && qty !== null && px !== null && close !== null) {
      const fees = sideFees(makerSide, qty, px, close);
      fee = role === "maker" ? fees[0] : fees[1];
    }
    if (fee === null && qty !== null && px !== null) {
      fee = Number(CONTEST.feeRate) * qty * px;
      estimatedFee = true;
      incomplete = true;
    }
    if (qty === null || px === null || fee === null) {
      incomplete = true;
      continue;
    }

    apply(account, side, qty, px, fee);
    const scoreDelta = mark === null ? null : side * qty * (mark - px) - fee;
    metrics.set(terms.id, {
      role,
      side: side > 0 ? "buy" : "sell",
      fee,
      estimatedFee,
      settledSweep: settlement?.sweep || null,
      settlementPrice: close,
      mark,
      final,
      scoreDelta,
      result: scoreDelta === null ? "unknown" : scoreDelta > 1e-9 ? "profit" : scoreDelta < -1e-9 ? "loss" : "flat",
    });
  }

  const position = account.lots.reduce((sum, [qty]) => sum + qty, 0);
  const collateral = account.lots.reduce((sum, [qty, px]) => sum + Math.abs(qty) * px, 0);
  const trackedScore = mark === null
    ? null
    : account.cash + account.lots.reduce((sum, [qty, px]) => (
      sum + (qty > 0 ? qty * mark : -qty * (2 * px - mark))
    ), 0) - Number(CONTEST.mint);
  const hasSettledTrade = settled.length > 0;

  return {
    mark,
    final,
    available: hasSettledTrade ? account.cash : Number(CONTEST.mint),
    collateral,
    fees: account.fees,
    trackedPosition: position,
    trackedScore,
    officialPosition,
    officialScore,
    position: officialPosition ?? position,
    score: officialScore ?? trackedScore,
    scoreSource: officialScore === null ? "retained_history" : "official_top",
    balanceSource: "retained_history",
    incomplete,
    metrics,
  };
}

module.exports = { buildIdentityLedger, currentMark, settlementPrice, sideFees };
