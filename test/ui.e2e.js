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
  return { did, payload: { did, privateKeyJwk: privateJwk } };
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
};

async function mockSnapshot(page, snapshot = SNAPSHOT) {
  await page.route("**/api/snapshot*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: snapshot }),
  }));
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
    visibility: { registrationIncomplete: true, omittedMints: 1441, offerRoom: "close1-offers" },
  };
  let postedBody;
  await mockSnapshot(page, readySnapshot);
  await page.route("**/api/post", async (route) => {
    postedBody = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data: { posted: 1 } }) });
  });
  await page.goto("/");
  await importKey(page, key);
  await page.locator('[data-view-target="predict"]').click();
  await page.locator("#publishOfferButton").click();
  await expect.poll(() => postedBody?.room).toBe("close1-offers");
  expect(JSON.parse(postedBody.text).t).toBe("close-call.offer.v1");
});
