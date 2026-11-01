// Playwright config — real-browser testing for @zoijs/sanitize.
//
// Serves the repository root (no build step) so the example's import map can
// resolve @zoijs/core, @zoijs/core/server, and @zoijs/sanitize from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3800",
  },
  webServer: {
    command: "node ../scripts/test-server.mjs .. 3800",
    url: "http://127.0.0.1:3800/__ready",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
