"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e.js",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5192",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node server.js 5192",
    url: "http://127.0.0.1:5192/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
