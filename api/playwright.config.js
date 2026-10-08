// Playwright config — real-browser testing for @zoijs/api.
//
// Serves the repository root (no build step) so the examples' import maps can
// resolve @zoijs/core, @zoijs/resource and @zoijs/api from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  // Absorb transient CI flakiness (cold server start, first module fetch).
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3900",
  },
  webServer: {
    command: "node ../scripts/test-server.mjs .. 3900",
    url: "http://127.0.0.1:3900/__ready",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
