"use strict";

const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");

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

function testKeyFile() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  const did = `did:key:z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(publicJwk.x, "base64url")]))}`;
  return {
    did,
    payload: { did, privateKeyJwk: privateJwk },
    sign: (payload) => crypto.sign(null, Buffer.from(payload), privateKey).toString("base64url"),
  };
}

const SNAPSHOT = {
  generatedAt: "2026-09-25T12:10:00.000Z",
  launch: { verified: true },
  market: {
    price: { t: "price", for: 3, ref: { px: "225.67" }, limits: ["214.39", "236.95"], global: "225.67" },
    priceTs: "2026-09-25T12:10:00.000Z",
    flow: { t: "flow", n: 2, mints: [], settled: [], void: [] },
    flowTs: "2026-09-25T12:10:00.000Z",
    state: { t: "state", owners: 12 },
    positions: { t: "positions", open: "0", longs: 0, shorts: 0, top: [] },
    pnl: { t: "pnl", top: [] },
  },
  registrations: [],
  minted: [],
  offers: [],
  trades: [],
  visibility: { registrationIncomplete: false, omittedMints: 0, offerRoom: "close1-offers", offerRoomRegistered: true },
};

async function mockSnapshot(page, snapshot = SNAPSHOT, identityOverride = null) {
  await page.route("**/api/snapshot*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: snapshot }),
  }));
  await page.route("**/api/identity*", (route) => {
    const did = new URL(route.request().url()).searchParams.get("did");
    const identity = identityOverride || {
      did,
      registration: snapshot.registrations.find((item) => item.did === did) || null,
      minted: snapshot.minted.includes(did),
      offers: snapshot.offers.filter(({ record }) => record.terms.maker === did),
      trades: snapshot.trades.filter(({ record }) => record.terms.maker === did || record.taker === did),
      historyIncomplete: snapshot.visibility.registrationIncomplete,
    };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: identity }) });
  });
}

async function importKey(page, key) {
  await page.locator("#keyFile").setInputFiles({
    name: "test-private-key.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(key.payload)),
  });
}

test("loads verified live market and keeps layout inside the viewport", async ({ page }) => {
  await mockSnapshot(page);
  await page.goto("/");
  await expect(page.locator("#launchBadge")).toContainText(/Canlı ve doğrulandı|Live and verified/, { timeout: 20_000 });
  await expect(page.locator(".brand-mark")).toHaveJSProperty("naturalWidth", 400);
  await expect(page.locator("#referencePrice")).not.toHaveText("-");
  await expect(page.locator("#priceLimits")).not.toHaveText("-");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile navigation and prediction ticket work", async ({ page }) => {
  await mockSnapshot(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#mobileMenu").click();
  await expect(page.locator(".sidebar")).toHaveClass(/open/);
  await page.locator('[data-view-target="predict"]').click();
  await expect(page.locator('[data-view="predict"]')).toHaveClass(/active/);
  await expect(page.locator("#offerPrice")).not.toHaveValue("");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("imports a key locally without posting and enables registration", async ({ page }) => {
  const key = testKeyFile();
  await mockSnapshot(page);
  await page.goto("/");
  await expect(page.locator("#launchBadge")).toContainText(/Canlı ve doğrulandı|Live and verified/, { timeout: 20_000 });
  await importKey(page, key);
  await expect(page.locator("#identityDid")).toHaveText(key.did);
  await page.locator('[data-view-target="predict"]').click();
  await expect(page.locator("#predictSignerDid")).toHaveText(key.did);
  await expect(page.locator("#predictSignerName")).not.toHaveText(/bağlı değil|not connected/i);
  await expect(page.locator("#predictSignerBadge")).toContainText(/Önce DID'ini yarışmaya kaydet|Register your DID in the contest first/);
  await page.locator('[data-view-target="desk"]').click();
  await expect(page.locator("#registerButton")).toBeEnabled();
});

test("does not mislabel an older registration when public mint lists are incomplete", async ({ page }) => {
  const key = testKeyFile();
  await mockSnapshot(page, { ...SNAPSHOT, visibility: { registrationIncomplete: true, omittedMints: 1441, offerRoom: "close1-offers" } });
  await page.goto("/");
  await importKey(page, key);
  await page.locator('[data-view-target="predict"]').click();
  await expect(page.locator("#predictSignerBadge")).toContainText(/Kayıt geçmişi eksik|Registration history incomplete/);
  await page.locator('[data-view-target="desk"]').click();
  await expect(page.locator("#registrationNotice")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#confirmRegisteredButton")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator("#confirmRegisteredButton").click();
  await expect(page.locator("#registrationStatus")).toContainText(/Hazır|Ready/);
  await page.locator("#mobileMenu").click();
  await page.locator('[data-view-target="predict"]').click();
  await expect(page.locator("#publishOfferButton")).toBeEnabled();
});

test("publishes new maker offers to the dedicated signed offer room", async ({ page }) => {
  const key = testKeyFile();
  const readySnapshot = {
    ...SNAPSHOT,
    registrations: [{ did: key.did, ts: "2026-09-25T12:05:00.000Z" }],
    minted: [key.did],
    visibility: { registrationIncomplete: true, omittedMints: 1441, offerRoom: "close1-offers", offerRoomRegistered: false },
  };
  const posts = [];
  await mockSnapshot(page, readySnapshot);
  await page.route("**/api/post", async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { posted: 1 } }) });
  });
  await page.goto("/");
  await importKey(page, key);
  await page.locator('[data-view-target="predict"]').click();
  await page.locator("#publishOfferButton").click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts.map(({ room }) => room)).toEqual(["close1", "close1-offers"]);
  expect(posts.map(({ text }) => JSON.parse(text).t)).toEqual(["room", "close-call.offer.v1"]);
});

test("keeps an accepted trade on the desk when close1 traffic buries it", async ({ page }) => {
  const maker = testKeyFile();
  const taker = testKeyFile();
  const terms = { id: "accepted-call-1", maker: maker.did, px: "225.67", qty: "1", side: "buy", taker: "any", until: 9 };
  const offer = {
    t: "close-call.offer.v1",
    season: "close-1",
    terms,
    maker_sig: maker.sign(`close-1|terms|${JSON.stringify(terms)}`),
  };
  const staleSnapshot = {
    ...SNAPSHOT,
    registrations: [{ did: taker.did, ts: "2026-09-25T12:05:00.000Z" }],
    minted: [taker.did],
    offers: [{ record: offer, ts: "2026-09-25T12:09:00.000Z" }],
    visibility: { registrationIncomplete: true, omittedMints: 1441, offerRoom: "close1-offers", offerRoomRegistered: true },
  };
  const posts = [];
  await mockSnapshot(page, staleSnapshot);
  await page.route("**/api/post", async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { posted: 1 } }) });
  });
  await page.goto("/");
  await importKey(page, taker);
  await page.locator(`[data-take="${terms.id}"]`).click();
  await page.locator("#acceptOfferButton").click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts.map(({ room }) => room)).toEqual(["close1-offers"]);
  expect(posts.every(({ text }) => JSON.parse(text).t === "trade")).toBe(true);
  await page.locator('[data-view-target="desk"]').click();
  await expect(page.locator("#myTrades")).toContainText(terms.id);
  await page.locator("#refreshButton").click();
  await expect(page.locator("#myTrades")).toContainText(terms.id);
  await page.locator('[data-view-target="market"]').click();
  await expect(page.locator(`[data-take="${terms.id}"]`)).toHaveCount(0);
});

test("restores a maker's accepted trade from DID history after import", async ({ page }) => {
  const maker = testKeyFile();
  const taker = testKeyFile();
  const terms = { id: "maker-history-1", maker: maker.did, px: "225.67", qty: "1", side: "sell", taker: "any", until: 9 };
  const trade = {
    t: "trade",
    season: "close-1",
    terms,
    taker: taker.did,
    maker_sig: maker.sign(`close-1|terms|${JSON.stringify(terms)}`),
    taker_sig: taker.sign(`close-1|accept|${JSON.stringify(terms)}|${taker.did}`),
  };
  await mockSnapshot(page, SNAPSHOT, {
    did: maker.did,
    registration: { did: maker.did, ts: "2026-09-25T12:05:00.000Z", room: "close1" },
    minted: true,
    offers: [],
    trades: [{ record: trade, status: "settled", reason: "", ts: "2026-09-25T12:09:00.000Z" }],
    historyIncomplete: true,
  });

  await page.goto("/");
  await importKey(page, maker);
  await page.locator('[data-view-target="desk"]').click();
  await expect(page.locator("#registrationStatus")).toContainText(/Hazır|Ready/);
  await expect(page.locator("#myTrades")).toContainText(terms.id);
  await expect(page.locator("#myTrades")).toContainText(/Sonuçlandı|Settled/);
});

test("shows retained balance and live score impact for a settled trade", async ({ page }) => {
  const maker = testKeyFile();
  const taker = testKeyFile();
  const terms = { id: "scored-call-1", maker: maker.did, px: "220.00", qty: "1", side: "buy", taker: "any", until: 9 };
  const trade = {
    t: "trade",
    season: "close-1",
    terms,
    taker: taker.did,
    maker_sig: maker.sign(`close-1|terms|${JSON.stringify(terms)}`),
    taker_sig: taker.sign(`close-1|accept|${JSON.stringify(terms)}|${taker.did}`),
  };
  const readySnapshot = {
    ...SNAPSHOT,
    registrations: [{ did: maker.did, ts: "2026-09-25T12:05:00.000Z" }],
    minted: [maker.did],
  };
  await mockSnapshot(page, readySnapshot, {
    did: maker.did,
    registration: readySnapshot.registrations[0],
    minted: true,
    offers: [],
    trades: [{
      record: trade,
      status: "settled",
      reason: "",
      ts: "2026-09-25T12:09:00.000Z",
      metrics: { settledSweep: 2, settlementPrice: 225, fee: 2.2, estimatedFee: false, scoreDelta: 3.47, result: "profit" },
    }],
    account: {
      available: 9777.8,
      collateral: 220,
      position: 1,
      score: 3.47,
      officialPosition: null,
      officialScore: null,
      scoreSource: "retained_history",
      balanceSource: "retained_history",
      incomplete: false,
    },
    historyIncomplete: false,
  });

  await page.goto("/");
  await importKey(page, maker);
  await page.locator('[data-view-target="desk"]').click();
  await expect(page.locator("#currentBalance")).toContainText("9");
  await expect(page.locator("#tiedCollateral")).toContainText("220");
  await expect(page.locator("#myScore")).toContainText("3");
  await expect(page.locator("#myTrades")).toContainText(/Şu an kazanıyor|Winning now/);
  await expect(page.locator("#myTrades")).toContainText(/Canlı skor etkisi|Live score impact/);
});
