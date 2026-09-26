"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  CONTEST,
  DID_RE,
  ROOMS,
  SIG_RE,
  isWithinLimits,
  parseRecord,
} = require("./lib/protocol");
const { verifyOffer, verifyOuter, verifyTrade } = require("./lib/verify");

const TECHNOCORE = "https://technocore.chat";
const host = process.env.HOST || (process.env.CODESPACES === "true" ? "0.0.0.0" : "127.0.0.1");
let port = Number.parseInt(process.env.PORT || process.argv[2] || "5192", 10);
const publicRoot = path.join(__dirname, "public");
const safePublicRoot = `${publicRoot}${path.sep}`;
const lucidePath = path.join(__dirname, "node_modules", "lucide", "dist", "umd", "lucide.min.js");
const snapshotCache = { expiresAt: 0, promise: null, value: null };
const knownTrades = new Map();
const roomCache = new Map();
const ROOM_CACHE_TTL_MS = 60_000;
const ROOM_READ_CONCURRENCY = 16;
let tradeHistorySeed = null;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": type,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), "application/json; charset=utf-8");
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString("utf8");
    if (body.length > 64 * 1024) throw new Error("Request body is too large.");
  }
  const value = body ? JSON.parse(body) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required.");
  return value;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readRoom(room, optional = false) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/r/${encodeURIComponent(room)}?format=json&limit=200`);
  const text = await response.text();
  if (optional && response.status === 404) return { room, messages: [] };
  if (!response.ok) throw new Error(text || `Technocore returned ${response.status}.`);
  return JSON.parse(text);
}

async function readRoomExport(room) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/r/${encodeURIComponent(room)}/export`);
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Technocore export returned ${response.status}.`);
  const messages = [];
  for (const line of text.split("\n")) {
    try { messages.push(JSON.parse(line)); } catch {}
  }
  return { room, messages };
}

async function readCached(key, reader) {
  const cached = roomCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await reader();
  roomCache.set(key, { value, expiresAt: Date.now() + ROOM_CACHE_TTL_MS });
  return value;
}

function readCachedRoom(room) {
  return readCached(`room:${room}`, () => readRoom(room, true));
}

function readCachedRoomExport(room) {
  return readCached(`export:${room}`, () => readRoomExport(room));
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}

function rememberTrade(message, record, room = ROOMS.trading) {
  const id = record.terms.id;
  if (!knownTrades.has(id)) knownTrades.set(id, { ...publicMessage(message), room, record });
}

async function seedTradeHistory() {
  if (!tradeHistorySeed) {
    tradeHistorySeed = (async () => {
      const response = await fetchWithTimeout(`${TECHNOCORE}/r/${ROOMS.trading}/export`);
      if (!response.ok) throw new Error(`Technocore export returned ${response.status}.`);
      const lines = (await response.text()).split("\n");
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        const record = parseRecord(message.text);
        if (record?.t === "trade" && verifyOuter(ROOMS.trading, message) && verifyTrade(message, record)) {
          rememberTrade(message, record);
        }
      }
    })().catch(() => {});
  }
  await tradeHistorySeed;
}

async function readOwner(room) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/kv/room-owners/${encodeURIComponent(room)}`);
  const text = await response.text();
  if (!response.ok) return "";
  return text.split("\n").map((line) => line.trim()).find((line) => DID_RE.test(line)) || "";
}

function verifiedOfficial(room, data) {
  return (data.messages || []).filter((message) => (
    message.from === CONTEST.refereeDid && verifyOuter(room, message)
  )).map((message) => ({ ...message, record: parseRecord(message.text) })).filter(({ record }) => record);
}

function lastRecord(messages, type) {
  return [...messages].reverse().find(({ record }) => record.t === type) || null;
}

function collectFlowStatus(messages) {
  const settled = new Set();
  const voided = new Map();
  const minted = new Set();
  const registeredRooms = new Set([ROOMS.trading]);
  for (const { record } of messages) {
    for (const id of record.settled || []) settled.add(String(Array.isArray(id) ? id[0] : id));
    for (const item of record.void || []) {
      if (Array.isArray(item)) voided.set(String(item[0]), String(item[1] || "void"));
      else if (item && typeof item === "object") voided.set(String(item.id), String(item.reason || "void"));
      else voided.set(String(item), "void");
    }
    for (const did of record.mints || []) if (DID_RE.test(String(did))) minted.add(String(did));
    for (const item of record.rooms || []) {
      const room = Array.isArray(item) ? item[0] : item && typeof item === "object" ? item.room || item.name : item;
      if (typeof room === "string") registeredRooms.add(room);
    }
    for (const item of record.unlisted || []) {
      const room = Array.isArray(item) ? item[0] : item && typeof item === "object" ? item.room || item.name : item;
      if (typeof room === "string") registeredRooms.delete(room);
    }
  }
  return { settled, voided, minted, registeredRooms };
}

function publicMessage(message) {
  return { seq: message.seq, ts: message.ts, from: message.from, text: message.text };
}

async function buildSnapshot() {
  await seedTradeHistory();
  const officialRoomNames = [ROOMS.price, ROOMS.flow, ROOMS.state, ROOMS.positions, ROOMS.pnl];
  const [tradingData, offerData, officialData, owners, priceHistory] = await Promise.all([
    readRoom(ROOMS.trading),
    readRoom(ROOMS.offers, true),
    Promise.all(officialRoomNames.map((room) => room === ROOMS.flow ? readCachedRoomExport(room) : readRoom(room))),
    Promise.all(officialRoomNames.map((room) => readOwner(room))),
    readCachedRoomExport(ROOMS.price),
  ]);
  const tradingMessages = Array.isArray(tradingData.messages) ? tradingData.messages : [];
  const offerMessages = Array.isArray(offerData.messages) ? offerData.messages : [];
  const official = Object.fromEntries(officialRoomNames.map((room, index) => [room, verifiedOfficial(room, officialData[index])]));
  const priceMessage = lastRecord(official[ROOMS.price], "price");
  const seedMessage = lastRecord(verifiedOfficial(ROOMS.price, priceHistory), "seed");
  const flowMessage = lastRecord(official[ROOMS.flow], "flow");
  const stateMessage = lastRecord(official[ROOMS.state], "state");
  const positionsMessage = lastRecord(official[ROOMS.positions], "positions");
  const pnlMessage = lastRecord(official[ROOMS.pnl], "pnl");
  const flowStatus = collectFlowStatus(official[ROOMS.flow]);
  const extraRoomNames = [...flowStatus.registeredRooms].filter((room) => (
    room !== ROOMS.trading && room !== ROOMS.offers && !officialRoomNames.includes(room)
  ));
  const registeredRoomData = await mapConcurrent(extraRoomNames, ROOM_READ_CONCURRENCY, async (room) => {
    try { return await readCachedRoom(room); } catch { return { room, messages: [] }; }
  });
  const launchVerified = owners.every((owner) => owner === CONTEST.refereeDid)
    && seedMessage?.record?.season === CONTEST.id
    && seedMessage?.record?.package === CONTEST.manifestSha256
    && Array.isArray(seedMessage?.record?.rooms)
    && officialRoomNames.every((room) => seedMessage.record.rooms.includes(room));

  const registrations = [];
  const offers = [];
  const discoveryTrades = [];
  const roomMessages = [
    ...tradingMessages.map((message) => ({ room: ROOMS.trading, message })),
    ...offerMessages.map((message) => ({ room: ROOMS.offers, message })),
    ...registeredRoomData.flatMap(({ room, messages }) => messages.map((message) => ({ room, message }))),
  ];
  for (const { room, message } of roomMessages) {
    const record = parseRecord(message.text);
    if (!record || !verifyOuter(room, message)) continue;
    if (room === ROOMS.trading && record.t === "owner" && record.season === CONTEST.id && record.key === message.from) {
      registrations.push({ did: message.from, seq: message.seq, ts: message.ts });
    } else if (record.t === "close-call.offer.v1" && verifyOffer(message, record)) {
      offers.push({ ...publicMessage(message), room, record });
    } else if (record.t === "trade" && verifyTrade(message, record)) {
      if (room === ROOMS.trading) rememberTrade(message, record, room);
      else discoveryTrades.push({ ...publicMessage(message), room, record });
    }
  }

  const tradedIds = new Set([
    ...knownTrades.keys(),
    ...discoveryTrades.map(({ record }) => record.terms.id),
  ]);
  const limits = priceMessage?.record?.limits || seedMessage?.record?.limits || [];
  const currentSweep = Number(priceMessage?.record?.for || seedMessage?.record?.for || 1);
  const latestOfferById = new Map();
  for (const offer of offers) latestOfferById.set(offer.record.terms.id, offer);
  const activeOffers = [...latestOfferById.values()].filter(({ record }) => (
    !tradedIds.has(record.terms.id)
    && record.terms.until >= currentSweep
    && isWithinLimits(record.terms.px, limits)
  ));
  const latestTradeById = new Map(knownTrades);
  for (const trade of discoveryTrades) if (!latestTradeById.has(trade.record.terms.id)) latestTradeById.set(trade.record.terms.id, trade);
  const publicTrades = [...latestTradeById.values()].slice(-150).reverse().map((trade) => ({
    ...trade,
    status: flowStatus.settled.has(trade.record.terms.id)
      ? "settled"
      : flowStatus.voided.has(trade.record.terms.id) ? "void" : "pending",
    reason: flowStatus.voided.get(trade.record.terms.id) || "",
  }));

  return {
    generatedAt: new Date().toISOString(),
    launch: {
      verified: Boolean(launchVerified),
      refereeDid: CONTEST.refereeDid,
      manifestSha256: CONTEST.manifestSha256,
      roomOwners: Object.fromEntries(officialRoomNames.map((room, index) => [room, owners[index]])),
      seed: seedMessage ? { ...publicMessage(seedMessage), record: seedMessage.record } : null,
    },
    market: {
      price: priceMessage?.record || seedMessage?.record || null,
      priceTs: priceMessage?.ts || seedMessage?.ts || null,
      flow: flowMessage?.record || null,
      flowTs: flowMessage?.ts || null,
      state: stateMessage?.record || null,
      positions: positionsMessage?.record || null,
      pnl: pnlMessage?.record || null,
    },
    registrations,
    minted: [...flowStatus.minted],
    offers: activeOffers.slice(-150).reverse(),
    trades: publicTrades,
    visibility: {
      registrationIncomplete: Number(flowMessage?.record?.omitted?.mints || 0) > 0,
      omittedMints: Number(flowMessage?.record?.omitted?.mints || 0),
      offerRoom: ROOMS.offers,
      offerRoomRegistered: flowStatus.registeredRooms.has(ROOMS.offers),
    },
  };
}

async function getSnapshot(force = false) {
  const now = Date.now();
  if (force || !snapshotCache.value || snapshotCache.expiresAt <= now) {
    if (!snapshotCache.promise) {
      snapshotCache.promise = buildSnapshot().then((value) => {
        snapshotCache.value = value;
        snapshotCache.expiresAt = Date.now() + 4_000;
        return value;
      }).finally(() => { snapshotCache.promise = null; });
    }
    await snapshotCache.promise;
  }
  return snapshotCache.value;
}

function validatePost(body) {
  const room = String(body.room || ROOMS.trading);
  if (room !== ROOMS.trading && room !== ROOMS.offers) throw new Error("Unsupported room.");
  const did = String(body.did || "");
  const sig = String(body.sig || "");
  const nonce = String(body.nonce || "");
  const text = String(body.text || "").replace(/[\r\n\u2028\u2029]/g, " ").trim();
  if (!DID_RE.test(did)) throw new Error("Invalid Ed25519 did:key.");
  if (!SIG_RE.test(sig)) throw new Error("Invalid Ed25519 signature.");
  if (!/^[0-9]{1,19}$/.test(nonce)) throw new Error("Nonce must contain 1-19 digits.");
  if (!text || text.length > 4096) throw new Error("Message must contain 1-4096 characters.");
  const message = { from: did, sig, nonce, text };
  if (!verifyOuter(room, message)) throw new Error("Room signature verification failed.");
  const record = parseRecord(text);
  if (!record) throw new Error("Message must contain compact JSON.");
  const owner = room === ROOMS.trading && record.t === "owner" && record.season === CONTEST.id && record.key === did;
  const roomRegistration = room === ROOMS.trading && record.t === "room" && record.season === CONTEST.id && record.room === ROOMS.offers;
  const offer = record.t === "close-call.offer.v1" && verifyOffer(message, record);
  const trade = record.t === "trade" && verifyTrade(message, record);
  if (!owner && !roomRegistration && !offer && !trade) throw new Error("Unsupported or invalid Close Call message.");
  return { room, did, sig, nonce, text, record };
}

async function postToTechnocore(room, body) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/r/${room}?format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* Keep upstream error text. */ }
  if (!response.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  roomCache.delete(`room:${room}`);
  snapshotCache.expiresAt = 0;
  return data;
}

async function handleApi(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, technocore: TECHNOCORE });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/snapshot") {
    sendJson(response, 200, { ok: true, data: await getSnapshot(requestUrl.searchParams.get("fresh") === "1") });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/post") {
    const { room, record, ...signed } = validatePost(await readJson(request));
    const data = await postToTechnocore(room, signed);
    if (record.t === "trade" && room === ROOMS.trading) rememberTrade({ ...signed, ...data }, record, room);
    sendJson(response, 200, { ok: true, data });
    return;
  }
  sendJson(response, 404, { ok: false, error: "Not found." });
}

async function handleStatic(response, pathname) {
  if (pathname === "/vendor/lucide.js") {
    return send(response, 200, await fs.readFile(lucidePath), contentTypes[".js"]);
  }
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(publicRoot, requested));
  if (filePath !== publicRoot && !filePath.startsWith(safePublicRoot)) return send(response, 403, "Forbidden");
  const body = await fs.readFile(filePath);
  send(response, 200, body, contentTypes[path.extname(filePath)] || "application/octet-stream");
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (requestUrl.pathname.startsWith("/api/")) return await handleApi(request, response, requestUrl);
    await handleStatic(response, requestUrl.pathname);
  } catch (error) {
    if (error.code === "ENOENT") return send(response, 404, "Not found.");
    sendJson(response, 500, { ok: false, error: error.name === "AbortError" ? "Technocore request timed out." : error.message });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < 5210) {
    port += 1;
    server.listen(port, host);
    return;
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Close Call Desk running at http://${host}:${port}`);
});

module.exports = server;
