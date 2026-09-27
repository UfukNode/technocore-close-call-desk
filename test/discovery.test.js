"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRoomScheduler } = require("../lib/discovery");

test("discovery stays inside its request budget and always scans core rooms", () => {
  const scheduler = createRoomScheduler(["close1", "close1-offers"], 5);
  const rooms = ["close1", "close1-offers", "desk-a", "desk-b", "desk-c", "desk-d", "desk-e", "desk-f"];

  for (let index = 0; index < 4; index += 1) {
    const batch = scheduler.next(rooms);
    assert.equal(batch.length, 5);
    assert.deepEqual(batch.slice(0, 2), ["close1", "close1-offers"]);
  }
});

test("discovery rotates through every registered room", () => {
  const scheduler = createRoomScheduler(["close1", "close1-offers"], 4);
  const rooms = ["close1", "close1-offers", "desk-a", "desk-b", "desk-c", "desk-d", "desk-e"];
  const scanned = new Set();

  for (let index = 0; index < 3; index += 1) {
    for (const room of scheduler.next(rooms)) scanned.add(room);
  }

  assert.deepEqual([...scanned].sort(), [...rooms].sort());
});

test("discovery de-duplicates rooms without dropping the fixed market rooms", () => {
  const scheduler = createRoomScheduler(["close1", "close1-offers"], 4);
  assert.deepEqual(
    scheduler.next(["close1", "desk-a", "desk-a", "close1-offers"]),
    ["close1", "close1-offers", "desk-a"],
  );
});
