"use strict";

const CONTEST = Object.freeze({
  id: "close-1",
  room: "close1",
  offerRoom: "close1-offers",
  opening: "2026-09-25T12:00:00Z",
  lock: "2026-10-04T09:00:00Z",
  lockSweep: 2556,
  minQty: 0.1,
});
const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const i18n = {
  tr: {
    community: "UfukNode topluluk aracı", market: "Piyasa", predict: "Tahmin yap", desk: "Masam", rules: "Kurallar", identity: "Kimlik",
    notConnected: "DID bağlı değil", importDid: "DID içe aktar", forget: "Anahtarı unut", keyLocal: "Private key yalnızca bu sekmede kalır.", officialRepo: "Resmî kurallar",
    verifying: "Referee doğrulanıyor", sweep: "Sweep", liveMarket: "Canlı piyasa", newCall: "Yeni tahmin", reference: "Referans", allowedRange: "İzin verilen aralık",
    globalPrice: "Global fiyat", openInterest: "Açık pozisyon", owners: "Katılımcı", actionsLocked: "İşlemler kilitli", launchWarning: "İmzalı seed, paket hash'i veya referee odaları doğrulanamadı.",
    openOffers: "Açık tahminler", all: "Tümü", long: "Long", short: "Short", makerCall: "Maker tahmini", price: "Fiyat", size: "Miktar", expires: "Bitiş",
    refereeFeed: "Referee akışı", signedOnly: "Yalnızca doğrulanmış mesajlar", nextLimits: "Sonraki sweep aralığı", longAccounts: "Long hesap", shortAccounts: "Short hesap",
    settledLast: "Son sweep sonuçlanan", voidLast: "Son sweep geçersiz", liveBoard: "Canlı sıralama", score: "Skor", tradeTape: "İşlem akışı", officialTrades: "Çift imzalı resmî işlemler",
    oneBet: "TEK NVDA FUTURE", makeCallTitle: "Tahminini oluştur", connectFirst: "Önce DID bağla", signingDid: "İmzalayan DID", nvdaUp: "NVDA yükselecek", openLong: "Long aç", nvdaDown: "NVDA düşecek", openShort: "Short aç",
    limitPrice: "İşlem fiyatı", quantity: "Miktar", minimumQty: "Minimum 0.10", offerDuration: "Teklif süresi", counterparty: "Karşı taraf", anyDid: "Herhangi bir kayıtlı DID",
    specificDid: "Belirli DID", makerWaits: "İşlem ancak karşı taraf imzalayınca başlar.", takerDid: "Taker DID", collateral: "Bağlanacak en yüksek teminat", baseFee: "Taraf başına temel ücret",
    makerSide: "Senin tarafın", publishOffer: "İmzala ve tahmini yayımla", irrevocable: "İmzalanmış açık teklif resmî protokolde iptal edilemez. Kısa süre seç.", priceGuard: "Fiyat koruması",
    protocolLimit: "Resmî ±%5 sınırı", ruleMaker: "Sen fiyatı ve yönü imzalarsın.", ruleTaker: "Başka bir DID karşı tarafı imzalar.", ruleReferee: "Referee sonraki sweep'te iki tarafı birlikte sonuçlandırır.",
    account: "HESAP", myDeskTitle: "Close Call masam", register: "İlk kez kaydol", confirmRegistered: "Daha önce kaydoldum", registration: "Kayıt", startingBalance: "Başlangıç bakiyesi", myPosition: "Açık pozisyonum",
    myScore: "Canlı skorum", myCalls: "Tahminlerim", fromPublicRoom: "Açık odadan", myTrades: "İşlemlerim", refereeStatus: "Referee durumu", acceptShared: "Paylaşılan tahmini kabul et",
    pasteOffer: "Başka oyuncunun imzalı offer JSON'ını yapıştır.", review: "Teklifi incele", rulesTitle: "Kurallar, gereksiz detay olmadan", canonicalRules: "Canonical kurallar",
    rule1Title: "Herkes eşit başlar", rule1Text: "Her DID bir kez 10.000 POLF alır. POLF burada yarışma bakiyesidir, cüzdan tokenı değildir.", rule2Title: "Bir tahmin iki imza ister",
    rule2Text: "Bir long ancak başka kayıtlı DID short tarafını kabul edince oluşur; short için de tam tersi.", rule3Title: "Beş dakikalık sweep", rule3Text: "Referee işlemi settled olarak yazmadan hiçbir şey kesin değildir. Fiyat resmî ±%5 aralığında kalmalıdır.",
    rule4Title: "Kaldıraç yok", rule4Text: "İşlem değerinin tamamı bağlanır. Her taraf %1 öder; daha büyükse resmî clawback uygulanır.", rule5Title: "Tek final NVDA fiyatı",
    rule5Text: "İşlemler 4 Ekim 09:00 UTC'de kilitlenir. 10:00 UTC öncesindeki son Hyperliquid xyz:NVDA işlemi tüm pozisyonları kapatır.", rule6Title: "İlk üç kazanır",
    rule6Text: "En yüksek üç skor, mainnet sonrasında resmî claim kurallarıyla 1.000.000 FLOP'u paylaşır.", marketLabel: "Piyasa", sweepInterval: "Sweep aralığı", fee: "Ücret",
    priceStep: "Fiyat / miktar adımı", minTrade: "Minimum işlem", identityPolicy: "Kimlik", counterSign: "KARŞI İMZA", acceptCall: "Bu tahmini kabul et?", officialPost: "İmzan close1 odasına resmî trade gönderir.", signAccept: "İmzala ve kabul et",
    launchLive: "Canlı ve doğrulandı", launchInvalid: "Doğrulama başarısız", keyLoaded: "DID içe aktarıldı.", invalidKey: "Geçerli Technocore Ed25519 private-key JSON seç.", keyForgotten: "Anahtar sekmeden kaldırıldı.",
    refreshed: "Canlı veriler yenilendi.", noOffers: "Şu anda kabul edilebilir açık teklif yok.", takeLong: "LONG al", takeShort: "SHORT al", connectToTake: "Kabul etmek için DID bağla.",
    registerFirst: "Önce DID'ini yarışmaya kaydet.", waitMint: "Kayıt gönderildi. Sonraki sweep'te 10.000 POLF tanımlanacak.", ready: "Hazır", notRegistered: "Kayıtlı değil", registrationUnknown: "Kayıt geçmişi eksik", registrationUnknownHelp: "Referee büyük mint listelerini public mesajlarda kısalttığı için eski kayıtlar tek tek doğrulanamıyor. Daha önce kaydolduysanız tekrar kayıt göndermeyin. Bu onay yalnızca arayüzü açar; resmî kararı referee verir.", registrationPosted: "Kayıt imzalandı. Sonraki sweep'i bekle.", registrationConfirmed: "Önceki kayıt bu tarayıcı için onaylandı.",
    offerPosted: "Tahmin yayımlandı. Karşı taraf imzaladığında resmî işlem oluşacak.", tradePosted: "Karşı imza gönderildi. Referee sonucunu bekle.", ownOffer: "Kendi teklifini kabul edemezsin.", reservedOffer: "Bu teklif başka bir DID için ayrılmış.",
    invalidOffer: "Offer JSON veya maker imzası geçersiz.", outsideLimits: "Fiyat güncel resmî aralığın dışında.", expiredOffer: "Teklifin sweep süresi dolmuş.", copied: "İmzalı offer JSON kopyalandı.", copy: "Kopyala",
    pending: "Bekliyor", settled: "Sonuçlandı", void: "Geçersiz", posted: "Gönderildi", publicTopOnly: "İlk 25 dışında", noPersonalCalls: "Aktif tahminin yok.", noPersonalTrades: "Henüz resmî işlemin yok.",
    sweepExpiry: "Sweep {n}'e kadar", updatedNow: "şimdi", minutesAgo: "{n} dk önce", secondsAgo: "{n} sn önce", priceRangeHint: "{low} ile {high} arasında olmalı", expiresAtSweep: "Sweep {n}",
  },
  en: {
    community: "UfukNode community tool", market: "Market", predict: "Make a call", desk: "My desk", rules: "Rules", identity: "Identity", notConnected: "DID not connected",
    importDid: "Import DID", forget: "Forget key", keyLocal: "Private key stays in this tab.", officialRepo: "Official rules", verifying: "Verifying referee", sweep: "Sweep", liveMarket: "Live market",
    newCall: "New call", reference: "Reference", allowedRange: "Allowed range", globalPrice: "Global price", openInterest: "Open interest", owners: "Owners", actionsLocked: "Actions locked",
    launchWarning: "The signed seed, package hash, or referee rooms could not be verified.", openOffers: "Open calls", all: "All", long: "Long", short: "Short", makerCall: "Maker call", price: "Price",
    size: "Size", expires: "Expires", refereeFeed: "Referee feed", signedOnly: "Verified posts only", nextLimits: "Next sweep limits", longAccounts: "Long accounts", shortAccounts: "Short accounts",
    settledLast: "Settled last sweep", voidLast: "Void last sweep", liveBoard: "Live board", score: "Score", tradeTape: "Trade tape", officialTrades: "Countersigned official trades", oneBet: "ONE NVDA FUTURE",
    makeCallTitle: "Make your call", connectFirst: "Connect DID first", signingDid: "Signing DID", nvdaUp: "NVDA goes up", openLong: "Open long", nvdaDown: "NVDA goes down", openShort: "Open short", limitPrice: "Trade price",
    quantity: "Quantity", minimumQty: "Minimum 0.10", offerDuration: "Offer duration", counterparty: "Counterparty", anyDid: "Any registered DID", specificDid: "Specific DID", makerWaits: "The trade starts only after a taker signs.",
    takerDid: "Taker DID", collateral: "Maximum tied collateral", baseFee: "Base fee per side", makerSide: "Your side", publishOffer: "Sign & publish call", irrevocable: "A signed open offer cannot be revoked in the official protocol. Use a short expiry.",
    priceGuard: "Price guard", protocolLimit: "Official ±5% limit", ruleMaker: "You sign a price and direction.", ruleTaker: "Another DID signs the opposite side.", ruleReferee: "The referee settles both sides at the next sweep.",
    account: "ACCOUNT", myDeskTitle: "My Close Call desk", register: "Register for the first time", confirmRegistered: "I registered before", registration: "Registration", startingBalance: "Starting balance", myPosition: "Public position", myScore: "Public score",
    myCalls: "My calls", fromPublicRoom: "From public room", myTrades: "My trades", refereeStatus: "Referee status", acceptShared: "Accept a shared call", pasteOffer: "Paste the signed offer JSON from another player.", review: "Review offer",
    rulesTitle: "Rules, without the noise", canonicalRules: "Canonical rules", rule1Title: "Everyone starts equal", rule1Text: "Each DID receives 10,000 POLF once. POLF is contest accounting, not a wallet token.",
    rule2Title: "A call needs two signatures", rule2Text: "A long only exists when another registered DID accepts the short side, or vice versa.", rule3Title: "Five-minute sweeps", rule3Text: "Nothing is final until the referee lists the trade as settled. Prices must stay inside the posted ±5% range.",
    rule4Title: "No leverage", rule4Text: "The full trade value is tied up. Each side pays 1%, with the official clawback rule applied when larger.", rule5Title: "One final NVDA price", rule5Text: "Trading locks 4 October at 09:00 UTC. The last Hyperliquid xyz:NVDA trade before 10:00 UTC settles every open position.",
    rule6Title: "Top three win", rule6Text: "The three highest scores share 1,000,000 FLOP after mainnet, under the official claim rules.", marketLabel: "Market", sweepInterval: "Sweep interval", fee: "Fee", priceStep: "Price / qty step", minTrade: "Minimum trade",
    identityPolicy: "Identity", counterSign: "COUNTERSIGN", acceptCall: "Accept this call?", officialPost: "Your signature publishes an official trade to close1.", signAccept: "Sign & accept", launchLive: "Live and verified", launchInvalid: "Verification failed",
    keyLoaded: "DID imported.", invalidKey: "Choose a valid Technocore Ed25519 private-key JSON.", keyForgotten: "Private key removed from this tab.", refreshed: "Live data refreshed.", noOffers: "No acceptable open offers right now.", takeLong: "Take LONG", takeShort: "Take SHORT",
    connectToTake: "Connect a DID to accept.", registerFirst: "Register your DID in the contest first.", waitMint: "Registration posted. The next sweep will issue 10,000 POLF.", ready: "Ready", notRegistered: "Not registered", registrationUnknown: "Registration history incomplete", registrationUnknownHelp: "The referee truncates large mint lists in public messages, so older registrations cannot be checked individually. Do not register again if you already registered. This confirmation only unlocks the interface; the referee remains authoritative.", registrationPosted: "Registration signed. Wait for the next sweep.", registrationConfirmed: "Previous registration confirmed for this browser.",
    offerPosted: "Call published. It becomes an official trade when another DID signs.", tradePosted: "Countersignature posted. Wait for the referee result.", ownOffer: "You cannot take your own offer.", reservedOffer: "This offer is reserved for another DID.", invalidOffer: "Offer JSON or maker signature is invalid.",
    outsideLimits: "Price is outside the current official range.", expiredOffer: "The offer has expired by sweep.", copied: "Signed offer JSON copied.", copy: "Copy", pending: "Pending", settled: "Settled", void: "Void", posted: "Posted", publicTopOnly: "Outside public top 25",
    noPersonalCalls: "You have no active calls.", noPersonalTrades: "You have no official trades yet.", sweepExpiry: "Until sweep {n}", updatedNow: "now", minutesAgo: "{n}m ago", secondsAgo: "{n}s ago", priceRangeHint: "Must be between {low} and {high}", expiresAtSweep: "Sweep {n}",
  },
};

const state = {
  language: localStorage.getItem("close-call-language") || "tr",
  snapshot: null,
  did: "",
  key: null,
  fingerprint: "",
  side: "buy",
  offerFilter: "all",
  selectedOffer: null,
  refreshing: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const t = (key, vars = {}) => Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, value), i18n[state.language][key] || key);

function compact(record) { return JSON.stringify(record); }
function singleLine(value) { return String(value).replace(/[\r\n\u2028\u2029]/g, " ").trim(); }
function shortDid(did) { return did ? `${did.slice(0, 14)}…${did.slice(-8)}` : "-"; }
function formatNumber(value, decimals = 2) { return Number(value).toLocaleString(state.language === "tr" ? "tr-TR" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function parseRecord(text) { try { const value = JSON.parse(String(text)); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; } }

function base64urlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base58Encode(bytes) {
  let number = 0n;
  for (const byte of bytes) number = number * 256n + BigInt(byte);
  let output = "";
  while (number > 0n) {
    output = BASE58[Number(number % 58n)] + output;
    number /= 58n;
  }
  for (const byte of bytes) { if (byte !== 0) break; output = `1${output}`; }
  return output || "1";
}

function base58Decode(value) {
  let number = 0n;
  for (const character of value) {
    const index = BASE58.indexOf(character);
    if (index < 0) throw new Error("Invalid base58 value.");
    number = number * 58n + BigInt(index);
  }
  const output = [];
  while (number > 0n) { output.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) { if (character !== "1") break; output.unshift(0); }
  return Uint8Array.from(output);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importKeyFile(file) {
  const payload = JSON.parse(await file.text());
  const jwk = payload.privateKeyJwk || payload;
  if (jwk?.kty !== "OKP" || jwk?.crv !== "Ed25519" || !jwk.d || !jwk.x) throw new Error(t("invalidKey"));
  const rawPublic = base64urlToBytes(jwk.x);
  if (rawPublic.length !== 32) throw new Error(t("invalidKey"));
  const prefixed = new Uint8Array(34);
  prefixed.set([0xed, 0x01]);
  prefixed.set(rawPublic, 2);
  const did = `did:key:z${base58Encode(prefixed)}`;
  if (!DID_RE.test(did) || (payload.did && payload.did !== did)) throw new Error(t("invalidKey"));
  state.key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  state.did = did;
  state.fingerprint = (await sha256(did)).slice(0, 16);
  renderAll();
  showToast(t("keyLoaded"));
}

function forgetKey() {
  state.key = null;
  state.did = "";
  state.fingerprint = "";
  $("#keyFile").value = "";
  renderAll();
  showToast(t("keyForgotten"));
}

function nextNonce() {
  const key = `close-call-nonce:${state.fingerprint}`;
  const previous = BigInt(localStorage.getItem(key) || "0");
  const now = BigInt(Date.now());
  const nonce = now > previous ? now : previous + 1n;
  localStorage.setItem(key, nonce.toString());
  return nonce.toString();
}

async function signPayload(payload) {
  if (!state.key) throw new Error(t("connectFirst"));
  const signature = await crypto.subtle.sign("Ed25519", state.key, new TextEncoder().encode(payload));
  return bytesToBase64url(new Uint8Array(signature));
}

async function postRecord(record, room = CONTEST.room) {
  const text = singleLine(compact(record));
  const nonce = nextNonce();
  const sig = await signPayload(`${room}|${nonce}|${text}`);
  return api("/api/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, did: state.did, sig, nonce, text }),
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("Local tool returned an unexpected response."); }
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload.data ?? payload;
}

function makeTerms(input) {
  const id = String(input.id || "").trim();
  const maker = String(input.maker || "").trim();
  const px = String(input.px || "").trim();
  const qty = String(input.qty || "").trim();
  const side = String(input.side || "");
  const taker = String(input.taker || "any").trim();
  const until = Number(input.until);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid trade ID.");
  if (!DID_RE.test(maker)) throw new Error("Invalid maker DID.");
  if (!/^[0-9]{1,7}(?:\.[0-9]{1,2})?$/.test(px) || Number(px) <= 0) throw new Error("Invalid price.");
  if (!/^[0-9]{1,7}(?:\.[0-9]{1,2})?$/.test(qty) || Number(qty) < CONTEST.minQty) throw new Error("Invalid quantity.");
  if (!["buy", "sell"].includes(side)) throw new Error("Invalid side.");
  if (taker !== "any" && !DID_RE.test(taker)) throw new Error("Invalid taker DID.");
  if (!Number.isSafeInteger(until) || until < 1 || until > CONTEST.lockSweep) throw new Error("Invalid expiry sweep.");
  return { id, maker, px, qty, side, taker, until };
}

function makerPayload(terms) { return `${CONTEST.id}|terms|${compact(makeTerms(terms))}`; }
function takerPayload(terms, did) { return `${CONTEST.id}|accept|${compact(makeTerms(terms))}|${did}`; }

async function verifyDidSignature(did, payload, signature) {
  try {
    if (!DID_RE.test(did) || !SIG_RE.test(signature)) return false;
    const decoded = base58Decode(did.slice("did:key:z".length));
    if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) return false;
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: bytesToBase64url(decoded.slice(2)) }, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, base64urlToBytes(signature), new TextEncoder().encode(payload));
  } catch { return false; }
}

async function verifyOfferRecord(record) {
  if (record?.t !== "close-call.offer.v1" || record.season !== CONTEST.id) return false;
  let terms;
  try { terms = makeTerms(record.terms); } catch { return false; }
  return verifyDidSignature(terms.maker, makerPayload(terms), record.maker_sig);
}

function latestRegistration() {
  if (!state.did || !state.snapshot) return null;
  return [...state.snapshot.registrations].reverse().find(({ did }) => did === state.did) || null;
}

function registrationProofKey() { return state.did ? `close-call-registration:${state.did}` : ""; }

function localRegistrationProof() {
  if (!state.did) return null;
  try { return JSON.parse(localStorage.getItem(registrationProofKey()) || "null"); } catch { return null; }
}

function saveRegistrationProof(source) {
  localStorage.setItem(registrationProofKey(), JSON.stringify({ source, ts: new Date().toISOString() }));
}

function registrationState() {
  if (!state.did || !state.snapshot) return "disconnected";
  const registration = latestRegistration();
  if (state.snapshot.minted.includes(state.did)) return "ready";
  if (registration) {
    return state.snapshot.market.flowTs && new Date(state.snapshot.market.flowTs) > new Date(registration.ts) ? "ready" : "waiting";
  }
  const proof = localRegistrationProof();
  if (proof?.source === "confirmed") return "ready";
  if (proof?.source === "posted") {
    return state.snapshot.market.flowTs && new Date(state.snapshot.market.flowTs) > new Date(proof.ts) ? "ready" : "waiting";
  }
  return state.snapshot.visibility?.registrationIncomplete ? "unknown" : "notRegistered";
}

function registrationReady() { return registrationState() === "ready"; }

function marketPrice() {
  const price = state.snapshot?.market.price;
  return Number(price?.ref?.px || price?.price || price?.applied || 0);
}

function marketLimits() { return state.snapshot?.market.price?.limits || []; }
function currentSweep() { return Number(state.snapshot?.market.price?.for || state.snapshot?.launch.seed?.record?.for || 1); }

function applyLanguage() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((node) => { const value = i18n[state.language][node.dataset.i18n]; if (value) node.textContent = value; });
  $$('[data-language]').forEach((button) => button.classList.toggle("active", button.dataset.language === state.language));
  renderAll();
}

function relativeTime(value) {
  if (!value) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 5) return t("updatedNow");
  if (seconds < 60) return t("secondsAgo", { n: seconds });
  return t("minutesAgo", { n: Math.floor(seconds / 60) });
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function renderLaunch() {
  const verified = state.snapshot?.launch.verified;
  const badge = $("#launchBadge");
  badge.className = `status-badge ${verified ? "live" : "danger"}`;
  badge.innerHTML = `<span class="pulse"></span><span>${verified ? t("launchLive") : t("launchInvalid")}</span>`;
  $("#launchWarning").classList.toggle("hidden", verified);
}

function renderIdentity() {
  $("#identityDot").classList.toggle("connected", Boolean(state.did));
  $("#identityName").textContent = state.did ? `DID ${state.fingerprint}` : t("notConnected");
  $("#identityDid").textContent = state.did || "-";
  $("#predictSignerName").textContent = state.did ? `DID ${state.fingerprint}` : t("notConnected");
  $("#predictSignerDid").textContent = state.did || "-";
  $("#forgetButton").classList.toggle("hidden", !state.did);
}

function renderMetrics() {
  const market = state.snapshot?.market || {};
  const price = market.price;
  const ref = price?.ref?.px || price?.price || price?.applied;
  const limits = price?.limits || [];
  $("#sweepNumber").textContent = price?.for || "-";
  $("#referencePrice").textContent = ref ? `$${formatNumber(ref)}` : "-";
  $("#priceAge").textContent = relativeTime(market.priceTs);
  $("#priceLimits").textContent = limits.length === 2 ? `${limits[0]} – ${limits[1]}` : "-";
  $("#globalPrice").textContent = price?.global ? `$${formatNumber(price.global)}` : ref ? `$${formatNumber(ref)}` : "-";
  $("#openInterest").textContent = market.positions?.open ? `${market.positions.open} NVDA` : "0 NVDA";
  $("#ownerCount").textContent = market.state?.owners ?? state.snapshot?.registrations.length ?? "-";
  $("#nextLimits").textContent = limits.length === 2 ? `$${limits[0]} — $${limits[1]}` : "-";
  $("#longAccounts").textContent = market.positions?.longs ?? "-";
  $("#shortAccounts").textContent = market.positions?.shorts ?? "-";
  $("#settledLast").textContent = Array.isArray(market.flow?.settled) ? market.flow.settled.length : "-";
  $("#voidLast").textContent = Array.isArray(market.flow?.void) ? market.flow.void.length : "-";
  $("#lastUpdated").textContent = state.snapshot ? relativeTime(state.snapshot.generatedAt) : "-";
  $("#rangeLow").textContent = limits[0] || "-";
  $("#rangeCurrent").textContent = ref || "-";
  $("#rangeHigh").textContent = limits[1] || "-";
  $("#priceHelp").textContent = limits.length === 2 ? t("priceRangeHint", { low: limits[0], high: limits[1] }) : "-";
  if (ref && !$("#offerPrice").dataset.touched) $("#offerPrice").value = Number(ref).toFixed(2);
}

function renderLeaderboard() {
  const top = state.snapshot?.market.pnl?.top || [];
  $("#leaderboard").innerHTML = top.length ? top.slice(0, 8).map(([did, score], index) => `
    <div class="leader-row ${did === state.did ? "me" : ""}"><span>${index + 1}</span><code title="${did}">${shortDid(did)}</code><strong>${score}</strong></div>
  `).join("") : `<div class="empty-state"><span>-</span></div>`;
}

function offerDirection(record, takerView = false) {
  const makerSide = record.terms.side;
  const side = takerView ? (makerSide === "buy" ? "sell" : "buy") : makerSide;
  return side === "buy" ? "long" : "short";
}

function renderOffers() {
  const offers = state.snapshot?.offers || [];
  const filtered = offers.filter(({ record }) => state.offerFilter === "all" || offerDirection(record) === state.offerFilter);
  $("#offerSummary").textContent = String(filtered.length);
  $("#offerList").innerHTML = filtered.length ? filtered.map(({ record, ts }) => {
    const makerDirection = offerDirection(record);
    const takeDirection = offerDirection(record, true);
    const canTake = state.did && registrationReady() && record.terms.maker !== state.did && (record.terms.taker === "any" || record.terms.taker === state.did);
    return `<div class="offer-row market-columns">
      <div class="call-cell"><span class="direction-chip ${makerDirection}"><i data-lucide="${makerDirection === "long" ? "trending-up" : "trending-down"}"></i></span><div><strong>${makerDirection.toUpperCase()}</strong><code title="${record.terms.maker}">${shortDid(record.terms.maker)}</code></div></div>
      <strong>${record.terms.px}</strong><span>${record.terms.qty}</span><span title="${ts}">#${record.terms.until}</span>
      <button class="take-button" type="button" data-take="${record.terms.id}" ${canTake ? "" : "disabled"}>${takeDirection === "long" ? t("takeLong") : t("takeShort")}</button>
    </div>`;
  }).join("") : `<div class="empty-state"><i data-lucide="scan-line"></i><span>${t("noOffers")}</span></div>`;
}

function renderTape() {
  const trades = state.snapshot?.trades || [];
  $("#tradeTape").innerHTML = trades.length ? trades.slice(0, 12).map(({ record, status, reason }) => {
    const direction = offerDirection(record);
    return `<div class="tape-row"><span class="tape-side ${direction}">${direction.toUpperCase()}</span><div class="tape-data"><strong>${record.terms.qty} @ ${record.terms.px}</strong><code title="${record.terms.id}">${record.terms.id}${reason ? ` · ${reason}` : ""}</code></div><span class="trade-status ${status}">${t(status)}</span></div>`;
  }).join("") : `<div class="empty-state"><span>-</span></div>`;
}

function renderEligibility() {
  const connected = Boolean(state.did);
  const status = registrationState();
  const ready = registrationReady();
  const live = Boolean(state.snapshot?.launch.verified);
  const badge = $("#eligibilityBadge");
  badge.className = `status-badge ${ready && live ? "live" : "neutral"}`;
  badge.textContent = !connected ? t("connectFirst") : status === "unknown" ? t("registrationUnknown") : status === "notRegistered" ? t("registerFirst") : !ready ? t("waitMint") : t("ready");
  const signerBadge = $("#predictSignerBadge");
  signerBadge.className = `status-badge ${ready && live ? "live" : "neutral"}`;
  signerBadge.textContent = badge.textContent;
  $("#publishOfferButton").disabled = !(connected && ready && live && Date.now() < new Date(CONTEST.lock).getTime());
  const canRegister = connected && live && ["unknown", "notRegistered"].includes(status) && Date.now() < new Date(CONTEST.lock).getTime();
  $("#registerButton").disabled = !canRegister;
  $("#registerButton").classList.toggle("hidden", !["unknown", "notRegistered"].includes(status));
  $("#confirmRegisteredButton").classList.toggle("hidden", status !== "unknown");
  $("#registrationNotice").classList.toggle("hidden", status !== "unknown");
  $("#registrationStatus").textContent = status === "ready" ? t("ready") : status === "waiting" ? t("posted") : status === "unknown" ? t("registrationUnknown") : t("notRegistered");
}

function renderOrderPreview() {
  const px = Number($("#offerPrice").value || 0);
  const qty = Number($("#offerQty").value || 0);
  const notional = px * qty;
  $("#collateralPreview").textContent = notional > 0 ? `${formatNumber(notional)} POLF` : "-";
  $("#feePreview").textContent = notional > 0 ? `${formatNumber(notional * .01)} POLF` : "-";
  const side = state.side === "buy" ? "LONG" : "SHORT";
  $("#sidePreview").textContent = side;
  $("#sidePreview").className = state.side === "buy" ? "positive" : "negative";
  const expiry = Math.min(CONTEST.lockSweep, currentSweep() + Number($("#offerDuration").value || 6));
  $("#expiryHelp").textContent = t("expiresAtSweep", { n: expiry });
  const limits = marketLimits();
  const marker = limits.length === 2 && px ? Math.max(0, Math.min(100, (px - Number(limits[0])) / (Number(limits[1]) - Number(limits[0])) * 100)) : 50;
  $("#rangeMarker").style.left = `${marker}%`;
}

function findPublicValue(list, did) {
  const match = (list || []).find(([key]) => key === did);
  return match ? match[1] : null;
}

function renderDesk() {
  const offers = (state.snapshot?.offers || []).filter(({ record }) => record.terms.maker === state.did);
  const trades = (state.snapshot?.trades || []).filter(({ record }) => record.terms.maker === state.did || record.taker === state.did);
  $("#myOffers").innerHTML = state.did && offers.length ? offers.map(({ record }) => `<div class="desk-row"><div><strong>${offerDirection(record).toUpperCase()} · ${record.terms.qty} @ ${record.terms.px}</strong><code>${t("sweepExpiry", { n: record.terms.until })}</code></div><button class="secondary" type="button" data-copy="${record.terms.id}"><i data-lucide="copy"></i><span>${t("copy")}</span></button></div>`).join("") : `<div class="empty-state"><span>${t("noPersonalCalls")}</span></div>`;
  $("#myTrades").innerHTML = state.did && trades.length ? trades.map(({ record, status, reason }) => `<div class="desk-row"><div><strong>${record.terms.qty} @ ${record.terms.px}</strong><code>${record.terms.id}${reason ? ` · ${reason}` : ""}</code></div><span class="trade-status ${status}">${t(status)}</span></div>`).join("") : `<div class="empty-state"><span>${t("noPersonalTrades")}</span></div>`;
  const position = findPublicValue(state.snapshot?.market.positions?.top, state.did);
  const score = findPublicValue(state.snapshot?.market.pnl?.top, state.did);
  $("#myPosition").textContent = state.did ? position ?? t("publicTopOnly") : "-";
  $("#myScore").textContent = state.did ? score ?? t("publicTopOnly") : "-";
}

function renderAll() {
  renderIdentity();
  if (state.snapshot) {
    renderLaunch();
    renderMetrics();
    renderLeaderboard();
    renderOffers();
    renderTape();
  }
  renderEligibility();
  renderOrderPreview();
  renderDesk();
  if (window.lucide) window.lucide.createIcons();
}

async function refreshSnapshot(notify = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  $("#refreshButton svg")?.classList.add("spin");
  try {
    state.snapshot = await api(`/api/snapshot${notify ? "?fresh=1" : ""}`);
    renderAll();
    if (notify) showToast(t("refreshed"));
  } catch (error) { showToast(error.message); }
  finally { state.refreshing = false; $("#refreshButton svg")?.classList.remove("spin"); }
}

async function registerOwner() {
  if (!state.did) throw new Error(t("connectFirst"));
  await postRecord({ t: "owner", season: CONTEST.id, key: state.did });
  saveRegistrationProof("posted");
  await refreshSnapshot(true);
  showToast(t("registrationPosted"));
}

function confirmPreviousRegistration() {
  if (!state.did) throw new Error(t("connectFirst"));
  saveRegistrationProof("confirmed");
  renderAll();
  showToast(t("registrationConfirmed"));
}

async function publishOffer() {
  if (!registrationReady()) throw new Error(t("registerFirst"));
  const limits = marketLimits();
  const px = Number($("#offerPrice").value).toFixed(2);
  if (limits.length !== 2 || Number(px) < Number(limits[0]) || Number(px) > Number(limits[1])) throw new Error(t("outsideLimits"));
  const qty = Number($("#offerQty").value).toFixed(2).replace(/\.00$/, "");
  const until = Math.min(CONTEST.lockSweep, currentSweep() + Number($("#offerDuration").value));
  const taker = $("#takerMode").value === "specific" ? $("#specificTaker").value.trim() : "any";
  const terms = makeTerms({ id: randomId(), maker: state.did, px, qty, side: state.side, taker, until });
  const makerSig = await signPayload(makerPayload(terms));
  await postRecord({ t: "close-call.offer.v1", season: CONTEST.id, terms, maker_sig: makerSig }, CONTEST.offerRoom);
  await refreshSnapshot(true);
  showToast(t("offerPosted"));
  showView("market");
}

function openOfferDialog(offer) {
  const record = offer.record || offer;
  if (!state.did) throw new Error(t("connectToTake"));
  if (!registrationReady()) throw new Error(t("registerFirst"));
  if (record.terms.maker === state.did) throw new Error(t("ownOffer"));
  if (record.terms.taker !== "any" && record.terms.taker !== state.did) throw new Error(t("reservedOffer"));
  if (record.terms.until < currentSweep()) throw new Error(t("expiredOffer"));
  const limits = marketLimits();
  if (limits.length !== 2 || Number(record.terms.px) < Number(limits[0]) || Number(record.terms.px) > Number(limits[1])) throw new Error(t("outsideLimits"));
  state.selectedOffer = record;
  const takeDirection = offerDirection(record, true);
  $("#dialogOffer").innerHTML = `<div><span>${t("makerCall")}</span><strong>${offerDirection(record).toUpperCase()}</strong></div><div><span>${t("makerSide")}</span><strong class="${takeDirection === "long" ? "positive" : "negative"}">${takeDirection.toUpperCase()}</strong></div><div><span>${t("price")}</span><strong>${record.terms.px} POLF</strong></div><div><span>${t("quantity")}</span><strong>${record.terms.qty} NVDA</strong></div><div><span>Maker</span><strong>${shortDid(record.terms.maker)}</strong></div><div><span>${t("expires")}</span><strong>#${record.terms.until}</strong></div>`;
  $("#offerDialog").classList.remove("hidden");
  if (window.lucide) window.lucide.createIcons();
}

async function acceptSelectedOffer() {
  const record = state.selectedOffer;
  if (!record || !await verifyOfferRecord(record)) throw new Error(t("invalidOffer"));
  const takerSig = await signPayload(takerPayload(record.terms, state.did));
  const trade = {
    t: "trade",
    season: CONTEST.id,
    terms: makeTerms(record.terms),
    taker: state.did,
    maker_sig: record.maker_sig,
    taker_sig: takerSig,
  };
  await postRecord(trade);
  $("#offerDialog").classList.add("hidden");
  state.selectedOffer = null;
  await refreshSnapshot(true);
  showToast(t("tradePosted"));
}

async function reviewPastedOffer() {
  const record = parseRecord($("#offerPaste").value);
  if (!record || !await verifyOfferRecord(record)) throw new Error(t("invalidOffer"));
  openOfferDialog(record);
}

async function copyOffer(id) {
  const offer = state.snapshot?.offers.find(({ record }) => record.terms.id === id);
  if (!offer) return;
  await navigator.clipboard.writeText(compact(offer.record));
  showToast(t("copied"));
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  $$('[data-view-target]').forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === name));
  $(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function updateCountdown() {
  const opening = new Date(CONTEST.opening).getTime();
  const now = Date.now();
  if (now < opening) return;
  const elapsed = now - opening;
  const next = opening + (Math.floor(elapsed / 300_000) + 1) * 300_000;
  const remaining = Math.max(0, next - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  $("#sweepCountdown").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (state.snapshot) {
    $("#priceAge").textContent = relativeTime(state.snapshot.market.priceTs);
    $("#lastUpdated").textContent = relativeTime(state.snapshot.generatedAt);
  }
}

function bindEvents() {
  $$('[data-view-target]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $$('[data-language]').forEach((button) => button.addEventListener("click", () => {
    state.language = button.dataset.language;
    localStorage.setItem("close-call-language", state.language);
    applyLanguage();
  }));
  $("#mobileMenu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  $("#keyFile").addEventListener("change", async (event) => { try { if (event.target.files[0]) await importKeyFile(event.target.files[0]); } catch (error) { showToast(error.message); } });
  $("#forgetButton").addEventListener("click", forgetKey);
  $("#refreshButton").addEventListener("click", () => refreshSnapshot(true));
  $("#registerButton").addEventListener("click", () => registerOwner().catch((error) => showToast(error.message)));
  $("#confirmRegisteredButton").addEventListener("click", () => { try { confirmPreviousRegistration(); } catch (error) { showToast(error.message); } });
  $$('[data-side]').forEach((button) => button.addEventListener("click", () => {
    state.side = button.dataset.side;
    $$('[data-side]').forEach((item) => item.classList.toggle("active", item === button));
    renderOrderPreview();
  }));
  ["#offerPrice", "#offerQty", "#offerDuration"].forEach((selector) => $(selector).addEventListener("input", () => { if (selector === "#offerPrice") $(selector).dataset.touched = "1"; renderOrderPreview(); }));
  $("#takerMode").addEventListener("change", () => $("#specificTakerField").classList.toggle("hidden", $("#takerMode").value !== "specific"));
  $("#publishOfferButton").addEventListener("click", () => publishOffer().catch((error) => showToast(error.message)));
  $$('[data-offer-filter]').forEach((button) => button.addEventListener("click", () => {
    state.offerFilter = button.dataset.offerFilter;
    $$('[data-offer-filter]').forEach((item) => item.classList.toggle("active", item === button));
    renderOffers();
    if (window.lucide) window.lucide.createIcons();
  }));
  $("#offerList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-take]");
    if (!button) return;
    const offer = state.snapshot?.offers.find(({ record }) => record.terms.id === button.dataset.take);
    try { if (offer) openOfferDialog(offer); } catch (error) { showToast(error.message); }
  });
  $("#myOffers").addEventListener("click", (event) => { const button = event.target.closest("[data-copy]"); if (button) copyOffer(button.dataset.copy).catch((error) => showToast(error.message)); });
  $("#reviewOfferButton").addEventListener("click", () => reviewPastedOffer().catch((error) => showToast(error.message)));
  $("#closeDialog").addEventListener("click", () => $("#offerDialog").classList.add("hidden"));
  $("#offerDialog").addEventListener("click", (event) => { if (event.target === $("#offerDialog")) $("#offerDialog").classList.add("hidden"); });
  $("#acceptOfferButton").addEventListener("click", () => acceptSelectedOffer().catch((error) => showToast(error.message)));
}

bindEvents();
applyLanguage();
refreshSnapshot();
setInterval(updateCountdown, 1000);
setInterval(() => refreshSnapshot(false), 15_000);
updateCountdown();
