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
const { buildIdentityLedger } = require("./lib/ledger");
const { parseVenueJson } = require("./lib/venue-json");
const {
  createHistory,
  ingestOfficialMessages,
  ingestParticipantMessages,
  publicMessage,
  sortedValues,
  statusForTrade,
} = require("./lib/history");

const TECHNOCORE = process.env.TECHNOCORE_URL || "https://technocore.chat";
const host = process.env.HOST || (process.env.CODESPACES === "true" ? "0.0.0.0" : "127.0.0.1");
let port = Number.parseInt(process.env.PORT || process.argv[2] || "5192", 10);
const publicRoot = path.join(__dirname, "public");
const safePublicRoot = `${publicRoot}${path.sep}`;
const lucidePath = path.join(__dirname, "node_modules", "lucide", "dist", "umd", "lucide.min.js");
const snapshotCache = { expiresAt: 0, promise: null, value: null };
const history = createHistory();
let historySeed = null;
const MAX_DISCOVERY_ROOMS = 64;
const discoveryTailCache = { expiresAt: 0, key: "", value: [] };

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
  return parseVenueJson(text);
}

async function readRoomExport(room, optional = false) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/r/${encodeURIComponent(room)}/export`);
  if (optional && response.status === 404) return [];
  if (!response.ok) throw new Error(`Technocore ${room} export returned ${response.status}.`);
  const messages = [];
  for (const line of (await response.text()).split("\n")) {
    if (!line) continue;
    try { messages.push(parseVenueJson(line)); } catch { /* Ignore malformed retained lines. */ }
  }
  return messages;
}

function discoveryRoomNames() {
  const fixed = [ROOMS.trading, ROOMS.offers];
  const extras = [...history.flow.registeredRooms]
    .filter((room) => typeof room === "string" && !fixed.includes(room) && !room.startsWith("d-close1-"))
    .slice(-(MAX_DISCOVERY_ROOMS - fixed.length));
  return [...fixed, ...extras];
}

async function readRoomsSafely(rooms, reader, concurrency = 6) {
  const output = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rooms.length) {
      const room = rooms[cursor++];
      try { output.push({ room, messages: await reader(room) }); } catch { /* One stale room must not hide the live market. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rooms.length) }, worker));
  return output;
}

async function readDiscoveryTails() {
  const rooms = discoveryRoomNames();
  const key = rooms.join("\n");
  if (discoveryTailCache.expiresAt > Date.now() && discoveryTailCache.key === key) {
    return discoveryTailCache.value;
  }
  const value = await readRoomsSafely(rooms, async (room) => {
    const data = await readRoom(room, true);
    return Array.isArray(data.messages) ? data.messages : [];
  });
  discoveryTailCache.key = key;
  discoveryTailCache.value = value;
  discoveryTailCache.expiresAt = Date.now() + 15_000;
  return value;
}

async function seedRetainedHistory() {
  if (!historySeed) {
    const attempt = (async () => {
      const [price, flow] = await Promise.all([
        readRoomExport(ROOMS.price),
        readRoomExport(ROOMS.flow),
      ]);
      ingestOfficialMessages(history, ROOMS.price, price);
      ingestOfficialMessages(history, ROOMS.flow, flow);
      const roomExports = await readRoomsSafely(discoveryRoomNames(), (room) => readRoomExport(room, true));
      for (const { room, messages } of roomExports) ingestParticipantMessages(history, room, messages);
    })();
    historySeed = attempt;
    attempt.catch(() => {
      if (historySeed === attempt) historySeed = null;
    });
  }
  try { await historySeed; } catch { /* Tail reads below keep the UI available. */ }
}

async function readOwner(room) {
  const response = await fetchWithTimeout(`${TECHNOCORE}/kv/room-owners/${encodeURIComponent(room)}`);
  const text = await response.text();
  if (!response.ok) return "";
  return text.split("\n").map((line) => line.trim()).find((line) => DID_RE.test(line)) || "";
}

function lastRecord(messages, type) {
  return [...messages].reverse().find(({ record }) => record.t === type) || null;
}

async function buildSnapshot() {
  await seedRetainedHistory();
  const officialRoomNames = [ROOMS.price, ROOMS.flow, ROOMS.state, ROOMS.positions, ROOMS.pnl];
  const [officialData, owners] = await Promise.all([
    Promise.all(officialRoomNames.map((room) => readRoom(room))),
    Promise.all(officialRoomNames.map((room) => readOwner(room))),
  ]);
  const official = Object.fromEntries(officialRoomNames.map((room, index) => [
    room,
    ingestOfficialMessages(history, room, officialData[index].messages || []),
  ]));
  const discoveryRooms = discoveryRoomNames();
  const participantData = await readDiscoveryTails();
  for (const { room, messages } of participantData) ingestParticipantMessages(history, room, messages);
  const priceMessage = lastRecord(official[ROOMS.price], "price");
  const finalMessage = lastRecord(official[ROOMS.price], "final") || history.final;
  const seedMessage = lastRecord(official[ROOMS.price], "seed") || history.seed;
  const flowMessage = lastRecord(official[ROOMS.flow], "flow");
  const stateMessage = lastRecord(official[ROOMS.state], "state");
  const positionsMessage = lastRecord(official[ROOMS.positions], "positions");
  const pnlMessage = lastRecord(official[ROOMS.pnl], "pnl");
  const launchVerified = owners.every((owner) => owner === CONTEST.refereeDid)
    && seedMessage?.record?.season === CONTEST.id
    && seedMessage?.record?.package === CONTEST.manifestSha256
    && Array.isArray(seedMessage?.record?.rooms)
    && officialRoomNames.every((room) => seedMessage.record.rooms.includes(room));

  const registrations = sortedValues(history.registrations, true).slice(0, 200);
  const flowStatus = history.flow;
  const allDiscoveryRooms = new Set([ROOMS.trading, ROOMS.offers, ...flowStatus.registeredRooms]);
  const tradedIds = new Set(history.trades.keys());
  const limits = priceMessage?.record?.limits || seedMessage?.record?.limits || [];
  const currentSweep = Number(priceMessage?.record?.for || seedMessage?.record?.for || 1);
  const activeOffers = sortedValues(history.offers, true).filter(({ record }) => (
    !tradedIds.has(record.terms.id)
    && record.terms.until >= currentSweep
    && isWithinLimits(record.terms.px, limits)
  ));
  const publicTrades = sortedValues(history.trades, true).slice(0, 150).map((trade) => ({
    ...trade,
    ...statusForTrade(history, trade),
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
      final: finalMessage?.record || null,
      finalTs: finalMessage?.ts || null,
      flow: flowMessage?.record || null,
      flowTs: flowMessage?.ts || null,
      state: stateMessage?.record || null,
      positions: positionsMessage?.record || null,
      pnl: pnlMessage?.record || null,
    },
    registrations,
    minted: [...flowStatus.minted].slice(-1000),
    offers: activeOffers.slice(0, 150),
    trades: publicTrades,
    visibility: {
      registrationIncomplete: flowStatus.omittedMints > 0,
      omittedMints: flowStatus.omittedMints,
      offerRoom: ROOMS.offers,
      offerRoomRegistered: flowStatus.registeredRooms.has(ROOMS.offers),
      discoveryRooms,
      discoveryRoomLimit: MAX_DISCOVERY_ROOMS,
      discoveryRoomsOmitted: Math.max(0, allDiscoveryRooms.size - discoveryRooms.length),
      omittedTradeResults: flowStatus.omittedSettled + flowStatus.omittedVoid,
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

function identityView(did, snapshot) {
  const allTrades = sortedValues(history.trades, true)
    .filter(({ record }) => record.terms.maker === did || record.taker === did)
    .map((trade) => ({ ...trade, ...statusForTrade(history, trade) }));
  const ledger = buildIdentityLedger(history, did, snapshot, allTrades);
  const enrichedTrades = allTrades.slice(0, 100).map((trade) => ({
    ...trade,
    metrics: ledger.metrics.get(trade.record.terms.id) || null,
  }));
  return {
    did,
    registration: history.registrations.get(did) || null,
    minted: history.flow.minted.has(did),
    offers: snapshot.offers.filter(({ record }) => record.terms.maker === did),
    trades: enrichedTrades,
    account: {
      mark: ledger.mark,
      final: ledger.final,
      available: ledger.available,
      collateral: ledger.collateral,
      fees: ledger.fees,
      position: ledger.position,
      score: ledger.score,
      officialPosition: ledger.officialPosition,
      officialScore: ledger.officialScore,
      scoreSource: ledger.scoreSource,
      balanceSource: ledger.balanceSource,
      incomplete: ledger.incomplete,
    },
    historyIncomplete: snapshot.visibility.registrationIncomplete,
  };
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
  if (request.method === "GET" && requestUrl.pathname === "/api/identity") {
    const did = String(requestUrl.searchParams.get("did") || "");
    if (!DID_RE.test(did)) throw new Error("Invalid Ed25519 did:key.");
    const snapshot = await getSnapshot(requestUrl.searchParams.get("fresh") === "1");
    sendJson(response, 200, { ok: true, data: identityView(did, snapshot) });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/post") {
    const { room, record, ...signed } = validatePost(await readJson(request));
    const data = await postToTechnocore(room, signed);
    ingestParticipantMessages(history, room, [{ ...signed, ...data }]);
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
