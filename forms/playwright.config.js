// Playwright config — real-browser testing for @zoijs/forms.
//
// Serves the repository root (no build step) so the examples' import maps can
// resolve @zoijs/core, @zoijs/action, and @zoijs/forms from local source.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: true,
  reporter: "list",
  // Absorb transient CI flakiness (cold server start, first module fetch).
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
