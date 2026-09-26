"use strict";

// Technocore permits 19-digit nonces and may serialize them as JSON numbers.
// Quote only nonce number tokens before parsing so signature verification keeps
// the exact decimal text on Node versions without JSON.parse context.source.
function preserveNonce(raw) {
  return String(raw).replace(/("nonce"\s*:\s*)([0-9]{16,19})(?=\s*[,}])/g, '$1"$2"');
}

function parseVenueJson(raw) {
  return JSON.parse(preserveNonce(raw));
}

module.exports = { parseVenueJson, preserveNonce };
