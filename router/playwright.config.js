// Playwright config — real-browser testing for @zoijs/router.
//
// Serves the repository root (no build step) so the example's import map can
// resolve both @zoijs/core and @zoijs/router from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  // Absorb transient CI flakiness (cold server start, first module fetch).
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "npx serve -l 3100 ..",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
