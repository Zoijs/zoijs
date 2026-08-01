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
    baseURL: "http://localhost:3700",
  },
  webServer: {
    command: "npx serve -l 3700 ..",
    url: "http://localhost:3700",
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
