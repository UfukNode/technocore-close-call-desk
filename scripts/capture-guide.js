"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.CLOSE_CALL_URL || "http://127.0.0.1:5192";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buffer) {
  let number = BigInt(`0x${Buffer.from(buffer).toString("hex")}`);
  let output = "";
  while (number > 0n) {
    output = BASE58[Number(number % 58n)] + output;
    number /= 58n;
  }
  for (const byte of buffer) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output || "1";
}

function createKeyFile() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  const prefixedKey = Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(publicJwk.x, "base64url")]);
  const did = `did:key:z${base58Encode(prefixedKey)}`;
  return { did, payload: { did, privateKeyJwk: privateJwk } };
}

function baseSnapshot() {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    launch: { verified: true },
    market: {
      price: { t: "price", for: 3, ref: { px: "225.67" }, limits: ["214.39", "236.95"], global: "225.67" },
      priceTs: now,
      flow: { t: "flow", n: 2, mints: [], settled: [], void: [] },
      flowTs: now,
      state: { t: "state", owners: 12 },
      positions: { t: "positions", open: "842.50", longs: 7, shorts: 5, top: [] },
      pnl: { t: "pnl", top: [] },
    },
    registrations: [],
    minted: [],
    offers: [],
    trades: [],
  };
}

function offerRecord(maker, overrides = {}) {
  return {
    t: "close-call.offer.v1",
    season: "close-1",
    terms: {
      id: overrides.id || "call-guide-001",
      maker,
      px: overrides.px || "226.40",
      qty: overrides.qty || "1.25",
      side: overrides.side || "buy",
      taker: overrides.taker || "any",
      until: overrides.until || 9,
    },
    maker_sig: "A".repeat(86),
  };
}

async function highlight(page, selector) {
  await page.evaluate((target) => {
    document.querySelectorAll("[data-guide-highlight]").forEach((node) => {
      node.style.removeProperty("outline");
      node.style.removeProperty("outline-offset");
      node.style.removeProperty("box-shadow");
      node.removeAttribute("data-guide-highlight");
    });
    const node = document.querySelector(target);
    if (!node) return;
    node.dataset.guideHighlight = "true";
    node.style.setProperty("outline", "3px solid #f4b942", "important");
    node.style.setProperty("outline-offset", "4px", "important");
    node.style.setProperty("box-shadow", "0 0 0 7px rgba(244,185,66,.16)", "important");
  }, selector);
}

async function saveScreenshot(page, outputPath) {
  await page.evaluate(() => document.querySelector("#toast")?.classList.remove("show"));
  await page.waitForTimeout(100);
  await page.screenshot({ path: outputPath, fullPage: true });
}

async function captureLanguage(browser, language) {
  const key = createKeyFile();
  const opponent = createKeyFile();
  const outputDir = path.join(ROOT, "assets", language);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  let snapshot = baseSnapshot();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.route("**/api/snapshot*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: snapshot }),
  }));
  await page.route("**/api/post", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { posted: true } }),
  }));

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator(`[data-language="${language}"]`).click();
  await highlight(page, ".file-button");
  await saveScreenshot(page, path.join(outputDir, "01-import-did.png"));

  await page.locator("#keyFile").setInputFiles({
    name: "technocore-private-key.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(key.payload)),
  });
  await page.locator('[data-view-target="desk"]').click();
  await highlight(page, "#registerButton");
  await saveScreenshot(page, path.join(outputDir, "02-register.png"));

  snapshot = baseSnapshot();
  snapshot.registrations = [{ did: key.did, ts: "2026-09-25T12:05:00.000Z" }];
  snapshot.minted = [key.did];
  snapshot.market.state.owners = 13;
  snapshot.market.positions.top = [[key.did, "1.25 LONG"]];
  snapshot.market.pnl.top = [[key.did, "10,084.20"]];
  await page.locator("#refreshButton").click();
  await page.locator('[data-view-target="predict"]').click();
  await page.locator('[data-side="sell"]').click();
  await page.locator("#offerPrice").fill("224.80");
  await page.locator("#offerQty").fill("1.50");
  await highlight(page, "#publishOfferButton");
  await saveScreenshot(page, path.join(outputDir, "03-make-call.png"));

  const publicOffer = offerRecord(opponent.did, { id: "public-call-218", side: "sell", px: "224.90", qty: "2.00" });
  snapshot.offers = [{ record: publicOffer, ts: "2026-09-25T12:09:00.000Z" }];
  await page.locator("#refreshButton").click();
  await page.locator('[data-view-target="market"]').click();
  await page.locator('[data-take="public-call-218"]').click();
  await highlight(page, "#acceptOfferButton");
  await saveScreenshot(page, path.join(outputDir, "04-accept-call.png"));
  await page.locator("#closeDialog").click();

  await page.locator('[data-view-target="desk"]').click();
  await page.locator("#offerPaste").fill(JSON.stringify(publicOffer));
  await highlight(page, ".import-panel");
  await saveScreenshot(page, path.join(outputDir, "05-accept-shared-json.png"));

  const ownOffer = offerRecord(key.did, { id: "my-call-042", px: "226.10", qty: "1.50", side: "buy" });
  const settledTrade = {
    ...ownOffer,
    t: "trade",
    taker: opponent.did,
    taker_sig: "B".repeat(86),
  };
  snapshot.offers = [{ record: ownOffer, ts: "2026-09-25T12:08:00.000Z" }];
  snapshot.trades = [{ record: settledTrade, status: "settled", ts: "2026-09-25T12:10:00.000Z" }];
  snapshot.market.flow.settled = ["my-call-042"];
  await page.locator("#refreshButton").click();
  await page.locator('[data-view-target="desk"]').click();
  await highlight(page, ".desk-layout");
  await saveScreenshot(page, path.join(outputDir, "06-follow-results.png"));

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await captureLanguage(browser, "en");
    await captureLanguage(browser, "tr");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
