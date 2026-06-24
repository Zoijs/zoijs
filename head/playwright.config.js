// Playwright config — real-browser testing for @zoijs/head.
//
// Serves the repository root (no build step) so the examples' import maps can
// resolve @zoijs/core, @zoijs/router, and @zoijs/head from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3300",
  },
  webServer: {
    command: "npx serve -l 3300 ..",
    url: "http://localhost:3300",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
