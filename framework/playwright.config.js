// Playwright config — real-browser testing for Zoijs.
//
// Serves the framework root (no build step) and runs the example smoke tests +
// browser regression tests in Chromium, Firefox, and WebKit.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  globalSetup: "./browser-tests/global-setup.js", // second physical core copy for csp.spec.js
  fullyParallel: true,
  reporter: "list",
  // Absorb transient CI flakiness (cold server start, first module fetch).
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:7310",
  },
  webServer: {
    command: "node ../scripts/test-server.mjs . 7310",
    url: "http://127.0.0.1:7310/__ready",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
