"use strict";

function createRoomScheduler(coreRooms, batchSize) {
  const core = [...new Set(coreRooms)];
  if (!Number.isSafeInteger(batchSize) || batchSize < core.length) {
    throw new Error("Discovery batch must fit every core room.");
  }
  let cursor = 0;

  return {
    next(rooms) {
      const all = [...new Set([...core, ...(rooms || [])])];
      const extras = all.filter((room) => !core.includes(room));
      const extraCount = Math.min(batchSize - core.length, extras.length);
      const selected = [];

      for (let index = 0; index < extraCount; index += 1) {
        selected.push(extras[(cursor + index) % extras.length]);
      }
      cursor = extras.length ? (cursor + extraCount) % extras.length : 0;
      return [...core, ...selected];
    },
  };
}

module.exports = { createRoomScheduler };
