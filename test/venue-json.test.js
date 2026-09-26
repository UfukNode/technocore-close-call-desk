"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseVenueJson } = require("../lib/venue-json");

test("preserves a 19-digit Technocore nonce exactly", () => {
  const message = parseVenueJson('{"from":"did:key:test","nonce":1234567890123456789,"text":"hello"}');
  assert.equal(message.nonce, "1234567890123456789");
});

test("does not rewrite nonce-looking text inside a JSON string", () => {
  const message = parseVenueJson('{"nonce":123,"text":"{\\"nonce\\":1234567890123456789}"}');
  assert.equal(message.nonce, 123);
  assert.equal(message.text, '{"nonce":1234567890123456789}');
});
